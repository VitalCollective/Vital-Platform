import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { EXPECTED_COUNTS } from "./constants.js";
import type {
  ImportPlan,
  ResourceAsset,
  ResourceRow,
  ValidationDetail,
} from "./types.js";

export const STORAGE_BUCKET_NAME = "vital-resources";
const DATABASE_BATCH_SIZE = 100;

export interface StoragePlanItem extends ResourceAsset {
  storagePath: string;
}

export interface StoragePlanValidation {
  status: "PASS" | "FAIL";
  items: StoragePlanItem[];
  missingResources: string[];
  missingPdfs: string[];
  filenameMismatches: ValidationDetail[];
  pathCollisions: string[];
  brokenPaths: ValidationDetail[];
  errors: ValidationDetail[];
}

export interface RemoteObjectDescriptor {
  path: string;
  size: number | null;
  sha256: string | null;
}

export interface ResourceStorageRow {
  id: string;
  pdf_filename: string | null;
  storage_path: string | null;
}

export interface StorageVerificationResult {
  performed: boolean;
  status: "PASS" | "FAIL" | "NOT_RUN";
  bucketPrivate: boolean | null;
  objectsVerified: number;
  databaseRowsVerified: number;
  missingObjects: string[];
  missingDatabaseRows: string[];
  filenameMismatches: ValidationDetail[];
  pathMismatches: ValidationDetail[];
  sizeMismatches: ValidationDetail[];
  hashMismatches: ValidationDetail[];
  duplicateRemotePaths: string[];
}

export type UploadDecision = "upload" | "skip" | "replace";

export interface StorageUploadAction {
  resourceId: string;
  canonicalFilename: string;
  storagePath: string;
  size: number;
  sha256: string;
  decision: "inspect" | UploadDecision;
}

export interface StorageUploadReport {
  generatedAt: string;
  mode: "dry-run" | "execute";
  status: "PASS" | "FAIL";
  sourceRoot: string;
  resolvedSourceRoot: string;
  bucket: {
    name: string;
    intendedPrivate: true;
    action: "simulate-detect-create-or-secure" | "created" | "secured" | "unchanged" | "not-run";
    verifiedPrivate: boolean | null;
  };
  counts: {
    expectedResources: number;
    sourceResources: number;
    expectedPdfs: number;
    sourcePdfs: number;
    canonicalPaths: number;
    plannedObjectChecks: number;
    plannedStoragePathUpdates: number;
    uploaded: number;
    skippedAsIdentical: number;
    replaced: number;
    storagePathsUpdated: number;
  };
  missingResources: string[];
  missingPdfs: string[];
  filenameMismatches: ValidationDetail[];
  pathMismatches: ValidationDetail[];
  pathCollisions: string[];
  databasePreflight: {
    performed: boolean;
    status: "PASS" | "FAIL" | "NOT_RUN";
    rowsFound: number;
    missingResourceIds: string[];
    filenameMismatches: ValidationDetail[];
  };
  actions: StorageUploadAction[];
  remoteVerification: StorageVerificationResult;
  warnings: string[];
  errors: ValidationDetail[];
}

function duplicateValues(values: string[]): string[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const value of values) {
    const key = value.toLowerCase();
    const current = counts.get(key) ?? { display: value, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].filter(({ count }) => count > 1).map(({ display }) => display).sort();
}

function normalizeHash(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-F0-9]{64}$/.test(normalized) ? normalized : null;
}

export function canonicalStoragePath(resourceId: string, canonicalFilename: string): string {
  if (!/^R\d{3}$/.test(resourceId)) {
    throw new Error(`Invalid canonical resource ID: ${resourceId || "(empty)"}.`);
  }
  if (
    !canonicalFilename ||
    canonicalFilename !== canonicalFilename.trim() ||
    canonicalFilename.includes("/") ||
    canonicalFilename.includes("\\") ||
    canonicalFilename === "." ||
    canonicalFilename === ".." ||
    !canonicalFilename.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error(`Invalid canonical PDF filename for ${resourceId}: ${canonicalFilename || "(empty)"}.`);
  }
  return `resources/${resourceId}/${canonicalFilename}`;
}

