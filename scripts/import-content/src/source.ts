import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PDFDocument } from "pdf-lib";

import {
  ACTIVITY_CSV_FIELDS,
  ACTIVITY_SECTIONS,
  ACTIVITY_STATUSES,
  EXPECTED_COUNTS,
  MANIFEST_FIELDS,
  RESOURCE_SCHEMA_FIELDS,
  RESOURCE_STATUSES,
  RESOURCE_USE_TYPES,
  SOURCE_FILES,
} from "./constants.js";
import type {
  ActivityResourceRow,
  ActivityEnvironmentAudit,
  ActivityEnvironmentConsistencyAudit,
  ActivityEnvironmentConsistencyFlag,
  ActivityRow,
  ActivityStatus,
  ImportPlan,
  ResourceAsset,
  ResourceRow,
  ResourceStatus,
  ResourceUseType,
  UnmappedResourceField,
  ValidationDetail,
  ValidationReport,
} from "./types.js";

type CsvRow = Record<string, string>;
type RawResource = Record<string, unknown>;
type ProblemSink = (detail: ValidationDetail) => void;

interface ResourceDocument {
  version?: number | string;
  resource_count?: number;
  resources?: unknown;
}

interface AssetManifestRow {
  resourceId: string;
  title: string;
  filename: string;
  pages: number;
  size: number;
  sha256: string;
}

const noProblem: ProblemSink = () => undefined;

const indoorEvidencePattern = /\bindoors?\b/i;
const outdoorEvidencePattern = /\boutdoors?\b/i;
const indoorWeatherPattern = /(^|;\s*)(home|kitchen)(\s*;|$)/i;
const indoorContentEvidencePattern =
  /\b(indoors?|inside|at home|around the house|living room|bedroom|hallway|bathroom|(?:a|the|your) room|(?:in|inside|around|through|within) (?:a|the|your) (?:house|home|kitchen))\b/i;
const outdoorContentEvidencePattern =
  /\b(outdoors?|outside|garden|park|woodland|forest|beach|trail|playground|pavement|street|pond|riverbank|coast|nature reserve)\b/i;
const explicitIndoorDirectionPattern =
  /\b(?:head|go|step|move|stay) inside\b|\b(?:choose|find|use|work|play|do|try|perform|set up)[^.!?]{0,80}\bindoors?\b|\bindoor (?:space|area|location|room|setting)\b/i;
const explicitOutdoorDirectionPattern =
  /\b(?:head|go|step|move) outside\b|\b(?:choose|find|visit|use|work|play|do|try|perform|set up|test|testing)[^.!?]{0,80}\b(?:outdoors?|outside)\b|\b(?:outdoor|outside) (?:space|area|location|workspace|setting)\b/i;

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function requiredString(
  value: unknown,
  field: string,
  context: Pick<ValidationDetail, "activityId" | "resourceId">,
  onProblem: ProblemSink,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    onProblem({
      code: "required_field",
      message: `Required field ${field} is empty or not a string.`,
      field,
      ...context,
      actual: value,
    });
    return "";
  }
  if (value !== value.trim()) {
    onProblem({
      code: "outer_whitespace",
      message: `${field} contains leading or trailing whitespace.`,
      field,
      ...context,
      actual: value,
    });
  }
  return value.trim();
}

