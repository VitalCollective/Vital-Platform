import type { SupabaseClient } from '@supabase/supabase-js';

import { orderSectionCatalogueActivities } from '../../lib/discover.ts';
import { reportTechnicalError, withFutureJwtTimingRetry } from '../../lib/errors.ts';
import type {
  ActivitySummary,
  AgeFilter,
  DiscoverResult,
  VitalSection,
} from '../../types/content.ts';

const SUMMARY_FIELDS =
  'id,section,title,age_min,age_max,summary,type,tags,duration,indoor,outdoor,equipment,physical_benefits,mental_benefits,weather,collection_labels';
const SECTION_CATALOGUE_POOL_LIMIT = 1_000;

export async function fetchSectionActivities(
  client: SupabaseClient,
  section: VitalSection,
  age: AgeFilter,
): Promise<DiscoverResult> {
  const load = async () => {
    let request = client
      .from('activities')
      .select(SUMMARY_FIELDS, { count: 'exact' })
      .eq('status', 'published')
      .eq('section', section);

    if (age === '2-4') {
      request = request.in('age_min', ['2', '3']).eq('age_max', '4');
    } else if (age === '5-7') {
      request = request.in('age_min', ['5', '6']).eq('age_max', '7');
    } else if (age === '8-10') {
      request = request.eq('age_min', '8').eq('age_max', '10');
    } else if (age === '11-13') {
      request = request.eq('age_min', '11').eq('age_max', '13');
    }

    const { data, error, count } = await request
      .order('id', { ascending: true })
      .limit(SECTION_CATALOGUE_POOL_LIMIT);
    if (error) throw error;

    return {
      activities: orderSectionCatalogueActivities(
        (data ?? []) as unknown as ActivitySummary[],
      ),
      count: count ?? 0,
      usedSearchFallback: false,
    };
  };

  return withFutureJwtTimingRetry(load, {
    onRetry: (error, attempt, delayMs) =>
      reportTechnicalError(
        `${section} catalogue received transient PGRST303; retry ${attempt} in ${delayMs}ms`,
        error,
      ),
  });
}
