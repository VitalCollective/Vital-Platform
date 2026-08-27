export type ActivityStatus = "draft" | "review" | "published" | "archived";
export type ResourceStatus = "draft" | "review" | "complete" | "published" | "archived";
export type ResourceUseType = "primary" | "reuse" | "optional companion";

export interface ActivityRow {
  id: string;
  type: string;
  section: string;
  title: string;
  age_min: string | null;
  age_max: string | null;
  summary: string | null;
  instructions: string | null;
  why_children_enjoy_it: string | null;
  physical_benefits: string | null;
  mental_benefits: string | null;
  social_benefits: string | null;
  indoor: boolean;
  outdoor: boolean;
  cost: string | null;
  equipment: string | null;
  prep_time: string | null;
  duration: string | null;
  parent_involvement: string | null;
  difficulty: string | null;
  mess_level: string | null;
  weather: string | null;
  season: string | null;
  country_origin: string | null;
  tags: string[];
  community_prompt: string | null;
  safety_notes: string | null;
  variations: string | null;
  collection_labels: string[];
  source: string | null;
  research_batch: string | null;
  status: ActivityStatus;
  notes: string | null;
}

export interface ResourceRow {
  id: string;
  slug: string;
  title: string;
  section: string;
  resource_type: string;
  status: ResourceStatus;
  audience: string[];
  age_ranges: string[];
  summary: string | null;
  keywords: string[];
  tags: string[];
  species_covered: string[];
  search_terms: unknown;
  related_activities: string[];
  related_resources: string[];
  pdf_filename: string;
  markdown_filename: string | null;
  metadata_filename: string | null;
  source_basis: string[];
  safety_topics: string[];
  searchable: boolean;
  downloadable: boolean;
  featured_terms: string[];
  page_count: number;
  source_document: Record<string, unknown>;
}

export interface ActivityResourceRow {
  activity_id: string;
  resource_id: string;
  use_type: ResourceUseType;
  sort_order: number;
}

export interface ResourceAsset {
  resourceId: string;
  canonicalFilename: string;
  sourcePath: string;
  size: number;
  sha256: string;
  pageCount: number;
}

export interface ValidationDetail {
  code: string;
  message: string;
  activityId?: string;
  resourceId?: string;
  field?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface UnmappedResourceField {
  field: string;
  occurrences: number;
  resourceIds: string[];
}

export interface ValidationReport {
  generatedAt: string;
  mode: "dry-run" | "execute";
  status: "PASS" | "FAIL";
  readyToImport: boolean;
  sourceRoot: string;
  resolvedSourceRoot: string;
  sourceVersions: {
    resources: number | string | null;
    declaredResourceCount: number | null;
  };
  expected: {
    activities: number;
    resources: number;
    relationships: number;
    pdfs: number;
  };
  counts: {
    activities: number;
    mappedActivities: number;
    resources: number;
    mappedResources: number;
    relationships: number;
    pdfs: number;
    manifestRows: number;
    totalPdfPages: number;
  };
  duplicates: {
    activityIds: string[];
    resourceIds: string[];
    resourceSlugs: string[];
    relationshipKeys: string[];
    manifestResourceIds: string[];
    canonicalPdfFilenames: string[];
    pdfHashes: string[];
  };
  brokenReferences: ValidationDetail[];
  resourceUseMismatches: ValidationDetail[];
  filenameMismatches: ValidationDetail[];
  pageCountMismatches: ValidationDetail[];
  sizeMismatches: ValidationDetail[];
  hashMismatches: ValidationDetail[];
  missingPdfs: string[];
  unexpectedPdfs: string[];
  unmappedCsvFields: string[];
  unmappedResourceFields: UnmappedResourceField[];
  transformations: string[];
  schemaMismatches: string[];
  warnings: string[];
  errors: ValidationDetail[];
}

export interface ImportPlan {
  activities: ActivityRow[];
  resources: ResourceRow[];
  relationships: ActivityResourceRow[];
  assets: ResourceAsset[];
  report: ValidationReport;
}

export interface SourceSetSnapshot {
  activityIds: string[];
  resourceIds: string[];
  relationshipKeys: string[];
}

export interface DatabaseVerificationResult {
  status: "PASS" | "FAIL";
  expected: {
    activities: number;
    resources: number;
    relationships: number;
  };
  verified: {
    activities: number;
    resources: number;
    relationships: number;
  };
  missing: {
    activityIds: string[];
    resourceIds: string[];
    relationshipKeys: string[];
  };
}
