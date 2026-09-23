import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applyActivityTranslation,
  applyResourceTranslation,
} from '../src/features/localization/content-localization.ts';
import {
  DEFAULT_LANGUAGE,
  resolvedLanguage,
} from '../src/features/localization/localization-model.ts';
import { translate } from '../src/features/localization/translations.ts';

test('English remains the default and unsupported stored values safely resolve to English', () => {
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.equal(resolvedLanguage(null), 'en');
  assert.equal(resolvedLanguage('fr'), 'en');
  assert.equal(resolvedLanguage('cy'), 'cy');
});

test('Welsh UI copy changes immediately while missing translations visibly fall back to English', () => {
  assert.equal(translate('cy', 'Home'), 'Hafan');
  assert.equal(translate('en', 'Home'), 'Home');
  assert.equal(translate('cy', 'Untranslated safe fallback'), 'Untranslated safe fallback');
  assert.equal(translate('cy', 'Welcome back, {name}', { name: 'Clay' }), 'Croeso’n ôl, Clay');
});

test('activity localisation retains canonical identity and falls back field by field', () => {
  const activity = {
    id: 'VK-5-7-0001', section: 'Vital Kids', title: 'Treasure map', summary: 'Draw a map',
    age_min: '5', age_max: '7', type: 'Activity', tags: ['drawing'], duration: '20 mins',
    indoor: true, outdoor: false, equipment: 'Paper', physical_benefits: null,
    mental_benefits: 'Planning', weather: null, collection_labels: [],
  };
  const localized = applyActivityTranslation(activity, {
    activity_id: activity.id, locale: 'cy', title: 'Map trysor', summary: null,
  });
  assert.equal(localized.id, activity.id);
  assert.equal(localized.title, 'Map trysor');
  assert.equal(localized.summary, activity.summary);
  assert.equal(localized.section, activity.section);
});

test('resource localisation preserves the canonical relationship and English PDF fallback', () => {
  const resource = { id: 'R001', title: 'English title', useType: 'worksheet', pageCount: 1, storagePath: 'resources/en/r001.pdf' };
  const metadataOnly = applyResourceTranslation(resource, { resource_id: 'R001', locale: 'cy', title: 'Teitl Cymraeg', storage_path: null });
  assert.equal(metadataOnly.id, 'R001');
  assert.equal(metadataOnly.title, 'Teitl Cymraeg');
  assert.equal(metadataOnly.storagePath, resource.storagePath);
  const welshPdf = applyResourceTranslation(resource, { resource_id: 'R001', locale: 'cy', title: null, storage_path: 'resources/cy/r001.pdf' });
  assert.equal(welshPdf.storagePath, 'resources/cy/r001.pdf');
});

test('migration adds keyed translations without duplicating or rewriting canonical content', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/20260923120000_bilingual_content_localisation.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column language_code text/);
  assert.match(sql, /create table public\.activity_translations/);
  assert.match(sql, /primary key \(activity_id, locale\)/);
  assert.match(sql, /references public\.activities\(id\) on delete cascade/);
  assert.match(sql, /create table public\.resource_translations/);
  assert.match(sql, /primary key \(resource_id, locale\)/);
  assert.match(sql, /references public\.resources\(id\) on delete cascade/);
  assert.match(sql, /has_valid_vital_membership\(\)/);
  assert.match(sql, /revoke all .* authenticated/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.(activities|resources)/i);
  assert.doesNotMatch(sql, /update\s+public\.(activities|resources)/i);
});

test('normal app surfaces use the shared language provider and preference destination', () => {
  const root = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
  const preferences = readFileSync(new URL('../src/features/account/account-preferences.tsx', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../src/app/(auth)/index.tsx', import.meta.url), 'utf8');
  assert.match(root, /<LanguageProvider>/);
  assert.match(root, /<LanguagePreferenceSync/);
  assert.match(preferences, /<LanguageSelector onChange=\{save\}/);
  assert.match(auth, /<LanguageSelector compact/);
});

test('normal member journeys share bilingual controls without translating member content', () => {
  const files = [
    '../src/app/(tabs)/index.tsx',
    '../src/app/(tabs)/discover.tsx',
    '../src/app/activity/[id].tsx',
    '../src/features/saved/saved-activities-screen.tsx',
    '../src/features/community/community-screen.tsx',
    '../src/features/community/community-composer.tsx',
    '../src/features/community/community-detail.tsx',
    '../src/features/account/account-screen.tsx',
    '../src/features/account/account-family.tsx',
    '../src/features/account/account-preferences.tsx',
    '../src/features/account/account-submissions.tsx',
    '../src/features/billing/membership-welcome-modal.tsx',
  ];
  for (const file of files) {
    assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), /useLanguage/);
  }
  const community = readFileSync(new URL('../src/features/community/community-detail.tsx', import.meta.url), 'utf8');
  assert.match(community, /<Text selectable style=\{s\.body\}>\{post\.body\}<\/Text>/);
  assert.doesNotMatch(community, /t\(post\.body\)/);
});

test('language persistence is device-first and account sync remains owner-scoped', () => {
  const provider = readFileSync(new URL('../src/features/localization/language-provider.tsx', import.meta.url), 'utf8');
  const sync = readFileSync(new URL('../src/features/localization/language-preference-sync.tsx', import.meta.url), 'utf8');
  assert.match(provider, /localStorage\?\.setItem\(LANGUAGE_STORAGE_KEY, next\)/);
  assert.match(sync, /\.eq\('profile_id', id\)/);
  assert.match(sync, /update\(\{ language_code: language \}\)/);
  assert.doesNotMatch(sync, /upsert|insert/);
});

test('Welsh Discover search augments rather than replaces canonical English search', () => {
  const activities = readFileSync(new URL('../src/services/activities.ts', import.meta.url), 'utf8');
  assert.match(activities, /from\('activity_translations'\)/);
  assert.match(activities, /discoverSearchFilter\(searchPlan\.literalSearch/);
  assert.match(activities, /translatedSearchIds\.length \? `,id\.in/);
  assert.match(activities, /applyActivityTranslations/);
});
