export const EXPECTED_COUNTS = {
  activities: 463,
  resources: 88,
  relationships: 162,
  pdfs: 88,
} as const;

export const SOURCE_FILES = {
  activities: "Vital_Collective_App_Activities_Final.csv",
  resources: "resources.json",
  manifest: "Vital_Collective_Resource_Asset_Manifest_FINAL.csv",
  pdfDirectory: "pdfs",
} as const;

export const ACTIVITY_CSV_FIELDS = [
  "ID",
  "Type",
  "Section",
  "Title",
  "Age Min",
  "Age Max",
  "Summary",
  "Instructions",
  "Why Children Enjoy It",
  "Physical Benefits",
  "Mental Benefits",
  "Social Benefits",
  "Indoor",
  "Outdoor",
  "Cost",
  "Equipment",
  "Prep Time",
  "Duration",
  "Parent Involvement",
  "Difficulty",
  "Mess Level",
  "Weather",
  "Season",
  "Country/Origin",
  "Tags",
  "Community Prompt",
  "Safety Notes",
  "Variations",
  "Collections",
  "Source",
  "Research Batch",
  "Status",
  "Notes",
  "Resource IDs",
  "Resource Use",
] as const;

export const MANIFEST_FIELDS = [
  "Resource ID",
  "Title",
  "Canonical PDF Filename",
  "Uploaded Source Filename",
  "Pages",
  "File Size Bytes",
  "SHA256",
  "Filename Action",
  "Validation",
] as const;

export const RESOURCE_SCHEMA_FIELDS = new Set([
  "id",
  "slug",
  "title",
  "section",
  "resource_type",
  "status",
  "audience",
  "age_ranges",
  "summary",
  "keywords",
  "tags",
  "species_covered",
  "search_terms",
  "related_activities",
  "related_resources",
  "formats",
  "source_basis",
  "safety_topics",
  "app_indexing",
  "page_count",
  // A redundant source alias validated against formats.pdf when present.
  "filename",
]);

export const RESOURCE_USE_TYPES = new Set(["primary", "reuse", "optional companion"]);
export const ACTIVITY_STATUSES = new Set(["draft", "review", "published", "archived"]);
export const RESOURCE_STATUSES = new Set(["draft", "review", "complete", "published", "archived"]);
export const ACTIVITY_SECTIONS = new Set(["Vital Kids", "Vital Together", "Vital Life", "Vital Food", "Vital Mums"]);