export function buildStoragePlan(
  resources: Array<Pick<ResourceRow, "id" | "pdf_filename">>,
  assets: ResourceAsset[],
): StoragePlanValidation {
  const errors: ValidationDetail[] = [];
  const missingResources: string[] = [];
  const missingPdfs: string[] = [];
  const filenameMismatches: ValidationDetail[] = [];
  const brokenPaths: ValidationDetail[] = [];
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const assetsByResource = new Map<string, ResourceAsset[]>();
  for (const asset of assets) {
    const matches = assetsByResource.get(asset.resourceId) ?? [];
    matches.push(asset);
    assetsByResource.set(asset.resourceId, matches);
    if (!resourcesById.has(asset.resourceId)) missingResources.push(asset.resourceId);
  }

  const items: StoragePlanItem[] = [];
  for (const resource of resources) {
    const matchingAssets = assetsByResource.get(resource.id) ?? [];
    if (matchingAssets.length === 0) {
      missingPdfs.push(resource.id);
      continue;
    }
    if (matchingAssets.length > 1) {
      errors.push({
        code: "multiple_resource_assets",
        message: `Resource ${resource.id} resolves to ${matchingAssets.length} PDF assets.`,
        resourceId: resource.id,
        expected: 1,
        actual: matchingAssets.length,
      });
      continue;
    }
    const asset = matchingAssets[0];
    if (asset.canonicalFilename !== resource.pdf_filename) {
      filenameMismatches.push({
        code: "storage_source_filename_mismatch",
        message: "Validated asset filename does not match normalized resource metadata.",
        resourceId: resource.id,
        expected: resource.pdf_filename,
        actual: asset.canonicalFilename,
      });
    }
    try {
      items.push({ ...asset, storagePath: canonicalStoragePath(resource.id, asset.canonicalFilename) });
    } catch (error) {
      brokenPaths.push({
        code: "invalid_storage_path",
        message: error instanceof Error ? error.message : String(error),
        resourceId: resource.id,
        actual: asset.canonicalFilename,
      });
    }
  }

  for (const resourceId of missingResources) {
    errors.push({
      code: "storage_asset_resource_missing",
      message: `PDF asset references missing resource ${resourceId}.`,
      resourceId,
    });
  }
  for (const resourceId of missingPdfs) {
    errors.push({
      code: "storage_pdf_missing",
      message: `Resource ${resourceId} has no validated PDF asset.`,
      resourceId,
    });
  }
  errors.push(...filenameMismatches, ...brokenPaths);

  const pathCollisions = duplicateValues(items.map((item) => item.storagePath));
  for (const storagePath of pathCollisions) {
    errors.push({
      code: "storage_path_collision",
      message: `Multiple resources resolve to canonical storage path ${storagePath}.`,
      actual: storagePath,
    });
  }
  if (resources.length !== EXPECTED_COUNTS.resources) {
    errors.push({
      code: "storage_resource_count_mismatch",
      message: `Expected ${EXPECTED_COUNTS.resources} resources, found ${resources.length}.`,
      expected: EXPECTED_COUNTS.resources,
      actual: resources.length,
    });
  }
  if (assets.length !== EXPECTED_COUNTS.pdfs) {
    errors.push({
      code: "storage_asset_count_mismatch",
      message: `Expected ${EXPECTED_COUNTS.pdfs} validated PDF assets, found ${assets.length}.`,
      expected: EXPECTED_COUNTS.pdfs,
      actual: assets.length,
    });
  }

  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    items: items.sort((left, right) => left.resourceId.localeCompare(right.resourceId)),
    missingResources: [...new Set(missingResources)].sort(),
    missingPdfs: [...new Set(missingPdfs)].sort(),
    filenameMismatches,
    pathCollisions,
    brokenPaths,
    errors,
  };
}

export function decideUpload(
  local: Pick<ResourceAsset, "size" | "sha256">,
  remote: Pick<RemoteObjectDescriptor, "size" | "sha256"> | null,
): UploadDecision {
  if (!remote) return "upload";
  const localHash = normalizeHash(local.sha256);
  const remoteHash = normalizeHash(remote.sha256);
  return remote.size === local.size && localHash !== null && remoteHash === localHash ? "skip" : "replace";
}

export function storagePathUpdates(items: StoragePlanItem[]): Array<{ id: string; storage_path: string }> {
  return items.map((item) => ({ id: item.resourceId, storage_path: item.storagePath }));
}

