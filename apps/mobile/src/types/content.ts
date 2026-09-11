export const VITAL_SECTIONS = [
  'Vital Kids',
  'Vital Together',
  'Vital Life',
  'Vital Food',
  'Vital Mums',
] as const;

export type VitalSection = (typeof VITAL_SECTIONS)[number];

export type EnvironmentFilter = 'any' | 'indoor' | 'outdoor';
export type AgeFilter = 'any' | '2-4' | '5-7' | '8-10' | '11-13' | 'all-ages' | 'adults';
export type DurationFilter = 'any' | 'quick' | 'half-hour' | 'hour' | 'longer' | 'flexible';

export type ActivitySummary = {
  id: string;
  section: VitalSection;
  title: string;
  age_min: string | null;
  age_max: string | null;
  summary: string | null;
  type: string;
  tags: string[];
  duration: string | null;
  indoor: boolean;
  outdoor: boolean;
  equipment: string | null;
  physical_benefits: string | null;
  mental_benefits: string | null;
  weather: string | null;
  collection_labels: string[];
};

export type ActivityDetail = ActivitySummary & {
  instructions: string | null;
  why_children_enjoy_it: string | null;
  physical_benefits: string | null;
  mental_benefits: string | null;
  social_benefits: string | null;
  cost: string | null;
  equipment: string | null;
  prep_time: string | null;
  parent_involvement: string | null;
  difficulty: string | null;
  mess_level: string | null;
  weather: string | null;
  season: string | null;
  country_origin: string | null;
  community_prompt: string | null;
  safety_notes: string | null;
  variations: string | null;
};

export type ActivityResource = {
  id: string;
  title: string;
  useType: string;
  pageCount: number | null;
  storagePath: string;
};

export type DiscoverFilters = {
  search: string;
  section: VitalSection | null;
  environment: EnvironmentFilter;
  age: AgeFilter;
  duration: DurationFilter;
  limit: number;
};

export type DiscoverResult = {
  activities: ActivitySummary[];
  count: number;
  usedSearchFallback: boolean;
};

export type ActivityWithResources = {
  activity: ActivityDetail;
  resources: ActivityResource[];
  printableResourceState: 'available' | 'not-required' | 'unavailable';
};
