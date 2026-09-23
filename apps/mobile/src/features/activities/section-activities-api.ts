import type { SupabaseClient } from '@supabase/supabase-js';

import { orderSectionCatalogueActivities } from '../../lib/discover.ts';
import { reportTechnicalError, withFutureJwtTimingRetry } from '../../lib/errors.ts';
import type {
  ActivitySummary,
  AgeFilter,
  DiscoverResult,
  VitalSection,
} from '../../types/content.ts';
import { ACTIVITY_TRANSLATION_FIELDS, applyActivityTranslations, type ActivityTranslation } from '../localization/content-localization.ts';
import type { AppLanguage } from '../localization/localization-model.ts';

const SUMMARY_FIELDS =
  'id,section,title,age_min,age_max,summary,type,tags,duration,indoor,outdoor,equipment,physical_benefits,mental_benefits,weather,collection_labels';
const SECTION_CATALOGUE_POOL_LIMIT = 1_000;

export async function fetchSectionActivities(
  client: SupabaseClient,
  section: VitalSection,
  age: AgeFilter,
  language: AppLanguage = 'en',
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

    let activities = (data ?? []) as unknown as ActivitySummary[];
    if (language === 'cy' && activities.length) {
      const translations = await client.from('activity_translations')
        .select(`activity_id,locale,${ACTIVITY_TRANSLATION_FIELDS.join(',')},tags,collection_labels`)
        .eq('locale', 'cy').in('activity_id', activities.map(({ id }) => id));
      if (translations.error) {
        reportTechnicalError('Load localized section fields; using canonical English fallback', translations.error);
      } else {
        activities = applyActivityTranslations(activities, (translations.data ?? []) as unknown as ActivityTranslation[]);
      }
    }
    return {
      activities: orderSectionCatalogueActivities(activities),
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