export function compareStorageVerification(
  items: StoragePlanItem[],
  remoteObjects: RemoteObjectDescriptor[],
  databaseRows: ResourceStorageRow[],
  bucketPrivate: boolean,
): StorageVerificationResult {
  const missingObjects: string[] = [];
  const missingDatabaseRows: string[] = [];
  const filenameMismatches: ValidationDetail[] = [];
  const pathMismatches: ValidationDetail[] = [];
  const sizeMismatches: ValidationDetail[] = [];
  const hashMismatches: ValidationDetail[] = [];
  const duplicateRemotePaths = duplicateValues(remoteObjects.map((remote) => remote.path));
  const remoteByPath = new Map(remoteObjects.map((remote) => [remote.path, remote]));
  const databaseById = new Map(databaseRows.map((row) => [row.id, row]));
  let objectsVerified = 0;
  let databaseRowsVerified = 0;

  for (const item of items) {
    const remote = remoteByPath.get(item.storagePath);
    if (!remote) {
      missingObjects.push(item.storagePath);
    } else {
      const filename = remote.path.split("/").at(-1) ?? "";
      if (filename !== item.canonicalFilename) {
        filenameMismatches.push({
          code: "remote_filename_mismatch",
          message: "Remote object filename does not match the canonical filename.",
          resourceId: item.resourceId,
          expected: item.canonicalFilename,
          actual: filename,
        });
      }
      if (remote.size !== item.size) {
        sizeMismatches.push({
          code: "remote_size_mismatch",
          message: "Remote object size does not match the source PDF.",
          resourceId: item.resourceId,
          expected: item.size,
          actual: remote.size,
        });
      }
      if (normalizeHash(remote.sha256) !== normalizeHash(item.sha256)) {
        hashMismatches.push({
          code: "remote_hash_mismatch",
          message: "Remote object SHA256 metadata does not match the source PDF.",
          resourceId: item.resourceId,
          expected: item.sha256,
          actual: remote.sha256,
        });
      }
      if (
        filename === item.canonicalFilename &&
        remote.size === item.size &&
        normalizeHash(remote.sha256) === normalizeHash(item.sha256)
      ) {
        objectsVerified += 1;
      }
    }

    const databaseRow = databaseById.get(item.resourceId);
    if (!databaseRow) {
      missingDatabaseRows.push(item.resourceId);
    } else {
      if (databaseRow.pdf_filename !== item.canonicalFilename) {
        filenameMismatches.push({
          code: "database_filename_mismatch",
          message: "Database pdf_filename does not match the canonical filename.",
          resourceId: item.resourceId,
          expected: item.canonicalFilename,
          actual: databaseRow.pdf_filename,
        });
      }
      if (databaseRow.storage_path !== item.storagePath) {
        pathMismatches.push({
          code: "database_storage_path_mismatch",
          message: "Database storage_path does not match the canonical object path.",
          resourceId: item.resourceId,
          expected: item.storagePath,
          actual: databaseRow.storage_path,
        });
      }
      if (databaseRow.pdf_filename === item.canonicalFilename && databaseRow.storage_path === item.storagePath) {
        databaseRowsVerified += 1;
      }
    }
  }

  const status =
    bucketPrivate &&
    missingObjects.length === 0 &&
    missingDatabaseRows.length === 0 &&
    filenameMismatches.length === 0 &&
    pathMismatches.length === 0 &&
    sizeMismatches.length === 0 &&
    hashMismatches.length === 0 &&
    duplicateRemotePaths.length === 0
      ? "PASS"
      : "FAIL";

  return {
    performed: true,
    status,
    bucketPrivate,
    objectsVerified,
    databaseRowsVerified,
    missingObjects,
    missingDatabaseRows,
    filenameMismatches,
    pathMismatches,
    sizeMismatches,
    hashMismatches,
    duplicateRemotePaths,
  };
}

function notRunVerification(): StorageVerificationResult {
  return {
    performed: false,
    status: "NOT_RUN",
    bucketPrivate: null,
    objectsVerified: 0,
    databaseRowsVerified: 0,
    missingObjects: [],
    missingDatabaseRows: [],
    filenameMismatches: [],
    pathMismatches: [],
    sizeMismatches: [],
    hashMismatches: [],
    duplicateRemotePaths: [],
  };
}

