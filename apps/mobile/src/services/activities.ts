import {
  discoverIntentServerFilter,
  discoverSearchFilter,
  durationsForFilter,
  interleaveActivityPools,
  normalizeDiscoverSearch,
  rankActivitiesForSearch,
  resolveDiscoverSearch,
} from '@/lib/discover';
import {
  reportTechnicalError,
  withFutureJwtTimingRetry,
} from '@/lib/errors';
import { classifyPrintableResourceState } from '@/lib/printable-resources';
import { requireSupabase } from '@/lib/supabase';
import {
  ACTIVITY_TRANSLATION_FIELDS,
  applyActivityTranslations,
  applyResourceTranslation,
  type ActivityTranslation,
  type ResourceTranslation,
} from '@/features/localization/content-localization';
import type { AppLanguage } from '@/features/localization/localization-model';
import {
  VITAL_SECTIONS,
  type ActivityDetail,
  type ActivityResource,
  type ActivitySummary,
  type ActivityWithResources,
  type AgeFilter,
  type DiscoverFilters,
  type DiscoverResult,
  type VitalSection,
} from '@/types/content';

const SUMMARY_FIELDS =
  'id,section,title,age_min,age_max,summary,type,tags,duration,indoor,outdoor,equipment,physical_benefits,mental_benefits,weather,collection_labels';

const DETAIL_FIELDS = `${SUMMARY_FIELDS},instructions,why_children_enjoy_it,physical_benefits,mental_benefits,social_benefits,cost,equipment,prep_time,parent_involvement,difficulty,mess_level,weather,season,country_origin,community_prompt,safety_notes,variations`;

const HOME_IDEA_COUNT = 3;
const HOME_SECTION_POOL_SIZE = 3;
const ACTIVITY_TRANSLATION_SELECT = `activity_id,locale,${ACTIVITY_TRANSLATION_FIELDS.join(',')},tags,collection_labels`;

async function translatedActivities<T extends ActivitySummary | ActivityDetail>(
  activities: readonly T[],
  language: AppLanguage,
): Promise<T[]> {
  if (language !== 'cy' || !activities.length) return [...activities];
  const client = requireSupabase();
  const { data, error } = await client.from('activity_translations')
    .select(ACTIVITY_TRANSLATION_SELECT).eq('locale', 'cy')
    .in('activity_id', activities.map(({ id }) => id));
  if (error) {
    reportTechnicalError('Load localized activity fields; using canonical English fallback', error);
    return [...activities];
  }
  return applyActivityTranslations(activities, (data ?? []) as unknown as ActivityTranslation[]);
}

async function welshSearchActivityIds(search: string, language: AppLanguage): Promise<string[]> {
  if (language !== 'cy' || !search) return [];
  const client = requireSupabase();
  const { data, error } = await client.from('activity_translations').select('activity_id')
    .eq('locale', 'cy')
    .or(`search_document.wfts(simple).${search},title.ilike.*${search}*,summary.ilike.*${search}*,instructions.ilike.*${search}*,equipment.ilike.*${search}*`)
    .limit(250);
  if (error) {
    reportTechnicalError('Search localized activity fields; using canonical English fallback', error);
    return [];
  }
  return [...new Set((data ?? []).map(({ activity_id }) => activity_id as string))];
}

type DiscoverLane = {
  section?: VitalSection;
  age?: AgeFilter;
};

const DEFAULT_DISCOVER_LANES: readonly DiscoverLane[] = [
  { section: 'Vital Mums' },
  { section: 'Vital Kids', age: '2-4' },
  { section: 'Vital Together' },
  { section: 'Vital Life' },
  { section: 'Vital Food' },
  { section: 'Vital Kids', age: '5-7' },
  { section: 'Vital Kids', age: '8-10' },
  { section: 'Vital Kids', age: '11-13' },
];

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

export async function fetchIdeasForToday(language: AppLanguage = 'en'): Promise<ActivitySummary[]> {
  const client = requireSupabase();
  const loadSectionPools = async () => {
    const results = await Promise.all(
      VITAL_SECTIONS.map((section) =>
        client
          .from('activities')
          .select(SUMMARY_FIELDS)
          .eq('status', 'published')
          .eq('section', section)
          .order('id')
          .limit(HOME_SECTION_POOL_SIZE),
      ),
    );

    const failure = results.find((result) => result.error);
    if (failure?.error) throw failure.error;

    return results.map(
      ({ data }) => (data ?? []) as unknown as ActivitySummary[],
    );
  };

  // Contain Supabase's transient PostgREST time-cache rejection without
  // retrying permission, expiry, network, or other genuine failures.
  const sectionPools = await withFutureJwtTimingRetry(loadSectionPools, {
    onRetry: (error, attempt, delayMs) =>
      reportTechnicalError(
        `Home ideas received transient PGRST303; retry ${attempt} in ${delayMs}ms`,
        error,
      ),
  });

  const utcDay = Math.floor(Date.now() / 86_400_000);
  const rotatedPools = sectionPools.map(
    (_, index) => sectionPools[(index + utcDay) % sectionPools.length],
  );

  const selected = rotatedPools
    .map((pool, index) => pool[(utcDay + index) % pool.length])
    .filter((activity): activity is ActivitySummary => Boolean(activity))
    .slice(0, HOME_IDEA_COUNT);
  return translatedActivities(selected, language);
}