function stringArray(
  value: unknown,
  field: string,
  context: Pick<ValidationDetail, "resourceId">,
  onProblem: ProblemSink,
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    onProblem({
      code: "invalid_array",
      message: `${field} must be an array of strings.`,
      field,
      ...context,
      actual: value,
    });
    return [];
  }
  const invalid = value.filter((item) => typeof item !== "string");
  if (invalid.length > 0) {
    onProblem({
      code: "invalid_array_item",
      message: `${field} contains non-string values.`,
      field,
      ...context,
      actual: invalid,
    });
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function splitSemicolonList(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function strictBoolean(
  value: string | undefined,
  field: string,
  context: Pick<ValidationDetail, "activityId">,
  onProblem: ProblemSink,
): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  onProblem({
    code: "invalid_boolean",
    message: `${field} must be true or false.`,
    field,
    ...context,
    actual: value,
  });
  return false;
}

function normalizedActivityEnvironment(
  row: CsvRow,
  sourceIndoor: boolean,
  sourceOutdoor: boolean,
): { indoor: boolean; outdoor: boolean } {
  if (sourceIndoor || !sourceOutdoor) {
    return { indoor: sourceIndoor, outdoor: sourceOutdoor };
  }

  // The final source repeats outdoor-only across 395 rows, including whole
  // indoor-oriented sections. Retain only environment claims supported by
  // explicit source metadata and leave everything else honestly neutral.
  const evidenceText = [
    row.Title,
    row.Summary,
    row.Tags,
    row.Collections,
    row.Weather,
  ].join(" ");

  return {
    indoor:
      indoorEvidencePattern.test(evidenceText) ||
      indoorWeatherPattern.test(row.Weather ?? ""),
    outdoor: outdoorEvidencePattern.test(evidenceText),
  };
}

function environmentCounts(
  environments: readonly { indoor: boolean; outdoor: boolean }[],
): ActivityEnvironmentAudit["source"] {
  return {
    indoorOnly: environments.filter(({ indoor, outdoor }) => indoor && !outdoor).length,
    indoorAndOutdoor: environments.filter(({ indoor, outdoor }) => indoor && outdoor).length,
    outdoorOnly: environments.filter(({ indoor, outdoor }) => !indoor && outdoor).length,
    neutral: environments.filter(({ indoor, outdoor }) => !indoor && !outdoor).length,
  };
}

function activityEnvironmentAudit(
  rows: readonly CsvRow[],
  activities: readonly ActivityRow[],
): ActivityEnvironmentAudit {
  const sourceEnvironments = rows.map((row) => ({
    indoor: row.Indoor?.trim().toLowerCase() === "true",
    outdoor: row.Outdoor?.trim().toLowerCase() === "true",
  }));
  const repeatedOutdoorOnlyIndexes = sourceEnvironments
    .map((environment, index) => ({ environment, index }))
    .filter(({ environment }) => !environment.indoor && environment.outdoor);
  const normalizedRepeatedRows = repeatedOutdoorOnlyIndexes.map(
    ({ index }) => activities[index],
  );
  const manualReviewIds = normalizedRepeatedRows
    .filter(({ indoor, outdoor }) => !indoor && !outdoor)
    .map(({ id }) => id);

  return {
    source: environmentCounts(sourceEnvironments),
    normalized: environmentCounts(activities),
    repeatedOutdoorOnlyRows: repeatedOutdoorOnlyIndexes.length,
    normalizedToIndoorOnly: normalizedRepeatedRows.filter(
      ({ indoor, outdoor }) => indoor && !outdoor,
    ).length,
    normalizedToIndoorAndOutdoor: normalizedRepeatedRows.filter(
      ({ indoor, outdoor }) => indoor && outdoor,
    ).length,
    retainedSupportedOutdoorOnly: normalizedRepeatedRows.filter(
      ({ indoor, outdoor }) => !indoor && outdoor,
    ).length,
    neutralizedForManualReview: manualReviewIds.length,
    manualReviewIds,
  };
}

function environmentClassification(
  activity: Pick<ActivityRow, "indoor" | "outdoor">,
): ActivityEnvironmentConsistencyFlag["classification"] {
  if (activity.indoor && activity.outdoor) return "indoor-and-outdoor";
  if (activity.indoor) return "indoor-only";
  if (activity.outdoor) return "outdoor-only";
  return "neutral";
}

function conciseEvidence(field: string, value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const excerpt = normalized.length > 240
    ? `${normalized.slice(0, 237).trimEnd()}...`
    : normalized;
  return `${field}: ${excerpt}`;
}

function contentEnvironmentEvidence(row: CsvRow): {
  indoor: string[];
  outdoor: string[];
  explicitIndoorDirection: boolean;
  explicitOutdoorDirection: boolean;
} {
  const fields: Array<[string, string | undefined]> = [
    ["Title", row.Title],
    ["Summary", row.Summary],
    ["Instructions", row.Instructions],
    ["Weather", row.Weather],
    ["Tags", row.Tags],
    ["Collections", row.Collections],
  ];
  const indoor: string[] = [];
  const outdoor: string[] = [];
  const directionalText = [row.Title, row.Summary, row.Instructions]
    .filter(Boolean)
    .join(" ");

  for (const [field, value] of fields) {
    if (!value?.trim()) continue;
    if (
      indoorContentEvidencePattern.test(value) ||
      (field === "Weather" && indoorWeatherPattern.test(value))
    ) {
      indoor.push(conciseEvidence(field, value));
    }
    if (outdoorContentEvidencePattern.test(value)) {
      outdoor.push(conciseEvidence(field, value));
    }
  }

  return {
    indoor,
    outdoor,
    explicitIndoorDirection: explicitIndoorDirectionPattern.test(directionalText),
    explicitOutdoorDirection: explicitOutdoorDirectionPattern.test(directionalText),
  };
}

export function auditActivityEnvironmentConsistency(
  rows: readonly CsvRow[],
  activities: readonly ActivityRow[],
): ActivityEnvironmentConsistencyAudit {
  const definiteContradictions: ActivityEnvironmentConsistencyFlag[] = [];
  const manualReview: ActivityEnvironmentConsistencyFlag[] = [];

  for (let index = 0; index < activities.length; index += 1) {
    const activity = activities[index];
    const row = rows[index] ?? {};
    const evidence = contentEnvironmentEvidence(row);
    const hasIndoorEvidence = evidence.indoor.length > 0;
    const hasOutdoorEvidence = evidence.outdoor.length > 0;
    const classification = environmentClassification(activity);
    let reason: string | null = null;
    let confidence: "definite" | "manual" | null = null;

    if (classification === "indoor-only" && hasOutdoorEvidence && !hasIndoorEvidence) {
      reason = "Indoor-only metadata conflicts with prose that provides only explicit outdoor evidence.";
      confidence = "definite";
    } else if (classification === "outdoor-only" && hasIndoorEvidence && !hasOutdoorEvidence) {
      reason = "Outdoor-only metadata conflicts with prose that provides only explicit indoor evidence.";
      confidence = "definite";
    } else if (
      classification === "indoor-and-outdoor" &&
      hasIndoorEvidence !== hasOutdoorEvidence
    ) {
      const hasExplicitOneSidedDirection = hasIndoorEvidence
        ? evidence.explicitIndoorDirection
        : evidence.explicitOutdoorDirection;
      reason = hasExplicitOneSidedDirection
        ? "Both-setting metadata conflicts with customer-facing directions that explicitly describe only one setting."
        : "Both-setting metadata is supported explicitly by only one side of the customer-facing prose.";
      confidence = hasExplicitOneSidedDirection ? "definite" : "manual";
    } else if (
      (classification === "indoor-only" || classification === "outdoor-only") &&
      hasIndoorEvidence &&
      hasOutdoorEvidence
    ) {
      reason = "Single-setting metadata accompanies explicit evidence for both indoor and outdoor use.";
      confidence = "manual";
    } else if (classification === "neutral" && (hasIndoorEvidence || hasOutdoorEvidence)) {
      reason = "Neutral metadata accompanies explicit indoor or outdoor language that warrants editorial review.";
      confidence = "manual";
    }

    if (!reason || !confidence) continue;
    const flag: ActivityEnvironmentConsistencyFlag = {
      activityId: activity.id,
      title: activity.title,
      classification,
      reason,
      indoorEvidence: evidence.indoor,
      outdoorEvidence: evidence.outdoor,
    };
    if (confidence === "definite") definiteContradictions.push(flag);
    else manualReview.push(flag);
  }

  return {
    auditedActivities: activities.length,
    definiteContradictions,
    manualReview,
  };
}

function jsonBoolean(
  value: unknown,
  fallback: boolean,
  field: string,
  resourceId: string,
  onProblem: ProblemSink,
): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  onProblem({
    code: "invalid_boolean",
    message: `${field} must be a boolean.`,
    resourceId,
    field,
    actual: value,
  });
  return fallback;
}