function createStorageReport(plan: ImportPlan, storagePlan: StoragePlanValidation, mode: "dry-run" | "execute"): StorageUploadReport {
  const errors = [...plan.report.errors, ...storagePlan.errors];
  const report: StorageUploadReport = {
    generatedAt: new Date().toISOString(),
    mode,
    status: errors.length === 0 ? "PASS" : "FAIL",
    sourceRoot: plan.report.sourceRoot,
    resolvedSourceRoot: plan.report.resolvedSourceRoot,
    bucket: {
      name: STORAGE_BUCKET_NAME,
      intendedPrivate: true,
      action: mode === "dry-run" ? "simulate-detect-create-or-secure" : "not-run",
      verifiedPrivate: null,
    },
    counts: {
      expectedResources: EXPECTED_COUNTS.resources,
      sourceResources: plan.report.counts.resources,
      expectedPdfs: EXPECTED_COUNTS.pdfs,
      sourcePdfs: plan.report.counts.pdfs,
      canonicalPaths: storagePlan.items.length,
      plannedObjectChecks: storagePlan.items.length,
      plannedStoragePathUpdates: storagePlan.items.length,
      uploaded: 0,
      skippedAsIdentical: 0,
      replaced: 0,
      storagePathsUpdated: 0,
    },
    missingResources: storagePlan.missingResources,
    missingPdfs: [...new Set([...plan.report.missingPdfs, ...storagePlan.missingPdfs])].sort(),
    filenameMismatches: [...plan.report.filenameMismatches, ...storagePlan.filenameMismatches],
    pathMismatches: [...storagePlan.brokenPaths],
    pathCollisions: storagePlan.pathCollisions,
    databasePreflight: {
      performed: false,
      status: "NOT_RUN",
      rowsFound: 0,
      missingResourceIds: [],
      filenameMismatches: [],
    },
    actions: storagePlan.items.map((item) => ({
      resourceId: item.resourceId,
      canonicalFilename: item.canonicalFilename,
      storagePath: item.storagePath,
      size: item.size,
      sha256: item.sha256,
      decision: "inspect",
    })),
    remoteVerification: notRunVerification(),
    warnings: [
      ...plan.report.warnings,
      ...(mode === "dry-run"
        ? ["Dry-run performs no remote bucket/object/database queries; real skip/replace decisions require execute mode."]
        : []),
      "The uploader never deletes stale or unrelated storage objects.",
    ],
    errors,
  };
  return report;
}

function supabaseClientFromEnvironment(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Storage execute mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchResourceStorageRows(client: SupabaseClient, resourceIds: string[]): Promise<ResourceStorageRow[]> {
  const rows: ResourceStorageRow[] = [];
  for (let offset = 0; offset < resourceIds.length; offset += DATABASE_BATCH_SIZE) {
    const batch = resourceIds.slice(offset, offset + DATABASE_BATCH_SIZE);
    const { data, error } = await client
      .from("resources")
      .select("id,pdf_filename,storage_path")
      .in("id", batch);
    if (error) throw new Error(`Resource storage verification query failed: ${error.message}`);
    for (const row of data ?? []) {
      if (typeof row.id === "string") {
        rows.push({
          id: row.id,
          pdf_filename: typeof row.pdf_filename === "string" ? row.pdf_filename : null,
          storage_path: typeof row.storage_path === "string" ? row.storage_path : null,
        });
      }
    }
  }
  return rows;
}

function applyDatabasePreflight(
  report: StorageUploadReport,
  items: StoragePlanItem[],
  rows: ResourceStorageRow[],
): boolean {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const missingResourceIds: string[] = [];
  const filenameMismatches: ValidationDetail[] = [];
  for (const item of items) {
    const row = rowsById.get(item.resourceId);
    if (!row) {
      missingResourceIds.push(item.resourceId);
    } else if (row.pdf_filename !== item.canonicalFilename) {
      filenameMismatches.push({
        code: "database_preflight_filename_mismatch",
        message: "Database pdf_filename does not match validated source metadata.",
        resourceId: item.resourceId,
        expected: item.canonicalFilename,
        actual: row.pdf_filename,
      });
    }
  }
  report.databasePreflight = {
    performed: true,
    status: missingResourceIds.length === 0 && filenameMismatches.length === 0 ? "PASS" : "FAIL",
    rowsFound: rows.length,
    missingResourceIds,
    filenameMismatches,
  };
  report.missingResources.push(...missingResourceIds);
  report.filenameMismatches.push(...filenameMismatches);
  for (const resourceId of missingResourceIds) {
    report.errors.push({
      code: "database_preflight_resource_missing",
      message: `Expected database resource ${resourceId} is missing; storage execution aborted before bucket changes.`,
      resourceId,
    });
  }
  report.errors.push(...filenameMismatches);
  return report.databasePreflight.status === "PASS";
}

async function ensurePrivateBucket(client: SupabaseClient, report: StorageUploadReport): Promise<void> {
  const { data: buckets, error: listError } = await client.storage.listBuckets({
    limit: 100,
    search: STORAGE_BUCKET_NAME,
  });
  if (listError) throw new Error(`Could not inspect storage buckets: ${listError.message}`);
  let bucket = (buckets ?? []).find((candidate) => candidate.id === STORAGE_BUCKET_NAME);
  if (!bucket) {
    const { error } = await client.storage.createBucket(STORAGE_BUCKET_NAME, {
      public: false,
      allowedMimeTypes: ["application/pdf"],
    });
    if (error) throw new Error(`Could not create private ${STORAGE_BUCKET_NAME} bucket: ${error.message}`);
    report.bucket.action = "created";
  } else if (bucket.public) {
    const { error } = await client.storage.updateBucket(STORAGE_BUCKET_NAME, {
      public: false,
      fileSizeLimit: bucket.file_size_limit ?? null,
      allowedMimeTypes: bucket.allowed_mime_types ?? null,
    });
    if (error) throw new Error(`Could not make ${STORAGE_BUCKET_NAME} private: ${error.message}`);
    report.bucket.action = "secured";
  } else {
    report.bucket.action = "unchanged";
  }

  const { data: verifiedBucket, error: verifyError } = await client.storage.getBucket(STORAGE_BUCKET_NAME);
  if (verifyError) throw new Error(`Could not verify ${STORAGE_BUCKET_NAME} bucket: ${verifyError.message}`);
  bucket = verifiedBucket;
  report.bucket.verifiedPrivate = bucket.public === false;
  if (bucket.public) throw new Error(`${STORAGE_BUCKET_NAME} is public after bucket reconciliation; upload aborted.`);
}

function remoteHash(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const direct = metadata.sha256;
  if (typeof direct === "string") return normalizeHash(direct);
  const nested = metadata.metadata;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const value = (nested as Record<string, unknown>).sha256;
    if (typeof value === "string") return normalizeHash(value);
  }
  return null;
}

