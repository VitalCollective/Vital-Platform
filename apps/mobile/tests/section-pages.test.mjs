import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

import {
  activityDetailHref,
  activityIdFromRouteParam,
} from '../src/features/activities/activity-navigation.ts';
import { fetchSectionActivities } from '../src/features/activities/section-activities-api.ts';
import { orderSectionCatalogueActivities } from '../src/lib/discover.ts';

const SECTIONS = [
  ['vital-mums', 'Vital Mums'],
  ['vital-kids', 'Vital Kids'],
  ['vital-together', 'Vital Together'],
  ['vital-life', 'Vital Life'],
  ['vital-food', 'Vital Food'],
];

function activity(id, ageMin, ageMax, indoor, outdoor) {
  return {
    id,
    section: 'Vital Kids',
    title: `Activity ${id}`,
    summary: null,
    type: 'Activity',
    tags: [],
    age_min: ageMin,
    age_max: ageMax,
    indoor,
    outdoor,
  };
}

test('section catalogue ordering is stable, diversified, and not alphabetical', () => {
  const source = [
    activity('VK-001', '2', '4', true, false),
    activity('VK-002', '2', '4', true, false),
    activity('VK-003', '5', '7', false, true),
    activity('VK-004', '5', '7', false, true),
    activity('VK-005', '8', '10', true, true),
    activity('VK-006', '8', '10', true, true),
  ];

  const first = orderSectionCatalogueActivities(source);
  const second = orderSectionCatalogueActivities([...source].reverse());

  assert.deepEqual(first.map(({ id }) => id), second.map(({ id }) => id));
  assert.notDeepEqual(first.map(({ id }) => id), source.map(({ id }) => id));
  assert.equal(new Set(first.slice(0, 3).map(({ age_min }) => age_min)).size, 3);
});

test('show-more slices preserve the initial twenty-item prefix', () => {
  const source = Array.from({ length: 45 }, (_, index) =>
    activity(
      `VK-${String(index + 1).padStart(3, '0')}`,
      String(2 + (index % 4) * 3),
      String(4 + (index % 4) * 3),
      index % 3 !== 1,
      index % 3 !== 0,
    ),
  );
  const ordered = orderSectionCatalogueActivities(source);

  assert.deepEqual(ordered.slice(0, 40).slice(0, 20), ordered.slice(0, 20));
  assert.equal(ordered.slice(0, 20).length, 20);
  assert.equal(ordered.slice(0, 40).length, 40);
});

test('all five section routes use the shared approved activity catalogue', () => {
  for (const [route, section] of SECTIONS) {
    const source = readFileSync(
      new URL(`../src/app/(tabs)/${route}.tsx`, import.meta.url),
      'utf8',
    );
    assert.match(source, /SectionActivityCatalogue/);
    assert.match(source, new RegExp(`title="${section}"`));
    assert.doesNotMatch(source, /SectionPlaceholder/);
  }
});

test('every section loader requests and returns its exact published section', async () => {
  for (const [, section] of SECTIONS) {
    const calls = [];
    const row = {
      ...activity(`${section.replaceAll(' ', '-').toUpperCase()}-001`, '5', '7', true, false),
      section,
      duration: '10 mins',
      equipment: 'None',
      physical_benefits: null,
      mental_benefits: null,
      weather: null,
      collection_labels: [],
    };
    const client = createClient('https://sections.test.invalid', 'public-test-key', {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (url) => {
          calls.push(new URL(url));
          return new Response(JSON.stringify([row]), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Content-Range': '0-0/1',
            },
          });
        },
      },
    });

    const result = await fetchSectionActivities(client, section, 'any');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pathname, '/rest/v1/activities');
    assert.equal(calls[0].searchParams.get('status'), 'eq.published');
    assert.equal(calls[0].searchParams.get('section'), `eq.${section}`);
    assert.equal(result.count, 1);
    assert.deepEqual(result.activities.map((item) => item.section), [section]);
  }
});