function duplicateValues(values: string[], caseInsensitive = false): string[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const value of values) {
    if (!value) continue;
    const key = caseInsensitive ? value.toLowerCase() : value;
    const entry = counts.get(key) ?? { display: value, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].filter(({ count }) => count > 1).map(({ display }) => display).sort();
}

function activityStatus(value: string | undefined, activityId: string, onProblem: ProblemSink): ActivityStatus {
  const source = value?.trim() ?? "";
  if (source === "Research Complete") return "published";
  const normalized = source.toLowerCase();
  if (ACTIVITY_STATUSES.has(normalized)) return normalized as ActivityStatus;
  onProblem({
    code: "invalid_activity_status",
    message: `Unsupported activity status: ${source || "(empty)"}.`,
    activityId,
    field: "Status",
    actual: source,
  });
  return "draft";
}

export function mapActivityRecord(row: CsvRow, onProblem: ProblemSink = noProblem): ActivityRow {
  const activityId = requiredString(row.ID, "ID", {}, onProblem);
  const context = { activityId };
  const section = requiredString(row.Section, "Section", context, onProblem);
  const sourceIndoor = strictBoolean(row.Indoor, "Indoor", context, onProblem);
  const sourceOutdoor = strictBoolean(row.Outdoor, "Outdoor", context, onProblem);
  const environment = normalizedActivityEnvironment(
    row,
    sourceIndoor,
    sourceOutdoor,
  );
  if (section && !ACTIVITY_SECTIONS.has(section)) {
    onProblem({
      code: "invalid_activity_section",
      message: `Unsupported activity section: ${section}.`,
      activityId,
      field: "Section",
      actual: section,
    });
  }

  return {
    id: activityId,
    type: requiredString(row.Type, "Type", context, onProblem),
    section,
    title: requiredString(row.Title, "Title", context, onProblem),
    age_min: nullable(row["Age Min"]),
    age_max: nullable(row["Age Max"]),
    summary: nullable(row.Summary),
    instructions: nullable(row.Instructions),
    why_children_enjoy_it: nullable(row["Why Children Enjoy It"]),
    physical_benefits: nullable(row["Physical Benefits"]),
    mental_benefits: nullable(row["Mental Benefits"]),
    social_benefits: nullable(row["Social Benefits"]),
    indoor: environment.indoor,
    outdoor: environment.outdoor,
    cost: nullable(row.Cost),
    equipment: nullable(row.Equipment),
    prep_time: nullable(row["Prep Time"]),
    duration: nullable(row.Duration),
    parent_involvement: nullable(row["Parent Involvement"]),
    difficulty: nullable(row.Difficulty),
    mess_level: nullable(row["Mess Level"]),
    weather: nullable(row.Weather),
    season: nullable(row.Season),
    country_origin: nullable(row["Country/Origin"]),
    tags: splitSemicolonList(row.Tags),
    community_prompt: nullable(row["Community Prompt"]),
    safety_notes: nullable(row["Safety Notes"]),
    variations: nullable(row.Variations),
    collection_labels: splitSemicolonList(row.Collections),
    source: nullable(row.Source),
    research_batch: nullable(row["Research Batch"]),
    status: activityStatus(row.Status, activityId, onProblem),
    notes: nullable(row.Notes),
  };
}