async function readRemoteObject(
  client: SupabaseClient,
  item: StoragePlanItem,
): Promise<RemoteObjectDescriptor | null> {
  const storage = client.storage.from(STORAGE_BUCKET_NAME);
  const existence = await storage.exists(item.storagePath);
  if (!existence.data) {
    if (existence.error && !["not_found", "NoSuchKey", "404"].some((value) => existence.error.message.includes(value))) {
      // exists() returns false with an error for normal 400/404 misses; other failures remain fatal.
      const status = "status" in existence.error ? String(existence.error.status) : "";
      if (status !== "400" && status !== "404") {
        throw new Error(`Could not inspect ${item.storagePath}: ${existence.error.message}`);
      }
    }
    return null;
  }
  const { data, error } = await storage.info(item.storagePath);
  if (error) throw new Error(`Could not read metadata for ${item.storagePath}: ${error.message}`);
  const metadata = data.metadata as Record<string, unknown> | undefined;
  const metadataSize = metadata && typeof metadata.size === "number" ? metadata.size : null;
  return {
    path: item.storagePath,
    size: typeof data.size === "number" ? data.size : metadataSize,
    sha256: remoteHash(metadata),
  };
}

async function updateStoragePath(client: SupabaseClient, item: StoragePlanItem): Promise<void> {
  const { data, error } = await client
    .from("resources")
    .update({ storage_path: item.storagePath })
    .eq("id", item.resourceId)
    .select("id,storage_path")
    .single();
  if (error) throw new Error(`Could not update storage_path for ${item.resourceId}: ${error.message}`);
  if (data.id !== item.resourceId || data.storage_path !== item.storagePath) {
    throw new Error(`storage_path update verification failed immediately for ${item.resourceId}.`);
  }
}