test('Welsh section catalogues merge translated fields without changing canonical identity or English fallback', async () => {
  const row = {
    ...activity('VK-5-7-0001', '5', '7', true, false),
    section: 'Vital Kids', title: 'Treasure map', summary: 'Draw a map together',
    duration: '20 mins', equipment: 'Paper', physical_benefits: null,
    mental_benefits: null, weather: null, collection_labels: [],
  };
  const client = createClient('https://sections-welsh.test.invalid', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url) => {
      const target = new URL(url);
      const data = target.pathname.endsWith('/activity_translations')
        ? [{ activity_id: row.id, locale: 'cy', title: 'Map trysor', summary: null }]
        : [row];
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' },
      });
    } },
  });
  const result = await fetchSectionActivities(client, 'Vital Kids', 'any', 'cy');
  assert.equal(result.count, 1);
  assert.equal(result.activities[0].id, row.id);
  assert.equal(result.activities[0].title, 'Map trysor');
  assert.equal(result.activities[0].summary, row.summary);
});

test('a localized-field failure cannot hide canonical English activities in Cymraeg mode', async () => {
  const row = {
    ...activity('VK-5-7-0002', '5', '7', true, false), section: 'Vital Kids',
    title: 'English fallback', summary: 'Still available', duration: '10 mins',
    equipment: 'None', physical_benefits: null, mental_benefits: null,
    weather: null, collection_labels: [],
  };
  const client = createClient('https://sections-welsh-fallback.test.invalid', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url) => {
      const isTranslation = new URL(url).pathname.endsWith('/activity_translations');
      return new Response(JSON.stringify(isTranslation ? { message: 'temporarily unavailable' } : [row]), {
        status: isTranslation ? 503 : 200,
        headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' },
      });
    } },
  });
  const result = await fetchSectionActivities(client, 'Vital Kids', 'any', 'cy');
  assert.equal(result.activities[0].id, row.id);
  assert.equal(result.activities[0].title, row.title);
});

test('shared catalogue keeps the approved card/detail path and required states', () => {
  const source = readFileSync(
    new URL('../src/components/vital/section-activity-catalogue.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /const INITIAL_RESULT_LIMIT = 20/);
  assert.match(source, /label=\{t\('Show more'\)\}/);
  assert.match(source, /<ActivityCard/);
  assert.match(source, /activityDetailHref\(activity\.id\)/);
  assert.match(source, /kind="loading"/);
  assert.match(source, /kind="error"/);
  assert.match(source, /onRetry=/);
  assert.match(source, /No activities in \{section\} yet/);
  assert.match(source, /title === 'Vital Kids' \|\| title === 'Vital Together'/);
  assert.doesNotMatch(source, /label: 'All ages'/);
});

test('section and Discover use the same canonical activity-detail handoff', () => {
  const sectionSource = readFileSync(
    new URL('../src/components/vital/section-activity-catalogue.tsx', import.meta.url),
    'utf8',
  );
  const discoverSource = readFileSync(
    new URL('../src/app/(tabs)/discover.tsx', import.meta.url),
    'utf8',
  );
  const detailSource = readFileSync(
    new URL('../src/app/activity/[id].tsx', import.meta.url),
    'utf8',
  );
  const activityId = 'VK-2-4-0012';
  const href = activityDetailHref(activityId);

  assert.equal(href, '/activity/VK-2-4-0012');
  assert.equal(
    activityIdFromRouteParam(decodeURIComponent(String(href).split('/').at(-1))),
    activityId,
  );
  assert.match(sectionSource, /router\.push\(activityDetailHref\(activity\.id\)\)/);
  assert.match(discoverSource, /router\.push\(activityDetailHref\(activity\.id\)\)/);
  assert.match(detailSource, /activityIdFromRouteParam\(params\.id\)/);
});