export function parseActivityRelationships(
  row: CsvRow,
  onProblem: ProblemSink = noProblem,
): ActivityResourceRow[] {
  const activityId = row.ID?.trim() ?? "";
  const resourceIds = splitSemicolonList(row["Resource IDs"]);
  const useEntries = splitSemicolonList(row["Resource Use"]);

  if (resourceIds.length !== useEntries.length) {
    onProblem({
      code: "resource_use_count_mismatch",
      message: "Resource IDs and Resource Use contain different numbers of entries.",
      activityId,
      expected: resourceIds.length,
      actual: useEntries.length,
    });
  }

  const relationships: ActivityResourceRow[] = [];
  for (let index = 0; index < resourceIds.length; index += 1) {
    const resourceId = resourceIds[index];
    const rawUse = useEntries[index];
    if (!rawUse) continue;

    const prefixedUse = rawUse.match(/^([^:]+):\s*(.+)$/);
    const useResourceId = prefixedUse?.[1]?.trim();
    const useType = (prefixedUse?.[2] ?? rawUse).trim().toLowerCase();
    if (useResourceId && useResourceId !== resourceId) {
      onProblem({
        code: "resource_use_id_mismatch",
        message: "The Resource Use entry is prefixed with a different resource ID.",
        activityId,
        resourceId,
        expected: resourceId,
        actual: useResourceId,
      });
    }
    if (!RESOURCE_USE_TYPES.has(useType)) {
      onProblem({
        code: "invalid_resource_use",
        message: `Unsupported resource use type: ${useType || "(empty)"}.`,
        activityId,
        resourceId,
        actual: useType,
      });
      continue;
    }
    relationships.push({
      activity_id: activityId,
      resource_id: resourceId,
      use_type: useType as ResourceUseType,
      sort_order: index,
    });
  }
  return relationships;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalJsonString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function mapResourceRecord(
  raw: RawResource,
  validatedPageCount: number,
  onProblem: ProblemSink = noProblem,
): ResourceRow {
  const resourceId = requiredString(raw.id, "id", {}, onProblem);
  const context = { resourceId };
  const formats = recordValue(raw.formats);
  const indexing = recordValue(raw.app_indexing);
  const statusSource = requiredString(raw.status, "status", context, onProblem).toLowerCase();
  if (!RESOURCE_STATUSES.has(statusSource)) {
    onProblem({
      code: "invalid_resource_status",
      message: `Unsupported resource status: ${statusSource || "(empty)"}.`,
      resourceId,
      field: "status",
      actual: statusSource,
    });
  }
  if (!Number.isInteger(validatedPageCount) || validatedPageCount <= 0) {
    onProblem({
      code: "invalid_page_count",
      message: "A positive validated PDF page count is required.",
      resourceId,
      field: "page_count",
      actual: validatedPageCount,
    });
  }

  return {
    id: resourceId,
    slug: requiredString(raw.slug, "slug", context, onProblem),
    title: requiredString(raw.title, "title", context, onProblem),
    section: requiredString(raw.section, "section", context, onProblem),
    resource_type: requiredString(raw.resource_type, "resource_type", context, onProblem),
    status: (RESOURCE_STATUSES.has(statusSource) ? statusSource : "draft") as ResourceStatus,
    audience: stringArray(raw.audience, "audience", context, onProblem),
    age_ranges: stringArray(raw.age_ranges, "age_ranges", context, onProblem),
    summary: optionalJsonString(raw.summary),
    keywords: stringArray(raw.keywords, "keywords", context, onProblem),
    tags: stringArray(raw.tags, "tags", context, onProblem),
    species_covered: stringArray(raw.species_covered, "species_covered", context, onProblem),
    search_terms: raw.search_terms ?? {},
    related_activities: stringArray(raw.related_activities, "related_activities", context, onProblem),
    related_resources: stringArray(raw.related_resources, "related_resources", context, onProblem),
    pdf_filename: requiredString(formats.pdf, "formats.pdf", context, onProblem),
    markdown_filename: optionalJsonString(formats.markdown),
    metadata_filename: optionalJsonString(formats.metadata),
    source_basis: stringArray(raw.source_basis, "source_basis", context, onProblem),
    safety_topics: stringArray(raw.safety_topics, "safety_topics", context, onProblem),
    searchable: jsonBoolean(indexing.searchable, true, "app_indexing.searchable", resourceId, onProblem),
    downloadable: jsonBoolean(indexing.downloadable, true, "app_indexing.downloadable", resourceId, onProblem),
    featured_terms: stringArray(indexing.featured_terms, "app_indexing.featured_terms", context, onProblem),
    page_count: validatedPageCount,
    source_document: structuredClone(raw),
  };
}

async function isSourceRoot(candidate: string): Promise<boolean> {
  return Object.values(SOURCE_FILES).every((name) => existsSync(path.join(candidate, name)));
}

export async function resolveSourceRoot(input: string): Promise<string> {
  const root = path.resolve(input);
  if (await isSourceRoot(root)) return root;

  let currentLevel = [root];
  const matches: string[] = [];
  for (let depth = 0; depth < 2; depth += 1) {
    const nextLevel: string[] = [];
    for (const directory of currentLevel) {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(directory, entry.name);
        if (await isSourceRoot(candidate)) matches.push(candidate);
        nextLevel.push(candidate);
      }
    }
    currentLevel = nextLevel;
  }
  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length === 1) return uniqueMatches[0];
  if (uniqueMatches.length > 1) {
    throw new Error(`Multiple source bundles were found beneath ${root}: ${uniqueMatches.join(", ")}`);
  }
  throw new Error(`No Vital Collective source bundle was found at or beneath ${root}.`);
}

function parseCsv(text: string): CsvRow[] {
  return parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as CsvRow[];
}

