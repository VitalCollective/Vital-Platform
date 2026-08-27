import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStoragePlan,
  canonicalStoragePath,
  compareStorageVerification,
  decideUpload,
  storagePathUpdates,
  type StoragePlanItem,
} from "../src/storage.js";
import type { ResourceAsset } from "../src/types.js";

function asset(resourceId = "R001", filename = "Canonical.pdf"): ResourceAsset {
  return {
    resourceId,
    canonicalFilename: filename,
    sourcePath: `C:\\source\\${filename}`,
    size: 1234,
    sha256: "A".repeat(64),
    pageCount: 8,
  };
}

function plannedItem(resourceId = "R001", filename = "Canonical.pdf"): StoragePlanItem {
  return {
    ...asset(resourceId, filename),
    storagePath: `resources/${resourceId}/${filename}`,
  };
}

test("generates stable resource-scoped canonical storage paths", () => {
  assert.equal(
    canonicalStoragePath("R001", "Vital_Animal_Tracks.pdf"),
    "resources/R001/Vital_Animal_Tracks.pdf",
  );
  assert.throws(() => canonicalStoragePath("R1", "file.pdf"), /Invalid canonical resource ID/);
  assert.throws(() => canonicalStoragePath("R001", "../file.pdf"), /Invalid canonical PDF filename/);
  assert.throws(() => canonicalStoragePath("R001", "folder\\file.pdf"), /Invalid canonical PDF filename/);
});

test("detects duplicate canonical path collisions", () => {
  const result = buildStoragePlan([
    { id: "R001", pdf_filename: "Canonical.pdf" },
    { id: "R001", pdf_filename: "Canonical.pdf" },
  ], [asset()]);

  assert.deepEqual(result.pathCollisions, ["resources/R001/Canonical.pdf"]);
  assert.equal(result.status, "FAIL");
});

test("detects missing PDFs before upload", () => {
  const result = buildStoragePlan([{ id: "R001", pdf_filename: "Canonical.pdf" }], []);

  assert.deepEqual(result.missingPdfs, ["R001"]);
  assert.ok(result.errors.some((error) => error.code === "storage_pdf_missing"));
});

test("detects canonical filename mismatches before upload", () => {
  const result = buildStoragePlan(
    [{ id: "R001", pdf_filename: "Expected.pdf" }],
    [asset("R001", "Actual.pdf")],
  );

  assert.equal(result.filenameMismatches.length, 1);
  assert.equal(result.filenameMismatches[0].expected, "Expected.pdf");
  assert.equal(result.filenameMismatches[0].actual, "Actual.pdf");
});

test("skips only an exact size and SHA match and otherwise uploads or replaces", () => {
  const local = asset();
  assert.equal(decideUpload(local, null), "upload");
  assert.equal(decideUpload(local, { size: 1234, sha256: "a".repeat(64) }), "skip");
  assert.equal(decideUpload(local, { size: 1234, sha256: null }), "replace");
  assert.equal(decideUpload(local, { size: 999, sha256: "A".repeat(64) }), "replace");
});

test("maps each resource to the canonical storage_path value", () => {
  assert.deepEqual(storagePathUpdates([
    plannedItem("R001", "One.pdf"),
    plannedItem("R002", "Two.pdf"),
  ]), [
    { id: "R001", storage_path: "resources/R001/One.pdf" },
    { id: "R002", storage_path: "resources/R002/Two.pdf" },
  ]);
});

test("post-upload verification requires every object, metadata hash, and database path", () => {
  const item = plannedItem();
  const passing = compareStorageVerification(
    [item],
    [{ path: item.storagePath, size: item.size, sha256: item.sha256 }],
    [{ id: item.resourceId, pdf_filename: item.canonicalFilename, storage_path: item.storagePath }],
    true,
  );
  assert.equal(passing.status, "PASS");
  assert.equal(passing.objectsVerified, 1);
  assert.equal(passing.databaseRowsVerified, 1);

  const failing = compareStorageVerification(
    [item],
    [],
    [{ id: item.resourceId, pdf_filename: item.canonicalFilename, storage_path: "wrong/path.pdf" }],
    false,
  );
  assert.equal(failing.status, "FAIL");
  assert.deepEqual(failing.missingObjects, [item.storagePath]);
  assert.equal(failing.pathMismatches.length, 1);
  assert.equal(failing.bucketPrivate, false);
});