async function uploadOne(
  client: SupabaseClient,
  item: StoragePlanItem,
  report: StorageUploadReport,
): Promise<void> {
  const remote = await readRemoteObject(client, item);
  const decision = decideUpload(item, remote);
  const action = report.actions.find((candidate) => candidate.resourceId === item.resourceId);
  if (action) action.decision = decision;

  if (decision !== "skip") {
    const bytes = await readFile(item.sourcePath);
    const currentHash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
    if (bytes.byteLength !== item.size || currentHash !== normalizeHash(item.sha256)) {
      throw new Error(`Source PDF changed after validation for ${item.resourceId}; upload aborted.`);
    }
    const { error } = await client.storage.from(STORAGE_BUCKET_NAME).upload(item.storagePath, bytes, {
      upsert: decision === "replace",
      contentType: "application/pdf",
      cacheControl: "3600",
      metadata: {
        sha256: item.sha256,
        resource_id: item.resourceId,
        canonical_filename: item.canonicalFilename,
      },
    });
    if (error) throw new Error(`Upload failed for ${item.resourceId} at ${item.storagePath}: ${error.message}`);
    if (decision === "upload") report.counts.uploaded += 1;
    else report.counts.replaced += 1;
  } else {
    report.counts.skippedAsIdentical += 1;
  }

  await updateStoragePath(client, item);
  report.counts.storagePathsUpdated += 1;
}

async function executeStoragePipeline(
  plan: ImportPlan,
  storagePlan: StoragePlanValidation,
  report: StorageUploadReport,
): Promise<void> {
  const client = supabaseClientFromEnvironment();
  const preflightRows = await fetchResourceStorageRows(
    client,
    storagePlan.items.map((item) => item.resourceId),
  );
  if (!applyDatabasePreflight(report, storagePlan.items, preflightRows)) {
    throw new Error("Database preflight failed; no bucket or object changes were attempted.");
  }

  await ensurePrivateBucket(client, report);
  for (const item of storagePlan.items) await uploadOne(client, item, report);

  const remoteObjects: RemoteObjectDescriptor[] = [];
  for (const item of storagePlan.items) {
    const remote = await readRemoteObject(client, item);
    if (remote) remoteObjects.push(remote);
  }
  const databaseRows = await fetchResourceStorageRows(
    client,
    storagePlan.items.map((item) => item.resourceId),
  );
  const { data: bucket, error: bucketError } = await client.storage.getBucket(STORAGE_BUCKET_NAME);
  if (bucketError) throw new Error(`Post-upload bucket verification failed: ${bucketError.message}`);
  const verification = compareStorageVerification(storagePlan.items, remoteObjects, databaseRows, bucket.public === false);
  report.remoteVerification = verification;
  report.bucket.verifiedPrivate = verification.bucketPrivate;
  report.filenameMismatches.push(...verification.filenameMismatches);
  report.pathMismatches.push(...verification.pathMismatches);
  if (verification.status === "FAIL") {
    for (const storagePath of verification.missingObjects) {
      report.errors.push({ code: "remote_object_missing", message: `Expected remote object ${storagePath} is missing.`, actual: storagePath });
    }
    for (const resourceId of verification.missingDatabaseRows) {
      report.errors.push({ code: "remote_database_row_missing", message: `Expected database resource ${resourceId} is missing.`, resourceId });
    }
    report.errors.push(
      ...verification.filenameMismatches,
      ...verification.pathMismatches,
      ...verification.sizeMismatches,
      ...verification.hashMismatches,
    );
    throw new Error("Post-upload verification failed; see storage-upload-report.json for exact mismatches.");
  }
}

export async function runStoragePipeline(
  plan: ImportPlan,
  mode: "dry-run" | "execute",
): Promise<StorageUploadReport> {
  const storagePlan = buildStoragePlan(plan.resources, plan.assets);
  const report = createStorageReport(plan, storagePlan, mode);
  if (report.status === "FAIL" || mode === "dry-run") return report;

  try {
    await executeStoragePipeline(plan, storagePlan, report);
  } catch (error) {
    report.errors.push({
      code: "storage_execution_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  report.status = report.errors.length === 0 && report.remoteVerification.status === "PASS" ? "PASS" : "FAIL";
  return report;
}

export function printStorageSummary(report: StorageUploadReport, reportPath: string): void {
  const brokenReferences = report.missingResources.length + report.missingPdfs.length;
  console.log(`Expected resources: ${report.counts.expectedResources}`);
  console.log(`PDFs found: ${report.counts.sourcePdfs}`);
  console.log(`Canonical paths: ${report.counts.canonicalPaths}`);
  console.log(`Broken references: ${brokenReferences}`);
  console.log(`Filename mismatches: ${report.filenameMismatches.length}`);
  console.log(`Uploaded: ${report.counts.uploaded}`);
  console.log(`Skipped as identical: ${report.counts.skippedAsIdentical}`);
  console.log(`Replaced: ${report.counts.replaced}`);
  console.log(`Validation: ${report.status}`);
  console.log(`Report: ${reportPath}`);
}