function mapManifestRow(row: CsvRow, onProblem: ProblemSink): AssetManifestRow {
  const resourceId = requiredString(row["Resource ID"], "Resource ID", {}, onProblem);
  const pages = Number.parseInt(row.Pages?.trim() ?? "", 10);
  const size = Number.parseInt(row["File Size Bytes"]?.trim() ?? "", 10);
  const sha256 = row.SHA256?.trim().toUpperCase() ?? "";
  if (!Number.isInteger(pages) || pages <= 0) {
    onProblem({ code: "invalid_manifest_pages", message: "Manifest Pages must be a positive integer.", resourceId, actual: row.Pages });
  }
  if (!Number.isInteger(size) || size <= 0) {
    onProblem({ code: "invalid_manifest_size", message: "Manifest File Size Bytes must be a positive integer.", resourceId, actual: row["File Size Bytes"] });
  }
  if (!/^[A-F0-9]{64}$/.test(sha256)) {
    onProblem({ code: "invalid_manifest_hash", message: "Manifest SHA256 must contain 64 hexadecimal characters.", resourceId, actual: row.SHA256 });
  }
  return {
    resourceId,
    title: row.Title?.trim() ?? "",
    filename: row["Canonical PDF Filename"]?.trim() ?? "",
    pages,
    size,
    sha256,
  };
}

function resourceUnmappedFields(resources: RawResource[]): UnmappedResourceField[] {
  const fields = new Map<string, { occurrences: number; resourceIds: string[] }>();
  for (const resource of resources) {
    const resourceId = typeof resource.id === "string" ? resource.id : "(unknown)";
    for (const field of Object.keys(resource)) {
      if (RESOURCE_SCHEMA_FIELDS.has(field)) continue;
      const current = fields.get(field) ?? { occurrences: 0, resourceIds: [] };
      current.occurrences += 1;
      current.resourceIds.push(resourceId);
      fields.set(field, current);
    }
  }
  return [...fields.entries()]
    .map(([field, value]) => ({ field, ...value }))
    .sort((left, right) => left.field.localeCompare(right.field));
}

function countMismatchDetail(name: string, expected: number, actual: number): ValidationDetail {
  return {
    code: `${name}_count_mismatch`,
    message: `Expected ${expected} ${name}, found ${actual}.`,
    expected,
    actual,
  };
}

