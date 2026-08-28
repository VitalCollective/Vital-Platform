import { requireSupabase } from '@/lib/supabase';
import type {
  ActivityDetail,
  ActivityResource,
  ActivitySummary,
  ActivityWithResources,
  DiscoverFilters,
  DiscoverResult,
} from '@/types/content';

const SUMMARY_FIELDS =
  'id,section,title,age_min,age_max,summary,duration,indoor,outdoor';

const DETAIL_FIELDS = `${SUMMARY_FIELDS},type,instructions,why_children_enjoy_it,physical_benefits,mental_benefits,social_benefits,cost,equipment,prep_time,parent_involvement,difficulty,mess_level,weather,season,country_origin,community_prompt,safety_notes,variations`;

type ActivityResourceQueryRow = {
  use_type: string;
  sort_order: number;
  resource:
    | {
        id: string;
        title: string;
        page_count: number | null;
        storage_path: string | null;
      }
    | {
        id: string;
        title: string;
        page_count: number | null;
        storage_path: string | null;
      }[]
    | null;
};

function normalizeFallbackSearch(search: string): string {
  return search
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchIdeasForToday(): Promise<ActivitySummary[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('activities')
    .select(SUMMARY_FIELDS)
    .eq('status', 'published')
    .order('id')
    .limit(3);

  if (error) throw new Error(`Unable to load today's ideas: ${error.message}`);
  return (data ?? []) as unknown as ActivitySummary[];
}

async function runDiscoverQuery(
  filters: DiscoverFilters,
  useFallback: boolean,
): Promise<DiscoverResult> {
  const client = requireSupabase();
  const from = filters.page * filters.pageSize;
  const to = from + filters.pageSize - 1;

  let request = client
    .from('activities')
    .select(SUMMARY_FIELDS, { count: 'exact' })
    .eq('status', 'published');

  if (filters.section) request = request.eq('section', filters.section);
  if (filters.environment === 'indoor') request = request.eq('indoor', true);
  if (filters.environment === 'outdoor') request = request.eq('outdoor', true);

  const normalizedSearch = normalizeFallbackSearch(filters.search);
  if (normalizedSearch) {
    request = useFallback
      ? request.or(
          `title.ilike.%${normalizedSearch}%,summary.ilike.%${normalizedSearch}%,instructions.ilike.%${normalizedSearch}%`,
        )
      : request.textSearch('search_document', filters.search.trim(), {
          type: 'websearch',
          config: 'english',
        });
  }

  const { data, error, count } = await request
    .order('title', { ascending: true })
    .range(from, to);

  if (error) throw error;

  return {
    activities: (data ?? []) as unknown as ActivitySummary[],
    count: count ?? 0,
    usedSearchFallback: useFallback && Boolean(normalizedSearch),
  };
}

export async function fetchDiscoverActivities(
  filters: DiscoverFilters,
): Promise<DiscoverResult> {
  try {
    return await runDiscoverQuery(filters, false);
  } catch (fullTextError) {
    if (!filters.search.trim()) {
      const message =
        fullTextError instanceof Error
          ? fullTextError.message
          : 'Unknown activity query error';
      throw new Error(`Unable to load activities: ${message}`);
    }

    try {
      return await runDiscoverQuery(filters, true);
    } catch (fallbackError) {
      const message =
        fallbackError instanceof Error
          ? fallbackError.message
          : 'Unknown fallback query error';
      throw new Error(`Unable to search activities: ${message}`);
    }
  }
}

function mapResourceLink(row: ActivityResourceQueryRow): ActivityResource | null {
  const resource = Array.isArray(row.resource) ? row.resource[0] : row.resource;
  if (!resource?.storage_path) return null;

  return {
    id: resource.id,
    title: resource.title,
    useType: row.use_type,
    pageCount: resource.page_count,
    storagePath: resource.storage_path,
  };
}

export async function fetchActivityWithResources(
  activityId: string,
): Promise<ActivityWithResources> {
  const client = requireSupabase();
  const [activityResult, resourceResult] = await Promise.all([
    client
      .from('activities')
      .select(DETAIL_FIELDS)
      .eq('id', activityId)
      .eq('status', 'published')
      .maybeSingle(),
    client
      .from('activity_resources')
      .select(
        'use_type,sort_order,resource:resources(id,title,page_count,storage_path)',
      )
      .eq('activity_id', activityId)
      .order('sort_order', { ascending: true }),
  ]);

  if (activityResult.error) {
    throw new Error(`Unable to load activity: ${activityResult.error.message}`);
  }
  if (!activityResult.data) throw new Error('This activity could not be found.');
  if (resourceResult.error) {
    throw new Error(`Unable to load printable resources: ${resourceResult.error.message}`);
  }

  const resourceRows = (resourceResult.data ?? []) as unknown as ActivityResourceQueryRow[];
  const resources = resourceRows
    .map(mapResourceLink)
    .filter((resource): resource is ActivityResource => resource !== null);

  return {
    activity: activityResult.data as unknown as ActivityDetail,
    resources,
  };
}