async function runDiscoverQuery(
  filters: DiscoverFilters,
  useFallback: boolean,
  language: AppLanguage,
): Promise<DiscoverResult> {
  const client = requireSupabase();
  const normalizedSearch = normalizeDiscoverSearch(filters.search);
  const searchPlan = resolveDiscoverSearch(filters.search);
  const translatedSearchIds = await welshSearchActivityIds(searchPlan.literalSearch, language);
  const isDiversifiedDefault =
    !normalizedSearch &&
    filters.section === null &&
    filters.environment === 'any' &&
    filters.age === 'any' &&
    filters.duration === 'any';
  const lanes: readonly DiscoverLane[] = isDiversifiedDefault
    ? DEFAULT_DISCOVER_LANES
    : [{ section: filters.section ?? undefined }];
  const perLaneLimit = isDiversifiedDefault
    ? Math.max(1, Math.ceil(filters.limit / lanes.length))
    : normalizedSearch
      ? Math.min(Math.max(filters.limit * 2, 40), 250)
      : filters.limit;

  const laneResults = await Promise.all(
    lanes.map(async (lane) => {
      let request = client
        .from('activities')
        .select(SUMMARY_FIELDS, { count: 'exact' })
        .eq('status', 'published');

      if (lane.section) request = request.eq('section', lane.section);

      if (filters.environment === 'indoor') request = request.eq('indoor', true);
      if (filters.environment === 'outdoor') request = request.eq('outdoor', true);
      if (searchPlan.intents.includes('indoor')) request = request.eq('indoor', true);
      if (searchPlan.intents.includes('outdoor')) request = request.eq('outdoor', true);

      const age = lane.age ?? filters.age;
      if (age === '2-4') {
        request = request.in('age_min', ['2', '3']).eq('age_max', '4');
      } else if (age === '5-7') {
        request = request.in('age_min', ['5', '6']).eq('age_max', '7');
      } else if (age === '8-10') {
        request = request.eq('age_min', '8').eq('age_max', '10');
      } else if (age === '11-13') {
        request = request.eq('age_min', '11').eq('age_max', '13');
      } else if (age === 'all-ages') {
        request = request.eq('age_min', 'All').eq('age_max', 'All');
      } else if (age === 'adults') {
        request = request
          .in('age_min', ['Adults', 'Mums'])
          .in('age_max', ['Adults', 'Mums']);
      }

      if (filters.duration !== 'any') {
        request = request.in('duration', [...durationsForFilter(filters.duration)]);
      }

      if (searchPlan.intents.includes('quick')) {
        request = request.in('duration', [...durationsForFilter('quick')]);
      }

      for (const intent of searchPlan.intents) {
        const intentFilter = discoverIntentServerFilter(intent);
        if (intentFilter) request = request.or(intentFilter);
      }

      if (searchPlan.literalSearch) {
        const englishFilter = discoverSearchFilter(searchPlan.literalSearch, useFallback);
        const translationFilter = translatedSearchIds.length ? `,id.in.(${translatedSearchIds.join(',')})` : '';
        request = request.or(`${englishFilter}${translationFilter}`);
      }

      const { data, error, count } = await request
        .order('title', { ascending: true })
        .limit(perLaneLimit);
      if (error) throw error;

      return {
        activities: await translatedActivities((data ?? []) as unknown as ActivitySummary[], language),
        count: count ?? 0,
      };
    }),
  );

  const candidates = isDiversifiedDefault
    ? interleaveActivityPools(laneResults.map(({ activities }) => activities))
    : laneResults.flatMap(({ activities }) => activities);
  const orderedActivities = normalizedSearch
    ? rankActivitiesForSearch(candidates, normalizedSearch)
    : isDiversifiedDefault
      ? candidates
      : [...candidates].sort(
          (left, right) =>
            left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
        );

  return {
    activities: orderedActivities.slice(0, filters.limit),
    count: laneResults.reduce((total, result) => total + result.count, 0),
    usedSearchFallback: useFallback && Boolean(searchPlan.literalSearch),
  };
}

export async function fetchDiscoverActivities(
  filters: DiscoverFilters,
  language: AppLanguage = 'en',
): Promise<DiscoverResult> {
  const runWithJwtTimingContainment = (useFallback: boolean) =>
    withFutureJwtTimingRetry(() => runDiscoverQuery(filters, useFallback, language), {
      onRetry: (error, attempt, delayMs) =>
        reportTechnicalError(
          `Discover received transient PGRST303; retry ${attempt} in ${delayMs}ms`,
          error,
        ),
    });

  try {
    return await runWithJwtTimingContainment(false);
  } catch (fullTextError) {
    if (!resolveDiscoverSearch(filters.search).literalSearch) throw fullTextError;

    reportTechnicalError(
      'Discover full-text search unavailable; trying bounded field fallback',
      fullTextError,
    );

    try {
      return await runWithJwtTimingContainment(true);
    } catch (fallbackError) {
      throw fallbackError;
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
  language: AppLanguage = 'en',
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
  let resources = resourceRows
    .map(mapResourceLink)
    .filter((resource): resource is ActivityResource => resource !== null);

  const [activity] = await translatedActivities(
    [activityResult.data as unknown as ActivityDetail],
    language,
  );
  if (language === 'cy' && resources.length) {
    const { data, error } = await client.from('resource_translations')
      .select('resource_id,locale,title,summary,storage_path')
      .eq('locale', 'cy').in('resource_id', resources.map(({ id }) => id));
    if (error) reportTechnicalError('Load localized resource fields; using canonical English fallback', error);
    const byId = new Map(((error ? [] : data ?? []) as unknown as ResourceTranslation[])
      .map((translation) => [translation.resource_id, translation]));
    resources = resources.map((resource) => applyResourceTranslation(resource, byId.get(resource.id)));
  }

  return {
    activity,
    resources,
    printableResourceState: classifyPrintableResourceState(
      resourceRows.length,
      resources.length,
    ),
  };
}
