import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ValidationReport } from "./types.js";

export async function writeJsonReport(report: unknown, outputPath: string): Promise<string> {
  const resolvedPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return resolvedPath;
}

export async function writeValidationReport(report: ValidationReport, outputPath: string): Promise<string> {
  return writeJsonReport(report, outputPath);
}

export function printValidationSummary(report: ValidationReport, reportPath: string): void {
  const duplicateIdCount = report.duplicates.activityIds.length + report.duplicates.resourceIds.length;
  console.log(`Activities: ${report.counts.activities}`);
  console.log(`Resources: ${report.counts.resources}`);
  console.log(`Relationships: ${report.counts.relationships}`);
  console.log(`PDFs: ${report.counts.pdfs}`);
  console.log(`Broken references: ${report.brokenReferences.length}`);
  console.log(`Duplicate IDs: ${duplicateIdCount}`);
  console.log(`Filename mismatches: ${report.filenameMismatches.length}`);
  console.log(`Page-count mismatches: ${report.pageCountMismatches.length}`);
  console.log(
    `Setting audit: ${report.activityEnvironmentAudit.repeatedOutdoorOnlyRows} repeated outdoor-only source rows; ` +
    `${report.activityEnvironmentAudit.neutralizedForManualReview} mapped to neutral for review`,
  );
  console.log(
    `Environment/content audit: ${report.environmentContentConsistencyAudit.definiteContradictions.length} definite; ` +
    `${report.environmentContentConsistencyAudit.manualReview.length} manual-review cases`,
  );
  console.log(
    `Printable states: ${report.activityResourceStateAudit.withAvailablePrintable} available; ` +
    `${report.activityResourceStateAudit.noPrintableRequired} not required; ` +
    `${report.activityResourceStateAudit.missingOrBrokenPrintable} missing/broken`,
  );
  console.log(`Validation: ${report.status}`);
  console.log(`Report: ${reportPath}`);
}
