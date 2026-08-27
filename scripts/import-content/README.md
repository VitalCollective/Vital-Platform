# Vital Collective content importer

This TypeScript tool parses and validates the final Vital Collective deployment bundle before any database work. It maps activities, resources, and activity-resource relationships to the existing Supabase tables and verifies every PDF against the canonical asset manifest.

## Dry run

From the repository root:

```powershell
npm run content:import -- --dry-run --source "C:\Users\clayj\Documents\VitalCollective\Finished assets\Vital_Collective_Deployment_R001-R088"
```

The importer resolves the bundle's nested deployment directory automatically. Dry-run is also the default when neither mode flag is supplied. It does not create a Supabase client, access credentials, change the database, or upload files. The generated JSON report is written to `scripts/import-content/reports/import-validation-report.json` and is gitignored; use `--report <path>` to override it.

Validation covers expected counts, required source columns, duplicate IDs/slugs/relationships/assets, relationship references and use types, the complete R001-R088 sequence, canonical filenames, PDF readability, page counts, file sizes, and SHA-256 hashes.

## Mapping and current schema gaps

- All 35 activity CSV columns are consumed. `Resource IDs` and `Resource Use` create `activity_resources` rows; the other columns map to `activities`.
- The source activity status `Research Complete` maps to the allowed database status `published`. This deterministic transformation is recorded in every report.
- Semicolon-delimited activity tags and collections become text arrays.
- Supported resource fields map directly to `resources`, including formats, related metadata, indexing flags, and verified page counts.
- Some resources omit `page_count` in `resources.json`; the importer requires the manifest and actual PDF to agree, then uses that verified value.
- The normalized `public.resources` columns remain the query and indexing layer. `source_document` retains the complete original resource object exactly as parsed from `resources.json`, including all bespoke nested fields; intentional duplication with normalized columns preserves provenance without flattening or remodeling the source.
- Resource-specific fields without a normalized column remain catalogued by field name and resource ID under `unmappedResourceFields` in the report. They are informationally "unmapped" only from the normalized layer and are still fully retained inside `source_document`.
- `storage_path` is omitted from resource upserts so a later storage process cannot have its path erased by an importer rerun.

## Approved future database execution

After a dry-run passes and execution is separately approved:

```powershell
$env:SUPABASE_URL = "https://your-project-ref.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "retrieve-from-your-secret-manager"
npm run content:import -- --execute --source "C:\path\to\bundle"
```

Execute mode validates first, refuses to continue on any error, and upserts in foreign-key-safe order: resources, activities, then activity-resource relationships. Stable primary keys and the relationship composite key prevent duplicates on reruns. After the upserts, the same administrative client queries all expected activity IDs, R001-R088 IDs, and relationship keys back from Supabase. Any missing expected key fails execution with an explicit mismatch list; attempted upsert counts alone are never treated as success. It performs database row upserts only and never uploads PDFs. Credentials are read only from the process environment and are never printed or accepted as command-line arguments.

The current implementation deliberately does not prune database rows absent from a later source bundle. Deletion/synchronization semantics should be approved separately and ideally performed through a transactional database function.

## Storage upload pipeline

Storage is a separate, explicit operation. Its offline dry-run is:

```powershell
npm run content:import -- --upload-storage --dry-run --source "C:\Users\clayj\Documents\VitalCollective\Finished assets\Vital_Collective_Deployment_R001-R088"
```

The dry-run reuses the complete source/manifest/PDF validation, computes all canonical paths, simulates bucket/object/database actions, and writes the gitignored `scripts/import-content/reports/storage-upload-report.json`. It never creates a Supabase client and therefore cannot inspect or mutate a bucket, object, or database row.

After separate approval, real storage execution uses `--upload-storage --execute`. Normal database import never uploads PDFs. Execute mode:

1. Queries all expected database resource IDs and canonical `pdf_filename` values; any missing/mismatched row aborts before bucket changes.
2. Detects the `vital-resources` bucket, creates it privately if absent, or preserves its settings while changing it to private if necessary.
3. Inspects each canonical object. An exact byte-size and stored SHA-256 match is skipped; a missing object is uploaded without overwrite, and any non-identical existing object is replaced with `upsert: true` at the same path.
4. Stores SHA-256, resource ID, and canonical filename as object metadata, then writes only the canonical path to `public.resources.storage_path`.
5. Reads the private bucket, all 88 expected objects, hashes/sizes, and all 88 database paths back. Any missing object, metadata mismatch, filename mismatch, or path mismatch exits non-zero and is recorded in the report.

The private bucket uses resource-scoped immutable canonical object keys:

```text
resources/R001/Vital_Animal_Tracks_and_Signs_Guide.pdf
resources/R002/<canonical filename>.pdf
```

The resource ID provides a stable namespace while retaining the human-readable canonical filename. The pipeline never generates a public URL, adds read policies, or exposes the service-role key. It does not delete stale or unrelated objects; filename-change cleanup and exact deletion semantics require separate approval.

## Local checks

```powershell
npm run content:import:typecheck
npm run content:import:test
git diff --check
```
