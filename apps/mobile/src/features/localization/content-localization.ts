import type { ActivityDetail, ActivityResource, ActivitySummary } from '@/types/content';
import type { AppLanguage } from './localization-model';

export const ACTIVITY_TRANSLATION_FIELDS = [
  'type', 'title', 'summary', 'instructions', 'why_children_enjoy_it', 'physical_benefits',
  'mental_benefits', 'social_benefits', 'cost', 'equipment', 'prep_time', 'duration',
  'parent_involvement', 'difficulty', 'mess_level', 'weather', 'season', 'country_origin',
  'community_prompt', 'safety_notes', 'variations',
] as const;

export type ActivityTranslation = { activity_id: string; locale: 'cy' }
  & Partial<Record<(typeof ACTIVITY_TRANSLATION_FIELDS)[number], string | null>>
  & { tags?: string[] | null; collection_labels?: string[] | null };
export type ResourceTranslation = {
  resource_id: string; locale: 'cy'; title: string | null; summary?: string | null; storage_path: string | null;
};

export function applyActivityTranslation<T extends ActivitySummary | ActivityDetail>(activity: T, translation?: ActivityTranslation): T {
  if (!translation) return activity;
  const localized: Record<string, unknown> = { ...activity };
  for (const field of ACTIVITY_TRANSLATION_FIELDS) {
    const value = translation[field];
    if (typeof value === 'string' && value.trim()) localized[field] = value;
  }
  if (translation.tags?.length) localized.tags = translation.tags;
  if (translation.collection_labels?.length) localized.collection_labels = translation.collection_labels;
  return localized as T;
}

export function applyActivityTranslations<T extends ActivitySummary | ActivityDetail>(activities: readonly T[], translations: readonly ActivityTranslation[]): T[] {
  const byId = new Map(translations.map((translation) => [translation.activity_id, translation]));
  return activities.map((activity) => applyActivityTranslation(activity, byId.get(activity.id)));
}

export function applyResourceTranslation(resource: ActivityResource, translation?: ResourceTranslation): ActivityResource {
  if (!translation) return resource;
  return { ...resource, title: translation.title?.trim() || resource.title, storagePath: translation.storage_path?.trim() || resource.storagePath };
}

export function contentLocale(language: AppLanguage): 'cy' | null { return language === 'cy' ? 'cy' : null; }
