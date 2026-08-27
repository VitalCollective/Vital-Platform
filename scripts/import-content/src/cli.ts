#!/usr/bin/env node

import path from "node:path";

import { executeDatabaseImport } from "./database.js";
import { printValidationSummary, writeValidationReport } from "./report.js";
import { buildImportPlan } from "./source.js";

interface CliOptions {
  source: string;
  reportPath: string;
  mode: "dry-run" | "execute";
}

const importerDirectory = path.resolve(process.cwd(), "scripts", "import-content");
const defaultReportPath = path.join(importerDirectory, "reports", "import-validation-report.json");

function usage(): string {
  return [
    "Vital Collective content importer",
    "",
    "Usage:",
    "  npm run content:import -- --dry-run --source <source-folder> [--report <report.json>]",
    "  npm run content:import -- --execute --source <source-folder> [--report <report.json>]",
    "",
    "Safety:",
    "  Dry-run is the default and never creates a Supabase client or changes storage.",
    "  Execute mode imports database rows only; it does not upload PDFs.",
  ].join("\n");
}

function parseArguments(args: string[]): CliOptions | null {
  // npm on Windows can forward a quoted, space-containing argument as one value
  // wrapped in literal caret escapes. Only unwrap that exact whole-argument form.
  args = args.map((argument) =>
    argument.startsWith("^") && argument.endsWith("^")
      ? argument.slice(1, -1).replaceAll("^", "")
      : argument,
  );
  let source: string | undefined;
  let reportPath = defaultReportPath;
  let mode: "dry-run" | "execute" = "dry-run";
  let sawDryRun = false;
  let sawExecute = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") return null;
    if (argument === "--dry-run") {
      sawDryRun = true;
      mode = "dry-run";
      continue;
    }
    if (argument === "--execute") {
      sawExecute = true;
      mode = "execute";
      continue;
    }
    if (argument === "--source" || argument === "--report") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--source") source = value;
      else reportPath = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--source=")) {
      source = argument.slice("--source=".length);
      continue;
    }
    if (argument.startsWith("--report=")) {
      reportPath = argument.slice("--report=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (sawDryRun && sawExecute) throw new Error("Choose either --dry-run or --execute, not both.");
  if (!source?.trim()) throw new Error("--source is required.");
  return { source, reportPath, mode };
}

async function main(): Promise<void> {
  let options: CliOptions | null;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (!options) {
    console.log(usage());
    return;
  }

  console.log(options.mode === "dry-run" ? "Mode: DRY RUN (no database or storage changes)" : "Mode: EXECUTE (database rows only; no storage uploads)");
  const plan = await buildImportPlan(options.source, options.mode);
  const reportPath = await writeValidationReport(plan.report, options.reportPath);
  printValidationSummary(plan.report, reportPath);

  if (!plan.report.readyToImport) {
    process.exitCode = 1;
    return;
  }
  if (options.mode === "execute") {
    const result = await executeDatabaseImport(plan);
    console.log(`Imported: ${result.resources} resources, ${result.activities} activities, ${result.relationships} relationships.`);
    console.log(
      `Verified in database: ${result.verification.verified.resources} resources, ` +
      `${result.verification.verified.activities} activities, ` +
      `${result.verification.verified.relationships} relationships (${result.verification.status}).`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
