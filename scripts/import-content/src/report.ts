import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ValidationReport } from "./types.js";

export async function writeValidationReport(report: ValidationReport, outputPath: string): Promise<string> {
  const resolvedPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return resolvedPath;
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
  console.log(`Validation: ${report.status}`);
  console.log(`Report: ${reportPath}`);
}