export async function buildImportPlan(sourceInput: string, mode: "dry-run" | "execute" = "dry-run"): Promise<ImportPlan> {
  const sourceRoot = path.resolve(sourceInput);
  const resolvedSourceRoot = await resolveSourceRoot(sourceRoot);
  const report: ValidationReport = {
    generatedAt: new Date().toISOString(),
    mode,
    status: "FAIL",
    readyToImport: false,
    sourceRoot,
    resolvedSourceRoot,
    sourceVersions: { resources: null, declaredResourceCount: null },
    expected: { ...EXPECTED_COUNTS },
    counts: {
      activities: 0,
      mappedActivities: 0,
      resources: 0,
      mappedResources: 0,
      relationships: 0,
      pdfs: 0,
      manifestRows: 0,
      totalPdfPages: 0,
    },
    duplicates: {
      activityIds: [],
      resourceIds: [],
      resourceSlugs: [],
      relationshipKeys: [],
      manifestResourceIds: [],
      canonicalPdfFilenames: [],
      pdfHashes: [],
    },
    brokenReferences: [],
    resourceUseMismatches: [],
    filenameMismatches: [],
    pageCountMismatches: [],
    sizeMismatches: [],
    hashMismatches: [],
    missingPdfs: [],
    unexpectedPdfs: [],
    unmappedCsvFields: [],
    unmappedResourceFields: [],
    activityEnvironmentAudit: {
      source: { indoorOnly: 0, indoorAndOutdoor: 0, outdoorOnly: 0, neutral: 0 },
      normalized: { indoorOnly: 0, indoorAndOutdoor: 0, outdoorOnly: 0, neutral: 0 },
      repeatedOutdoorOnlyRows: 0,
      normalizedToIndoorOnly: 0,
      normalizedToIndoorAndOutdoor: 0,
      retainedSupportedOutdoorOnly: 0,
      neutralizedForManualReview: 0,
      manualReviewIds: [],
    },
    environmentContentConsistencyAudit: {
      auditedActivities: 0,
      definiteContradictions: [],
      manualReview: [],
    },
    activityResourceStateAudit: {
      withAvailablePrintable: 0,
      noPrintableRequired: 0,
      missingOrBrokenPrintable: 0,
      missingOrBrokenActivityIds: [],
    },
    transformations: [
      "Activity Status value 'Research Complete' maps to public.activities.status = 'published'.",
      "Semicolon-delimited activity Tags and Collections map to text arrays.",
      "Repeated source outdoor-only flags are retained only where title, summary, tags, collections or weather explicitly support an environment; Home/Kitchen weather values count as indoor evidence and unsupported rows map to a neutral setting.",
      "Resource page_count uses the verified PDF page count after matching the manifest and any JSON page_count value.",
    ],
    schemaMismatches: [],
    warnings: [],
    errors: [],
  };

  const pushError = (detail: ValidationDetail, category?: ValidationDetail[]): void => {
    category?.push(detail);
    report.errors.push(detail);
  };

  const activityText = await readFile(path.join(resolvedSourceRoot, SOURCE_FILES.activities), "utf8");
  const activityRows = parseCsv(activityText);
  report.counts.activities = activityRows.length;
  const activityHeaders = Object.keys(activityRows[0] ?? {});
  report.unmappedCsvFields = activityHeaders.filter((header) => !ACTIVITY_CSV_FIELDS.includes(header as (typeof ACTIVITY_CSV_FIELDS)[number]));
  for (const field of ACTIVITY_CSV_FIELDS) {
    if (!activityHeaders.includes(field)) {
      pushError({ code: "missing_csv_field", message: `Activity CSV is missing required field ${field}.`, field });
    }
  }

  const rawActivityIds = activityRows.map((row) => row.ID?.trim() ?? "");
  report.duplicates.activityIds = duplicateValues(rawActivityIds);
  for (const id of report.duplicates.activityIds) {
    pushError({ code: "duplicate_activity_id", message: `Duplicate activity ID: ${id}.`, activityId: id });
  }

  const activities = activityRows.map((row) => mapActivityRecord(row, pushError));
  report.counts.mappedActivities = activities.length;
  report.activityEnvironmentAudit = activityEnvironmentAudit(activityRows, activities);
  report.environmentContentConsistencyAudit = auditActivityEnvironmentConsistency(
    activityRows,
    activities,
  );
  if (report.activityEnvironmentAudit.neutralizedForManualReview > 0) {
    report.warnings.push(
      `${report.activityEnvironmentAudit.neutralizedForManualReview} activities have no trustworthy explicit indoor/outdoor evidence and were mapped to a neutral setting for manual metadata review.`,
    );
  }
  if (
    report.environmentContentConsistencyAudit.definiteContradictions.length > 0 ||
    report.environmentContentConsistencyAudit.manualReview.length > 0
  ) {
    report.warnings.push(
      `Environment/content consistency audit flagged ${report.environmentContentConsistencyAudit.definiteContradictions.length} definite contradictions and ${report.environmentContentConsistencyAudit.manualReview.length} possible cases for editorial review.`,
    );
  }

  const resourceDocument = JSON.parse(
    await readFile(path.join(resolvedSourceRoot, SOURCE_FILES.resources), "utf8"),
  ) as ResourceDocument;
  if (!Array.isArray(resourceDocument.resources)) {
    throw new Error(`${SOURCE_FILES.resources} does not contain a resources array.`);
  }
  const rawResources = resourceDocument.resources as RawResource[];
  report.sourceVersions.resources = resourceDocument.version ?? null;
  report.sourceVersions.declaredResourceCount = resourceDocument.resource_count ?? null;
  report.counts.resources = rawResources.length;
  if (resourceDocument.resource_count !== undefined && resourceDocument.resource_count !== rawResources.length) {
    pushError({
      code: "declared_resource_count_mismatch",
      message: "resources.json resource_count does not match the resources array length.",
      expected: resourceDocument.resource_count,
      actual: rawResources.length,
    });
  }

  const rawResourceIds = rawResources.map((resource) => (typeof resource.id === "string" ? resource.id.trim() : ""));
  const rawResourceSlugs = rawResources.map((resource) => (typeof resource.slug === "string" ? resource.slug.trim() : ""));
  report.duplicates.resourceIds = duplicateValues(rawResourceIds);
  report.duplicates.resourceSlugs = duplicateValues(rawResourceSlugs, true);
  for (const id of report.duplicates.resourceIds) {
    pushError({ code: "duplicate_resource_id", message: `Duplicate resource ID: ${id}.`, resourceId: id });
  }
  for (const slug of report.duplicates.resourceSlugs) {
    pushError({ code: "duplicate_resource_slug", message: `Duplicate resource slug: ${slug}.`, actual: slug });
  }
  const expectedResourceIds = Array.from({ length: EXPECTED_COUNTS.resources }, (_, index) => `R${String(index + 1).padStart(3, "0")}`);
  for (const resourceId of expectedResourceIds) {
    if (!rawResourceIds.includes(resourceId)) {
      pushError({ code: "missing_resource_id", message: `Expected resource ID ${resourceId} is missing.`, resourceId });
    }
  }
  for (const resourceId of rawResourceIds.filter((id) => id && !expectedResourceIds.includes(id))) {
    pushError({ code: "unexpected_resource_id", message: `Unexpected resource ID ${resourceId}.`, resourceId });
  }
  report.unmappedResourceFields = resourceUnmappedFields(rawResources);
  if (report.unmappedResourceFields.length > 0) {
    report.transformations.push(
      `${report.unmappedResourceFields.length} non-normalized resource field names are catalogued in unmappedResourceFields; every complete original resource object is retained in public.resources.source_document.`,
    );
  }

  const manifestText = await readFile(path.join(resolvedSourceRoot, SOURCE_FILES.manifest), "utf8");
  const manifestCsvRows = parseCsv(manifestText);
  report.counts.manifestRows = manifestCsvRows.length;
  const manifestHeaders = Object.keys(manifestCsvRows[0] ?? {});
  for (const field of MANIFEST_FIELDS) {
    if (!manifestHeaders.includes(field)) {
      pushError({ code: "missing_manifest_field", message: `Asset manifest is missing required field ${field}.`, field });
    }
  }
  const manifestRows = manifestCsvRows.map((row) => mapManifestRow(row, pushError));
  report.duplicates.manifestResourceIds = duplicateValues(manifestRows.map((row) => row.resourceId));
  report.duplicates.canonicalPdfFilenames = duplicateValues(manifestRows.map((row) => row.filename), true);
  report.duplicates.pdfHashes = duplicateValues(manifestRows.map((row) => row.sha256), true);
  for (const resourceId of report.duplicates.manifestResourceIds) {
    pushError({ code: "duplicate_manifest_resource", message: `Manifest contains duplicate resource ${resourceId}.`, resourceId });
  }
  for (const filename of report.duplicates.canonicalPdfFilenames) {
    pushError({ code: "duplicate_canonical_pdf", message: `Manifest contains duplicate canonical filename ${filename}.`, actual: filename });
  }
  for (const hash of report.duplicates.pdfHashes) {
    pushError({ code: "duplicate_pdf_hash", message: `Multiple canonical assets have SHA256 ${hash}.`, actual: hash });
  }

  const pdfDirectory = path.join(resolvedSourceRoot, SOURCE_FILES.pdfDirectory);
  const pdfFilenames = (await readdir(pdfDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name)
    .sort();
  report.counts.pdfs = pdfFilenames.length;
  const actualFilenameByLowercase = new Map(pdfFilenames.map((filename) => [filename.toLowerCase(), filename]));
  const expectedFilenames = new Set(manifestRows.map((row) => row.filename.toLowerCase()));
  report.unexpectedPdfs = pdfFilenames.filter((filename) => !expectedFilenames.has(filename.toLowerCase()));
  for (const filename of report.unexpectedPdfs) {
    pushError({ code: "unexpected_pdf", message: `Unexpected PDF asset ${filename}.`, actual: filename });
  }

  const resourceById = new Map(rawResources.map((resource) => [typeof resource.id === "string" ? resource.id.trim() : "", resource]));
  const manifestById = new Map(manifestRows.map((row) => [row.resourceId, row]));
  const validatedPageCounts = new Map<string, number>();
  const assets: ResourceAsset[] = [];
  let missingJsonPageCounts = 0;

  for (const manifest of manifestRows) {
    const resource = resourceById.get(manifest.resourceId);
    if (!resource) {
      pushError({
        code: "manifest_resource_missing",
        message: `Manifest resource ${manifest.resourceId} does not exist in resources.json.`,
        resourceId: manifest.resourceId,
      }, report.brokenReferences);
      continue;
    }
    const formats = recordValue(resource.formats);
    const jsonFilename = typeof formats.pdf === "string" ? formats.pdf.trim() : "";
    const aliasFilename = typeof resource.filename === "string" ? resource.filename.trim() : "";
    if (jsonFilename !== manifest.filename) {
      pushError({
        code: "resource_manifest_filename_mismatch",
        message: "resources.json formats.pdf does not match the canonical manifest filename.",
        resourceId: manifest.resourceId,
        expected: manifest.filename,
        actual: jsonFilename,
      }, report.filenameMismatches);
    }
    if (aliasFilename && aliasFilename !== manifest.filename) {
      pushError({
        code: "resource_filename_alias_mismatch",
        message: "resources.json filename does not match the canonical manifest filename.",
        resourceId: manifest.resourceId,
        expected: manifest.filename,
        actual: aliasFilename,
      }, report.filenameMismatches);
    }
    if (typeof resource.title === "string" && resource.title.trim() !== manifest.title) {
      report.warnings.push(`${manifest.resourceId} title differs between resources.json and the asset manifest.`);
    }

    const actualFilename = actualFilenameByLowercase.get(manifest.filename.toLowerCase());
    if (!actualFilename) {
      report.missingPdfs.push(manifest.filename);
      pushError({
        code: "missing_pdf",
        message: `Expected PDF ${manifest.filename} is missing.`,
        resourceId: manifest.resourceId,
        expected: manifest.filename,
      });
      continue;
    }
    if (actualFilename !== manifest.filename) {
      pushError({
        code: "pdf_filename_case_mismatch",
        message: "Actual PDF filename casing does not exactly match the manifest.",
        resourceId: manifest.resourceId,
        expected: manifest.filename,
        actual: actualFilename,
      }, report.filenameMismatches);
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(pdfDirectory, actualFilename));
    } catch (error) {
      pushError({
        code: "pdf_read_error",
        message: `Could not read ${actualFilename}: ${error instanceof Error ? error.message : String(error)}`,
        resourceId: manifest.resourceId,
      });
      continue;
    }
    if (bytes.byteLength !== manifest.size) {
      pushError({
        code: "pdf_size_mismatch",
        message: "PDF byte size does not match the manifest.",
        resourceId: manifest.resourceId,
        expected: manifest.size,
        actual: bytes.byteLength,
      }, report.sizeMismatches);
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();
    if (sha256 !== manifest.sha256) {
      pushError({
        code: "pdf_hash_mismatch",
        message: "PDF SHA256 does not match the manifest.",
        resourceId: manifest.resourceId,
        expected: manifest.sha256,
        actual: sha256,
      }, report.hashMismatches);
    }

    try {
      const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
      const actualPages = pdf.getPageCount();
      validatedPageCounts.set(manifest.resourceId, actualPages);
      assets.push({
        resourceId: manifest.resourceId,
        canonicalFilename: manifest.filename,
        sourcePath: path.join(pdfDirectory, actualFilename),
        size: bytes.byteLength,
        sha256,
        pageCount: actualPages,
      });
      report.counts.totalPdfPages += actualPages;
      if (actualPages !== manifest.pages) {
        pushError({
          code: "manifest_pdf_page_count_mismatch",
          message: "Actual PDF page count does not match the manifest.",
          resourceId: manifest.resourceId,
          expected: manifest.pages,
          actual: actualPages,
        }, report.pageCountMismatches);
      }
      if (resource.page_count === undefined || resource.page_count === null) {
        missingJsonPageCounts += 1;
      } else if (resource.page_count !== actualPages) {
        pushError({
          code: "resource_pdf_page_count_mismatch",
          message: "resources.json page_count does not match the actual PDF.",
          resourceId: manifest.resourceId,
          expected: actualPages,
          actual: resource.page_count,
        }, report.pageCountMismatches);
      }
    } catch (error) {
      pushError({
        code: "invalid_pdf",
        message: `PDF parsing failed for ${actualFilename}: ${error instanceof Error ? error.message : String(error)}`,
        resourceId: manifest.resourceId,
      });
    }
  }

  for (const resourceId of rawResourceIds) {
    if (resourceId && !manifestById.has(resourceId)) {
      pushError({
        code: "resource_manifest_missing",
        message: `Resource ${resourceId} has no asset manifest row.`,
        resourceId,
      }, report.brokenReferences);
    }
  }
  if (missingJsonPageCounts > 0) {
    const mismatch = `${missingJsonPageCounts} resources omit page_count in resources.json; verified manifest/PDF counts will populate public.resources.page_count.`;
    report.schemaMismatches.push(mismatch);
    report.warnings.push(mismatch);
  }

  const resources = rawResources.map((resource) => {
    const resourceId = typeof resource.id === "string" ? resource.id.trim() : "";
    return mapResourceRecord(resource, validatedPageCounts.get(resourceId) ?? 0, pushError);
  });
  report.counts.mappedResources = resources.length;

  const relationshipIssues: ValidationDetail[] = [];
  const relationships = activityRows.flatMap((row) => parseActivityRelationships(row, (detail) => relationshipIssues.push(detail)));
  for (const detail of relationshipIssues) pushError(detail, report.resourceUseMismatches);
  report.counts.relationships = relationships.length;

  const activityIdSet = new Set(rawActivityIds);
  const resourceIdSet = new Set(rawResourceIds);
  for (const relationship of relationships) {
    if (!activityIdSet.has(relationship.activity_id)) {
      pushError({
        code: "broken_activity_reference",
        message: `Relationship references missing activity ${relationship.activity_id}.`,
        activityId: relationship.activity_id,
        resourceId: relationship.resource_id,
      }, report.brokenReferences);
    }
    if (!resourceIdSet.has(relationship.resource_id)) {
      pushError({
        code: "broken_resource_reference",
        message: `Relationship references missing resource ${relationship.resource_id}.`,
        activityId: relationship.activity_id,
        resourceId: relationship.resource_id,
      }, report.brokenReferences);
    }
  }
  report.duplicates.relationshipKeys = duplicateValues(
    relationships.map((relationship) => `${relationship.activity_id}::${relationship.resource_id}`),
  );
  for (const key of report.duplicates.relationshipKeys) {
    pushError({ code: "duplicate_relationship", message: `Duplicate activity-resource relationship ${key}.`, actual: key });
  }

  const countChecks: Array<[string, number, number]> = [
    ["activities", EXPECTED_COUNTS.activities, report.counts.activities],
    ["resources", EXPECTED_COUNTS.resources, report.counts.resources],
    ["relationships", EXPECTED_COUNTS.relationships, report.counts.relationships],
    ["pdfs", EXPECTED_COUNTS.pdfs, report.counts.pdfs],
  ];
  for (const [name, expected, actual] of countChecks) {
    if (actual !== expected) pushError(countMismatchDetail(name, expected, actual));
  }
  if (report.counts.manifestRows !== EXPECTED_COUNTS.resources) {
    pushError(countMismatchDetail("manifest rows", EXPECTED_COUNTS.resources, report.counts.manifestRows));
  }

  const invalidResourceIds = new Set(
    report.errors
      .map(({ resourceId }) => resourceId)
      .filter((resourceId): resourceId is string => Boolean(resourceId)),
  );
  const relationshipsByActivity = new Map<string, ActivityResourceRow[]>();
  for (const relationship of relationships) {
    const current = relationshipsByActivity.get(relationship.activity_id) ?? [];
    current.push(relationship);
    relationshipsByActivity.set(relationship.activity_id, current);
  }
  const missingOrBrokenActivityIds: string[] = [];
  let noPrintableRequired = 0;
  let withAvailablePrintable = 0;
  for (const row of activityRows) {
    const activityId = row.ID?.trim() ?? "";
    const declaredResourceIds = splitSemicolonList(row["Resource IDs"]);
    if (declaredResourceIds.length === 0) {
      noPrintableRequired += 1;
      continue;
    }
    const validRelationships = relationshipsByActivity.get(activityId) ?? [];
    const hasBrokenPrintable =
      validRelationships.length !== declaredResourceIds.length ||
      validRelationships.some(({ resource_id }) => invalidResourceIds.has(resource_id));
    if (hasBrokenPrintable) missingOrBrokenActivityIds.push(activityId);
    else withAvailablePrintable += 1;
  }
  report.activityResourceStateAudit = {
    withAvailablePrintable,
    noPrintableRequired,
    missingOrBrokenPrintable: missingOrBrokenActivityIds.length,
    missingOrBrokenActivityIds,
  };

  report.status = report.errors.length === 0 ? "PASS" : "FAIL";
  report.readyToImport = report.status === "PASS";
  return { activities, resources, relationships, assets, report };
}
