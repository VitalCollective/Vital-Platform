import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activityMatchesSearchIntent,
  discoverIntentServerFilter,
  discoverSearchFilter,
  durationGroupForValue,
  durationsForFilter,
  interleaveActivityPools,
  normalizeDiscoverSearch,
  rankActivitiesForSearch,
  resolveDiscoverSearch,
} from '../src/lib/discover.ts';

test('maps audited source durations into customer-facing time groups', () => {
  assert.equal(durationGroupForValue('2 mins'), 'quick');
  assert.equal(durationGroupForValue('20–30 mins'), 'half-hour');
  assert.equal(durationGroupForValue('45–60 mins'), 'hour');
  assert.equal(durationGroupForValue('2–4 hours'), 'longer');
  assert.equal(durationGroupForValue('Ongoing'), 'flexible');

  const groupedValues = [
    ...durationsForFilter('quick'),
    ...durationsForFilter('half-hour'),
    ...durationsForFilter('hour'),
    ...durationsForFilter('longer'),
    ...durationsForFilter('flexible'),
  ];
  assert.equal(groupedValues.length, new Set(groupedValues).size);
  assert.equal(groupedValues.includes('Varies'), true);
  assert.equal(groupedValues.includes('All day'), true);
});

test('interleaves discovery lanes with a stable prefix for Show more', () => {
  const firstBatch = interleaveActivityPools([
    ['mums-1', 'mums-2'],
    ['kids-1', 'kids-2'],
    ['food-1', 'food-2'],
  ]);
  const largerBatch = interleaveActivityPools([
    ['mums-1', 'mums-2', 'mums-3'],
    ['kids-1', 'kids-2', 'kids-3'],
    ['food-1', 'food-2', 'food-3'],
  ]);

  assert.deepEqual(firstBatch, [
    'mums-1',
    'kids-1',
    'food-1',
    'mums-2',
    'kids-2',
    'food-2',
  ]);
  assert.deepEqual(largerBatch.slice(0, firstBatch.length), firstBatch);
});

test('ranks exact title and tag matches ahead of incidental summary matches', () => {
  const activities = [
    {
      id: 'summary',
      section: 'Vital Life',
      title: 'A useful pause',
      summary: 'Make bread together.',
      type: 'Activity',
      tags: [],
    },
    {
      id: 'tag',
      section: 'Vital Food',
      title: 'Kitchen basics',
      summary: null,
      type: 'Activity',
      tags: ['bread'],
    },
    {
      id: 'title',
      section: 'Vital Food',
      title: 'Bread',
      summary: null,
      type: 'Activity',
      tags: [],
    },
  ];

  assert.deepEqual(
    rankActivitiesForSearch(activities, 'bread').map(({ id }) => id),
    ['title', 'tag', 'summary'],
  );
});

test('builds a sanitized server search across content and metadata fields', () => {
  const search = normalizeDiscoverSearch('Bread, OUTDOORS!');
  const primary = discoverSearchFilter(search, false);
  const fallback = discoverSearchFilter(search, true);

  assert.equal(search, 'bread outdoors');
  assert.match(primary, /search_document\.wfts\(english\)\.bread outdoors/);
  assert.match(primary, /title\.ilike\.\*bread outdoors\*/);
  assert.match(primary, /tags\.cs\.\{bread\}/);
  assert.match(primary, /tags\.cs\.\{outdoors\}/);
  assert.match(primary, /collection_labels\.cs\.\{outdoors\}/);
  assert.match(primary, /section\.ilike/);
  assert.doesNotMatch(fallback, /search_document/);
  assert.match(fallback, /summary\.ilike/);
});

test('keeps drawing and bread as literal content searches', () => {
  for (const query of ['drawing', 'bread']) {
    const plan = resolveDiscoverSearch(query);
    assert.deepEqual(plan, {
      normalizedSearch: query,
      literalSearch: query,
      intents: [],
    });
    const serverFilter = discoverSearchFilter(plan.literalSearch, false);
    assert.match(serverFilter, new RegExp(`search_document\\.wfts\\(english\\)\\.${query}`));
    assert.match(serverFilter, new RegExp(`title\\.ilike\\.\\*${query}\\*`));
  }
});

test('maps rainy-day language to verified indoor metadata', () => {
  const plan = resolveDiscoverSearch('Something for a rainy day');
  assert.deepEqual(plan.intents, ['indoor']);
  assert.equal(plan.literalSearch, '');

  assert.equal(
    activityMatchesSearchIntent(
      {
        id: 'indoor',
        section: 'Vital Kids',
        title: 'Cushion course',
        summary: null,
        type: 'Activity',
        tags: [],
        indoor: true,
      },
      'indoor',
    ),
    true,
  );
  assert.equal(
    activityMatchesSearchIntent(
      {
        id: 'outdoor',
        section: 'Vital Kids',
        title: 'Park trail',
        summary: null,
        type: 'Activity',
        tags: [],
        indoor: false,
      },
      'indoor',
    ),
    false,
  );
});

test('maps burn-off-energy language to explicit movement evidence', () => {
  const plan = resolveDiscoverSearch('burn off energy');
  assert.deepEqual(plan, {
    normalizedSearch: 'burn off energy',
    literalSearch: '',
    intents: ['movement'],
  });
  assert.match(discoverIntentServerFilter('movement') ?? '', /physical_benefits/);

  assert.equal(
    activityMatchesSearchIntent(
      {
        id: 'active',
        section: 'Vital Kids',
        title: 'Home obstacle course',
        summary: null,
        type: 'Activity',
        tags: ['movement'],
        physical_benefits: 'Running; Jumping; Balance',
      },
      'movement',
    ),
    true,
  );
  assert.equal(
    activityMatchesSearchIntent(
      {
        id: 'quiet',
        section: 'Vital Life',
        title: 'Write a note',
        summary: 'Write one thoughtful sentence.',
        type: 'Activity',
        tags: ['writing'],
      },
      'movement',
    ),
    false,
  );
});

test('combines an intent phrase with remaining literal terms', () => {
  assert.deepEqual(resolveDiscoverSearch('quick drawing'), {
    normalizedSearch: 'quick drawing',
    literalSearch: 'drawing',
    intents: ['quick'],
  });
  assert.equal(discoverIntentServerFilter('no-equipment'), 'equipment.eq.None');
});

test('maps calm, no-equipment, quick, and outside needs narrowly', () => {
  assert.deepEqual(resolveDiscoverSearch('something quiet').intents, ['calm']);
  assert.deepEqual(resolveDiscoverSearch('no equipment').intents, ['no-equipment']);
  assert.deepEqual(resolveDiscoverSearch('not much time').intents, ['quick']);
  assert.deepEqual(resolveDiscoverSearch('get outside').intents, ['outdoor']);

  const quiet = {
    id: 'quiet',
    section: 'Vital Life',
    title: 'Five senses reset',
    summary: 'Pause and notice what is around you.',
    type: 'Activity',
    tags: ['mindfulness', 'calm'],
    mental_benefits: 'Mindfulness; Attention',
  };
  const energetic = {
    id: 'energetic',
    section: 'Vital Kids',
    title: 'Bubble chase',
    summary: 'Run and pop bubbles.',
    type: 'Activity',
    tags: ['running'],
    weather: 'Calm weather outdoors',
  };
  assert.equal(activityMatchesSearchIntent(quiet, 'calm'), true);
  assert.equal(activityMatchesSearchIntent(energetic, 'calm'), false);
});
