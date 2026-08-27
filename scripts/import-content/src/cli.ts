#!/usr/bin/env node

import path from "node:path";

import { executeDatabaseImport } from "./database.js";
import { printValidationSummary, writeJsonReport, writeValidationReport } from "./report.js";
import { buildImportPlan } from "./source.js";
import { printStorageSummary, runStoragePipeline } from "./storage.js";

interface CliOptions {
  source: string;
  reportPath: string;
  mode: "dry-run" | "execute";
  operation: "database" | "storage";
}

const importerDirectory = path.resolve(process.cwd(), "scripts", "import-content");
const defaultReportPath = path.join(importerDirectory, "reports", "import-validation-report.json");
const defaultStorageReportPath = path.join(importerDirectory, "reports", "storage-upload-report.json");

function usage(): string {
  return [
    "Vital Collective content importer",
    "",
    "Usage:",
    "  npm run content:import -- --dry-run --source <source-folder> [--report <report.json>]",
    "  npm run content:import -- --execute --source <source-folder> [--report <report.json>]",
    "  npm run content:import -- --upload-storage --dry-run --source <source-folder> [--report <report.json>]",
    "  npm run content:import -- --upload-storage --execute --source <source-folder> [--report <report.json>]",
    "",
    "Safety:",
    "  Dry-run is the default and never creates a Supabase client or changes storage/database state.",
    "  Database import and storage upload are separate; PDFs upload only with --upload-storage --execute.",
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
  let reportPath: string | undefined;
  let mode: "dry-run" | "execute" = "dry-run";
  let operation: "database" | "storage" = "database";
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
    if (argument === "--upload-storage") {
      operation = "storage";
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
  return {
    source,
    reportPath: reportPath ?? (operation === "storage" ? defaultStorageReportPath : defaultReportPath),
    mode,
    operation,
  };
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

  if (options.operation === "storage") {
    console.log(
      options.mode === "dry-run"
        ? "Mode: STORAGE DRY RUN (no bucket, object, or database changes)"
        : "Mode: STORAGE EXECUTE (explicit bucket/object/storage_path operation)",
    );
  } else {
    console.log(options.mode === "dry-run" ? "Mode: DRY RUN (no database or storage changes)" : "Mode: EXECUTE (database rows only; no storage uploads)");
  }
  const plan = await buildImportPlan(options.source, options.mode);
  if (options.operation === "storage") {
    const storageReport = await runStoragePipeline(plan, options.mode);
    const reportPath = await writeJsonReport(storageReport, options.reportPath);
    printStorageSummary(storageReport, reportPath);
    if (storageReport.status === "FAIL") process.exitCode = 1;
    return;
  }
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
