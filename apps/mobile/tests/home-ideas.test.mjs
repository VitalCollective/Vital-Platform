import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { selectHomeIdeaIds } from '../src/lib/home-ideas.ts';

const SECTION_SPECS = [
  ['Vital Kids', 'VK', 100],
  ['Vital Together', 'VT', 93],
  ['Vital Life', 'VL', 90],
  ['Vital Food', 'VF', 90],
  ['Vital Mums', 'VM', 90],
];
const KIDS_BANDS = [
  ['2', '4'],
  ['5', '7'],
  ['8', '10'],
  ['11', '13'],
];

function candidate(section, prefix, index) {
  const [age_min, age_max] = section === 'Vital Kids'
    ? KIDS_BANDS[index % KIDS_BANDS.length]
    : ['All', 'All'];
  return {
    id: `${prefix}-${age_min}-${age_max}-${String(index + 1).padStart(4, '0')}`,
    section,
    age_min,
    age_max,
    type: index % 3 === 0 ? 'Game' : index % 3 === 1 ? 'Activity' : 'Challenge',
    tags: [`tag-${index % 9}`, `theme-${index % 5}`],
    duration: ['5 mins', '20 mins', '45 mins', 'Varies'][index % 4],
    collection_labels: index % 11 === 0 ? ['Printable companion'] : [],
  };
}

const catalogue = SECTION_SPECS.flatMap(([section, prefix, count]) =>
  Array.from({ length: count }, (_, index) => candidate(section, prefix, index)),
);

function selected(candidates, options) {
  const ids = selectHomeIdeaIds(candidates, options);
  return ids.map((id) => candidates.find((item) => item.id === id));
}

test('realistic 463-activity structure exposes later catalogue entries, not a 15-item prefix', () => {
  assert.equal(catalogue.length, 463);
  const seen = new Set();
  for (let utcDay = 0; utcDay < 366; utcDay += 1) {
    selectHomeIdeaIds(catalogue, { utcDay }).forEach((id) => seen.add(id));
  }

  assert.ok(seen.size > 200, `expected broad discovery, saw ${seen.size} activities`);
  assert.ok([...seen].some((id) => Number(id.split('-').at(-1)) > 50));
  assert.ok([...seen].some((id) => catalogue.find((item) => item.id === id)?.collection_labels.length));
});

test('recorded child ages keep Kids ideas relevant and rotate mixed family ages', () => {
  const younger = Array.from({ length: 20 }, (_, utcDay) =>
    selected(catalogue, { utcDay, childAges: [3] }).find(({ section }) => section === 'Vital Kids'),
  ).filter(Boolean);
  assert.ok(younger.length);
  assert.ok(younger.every(({ age_min, age_max }) => age_min === '2' && age_max === '4'));

  const mixedBands = new Set();
  for (let utcDay = 0; utcDay < 20; utcDay += 1) {
    const kids = selected(catalogue, { utcDay, childAges: [3, 9] })
      .find(({ section }) => section === 'Vital Kids');
    if (kids) mixedBands.add(`${kids.age_min}-${kids.age_max}`);
  }
  assert.deepEqual([...mixedBands].sort(), ['2-4', '8-10']);
});

test('unknown family ages use a balanced Kids age-band fallback', () => {
  const bands = new Set();
  for (let utcDay = 0; utcDay < 30; utcDay += 1) {
    const kids = selected(catalogue, { utcDay })
      .find(({ section }) => section === 'Vital Kids');
    if (kids) bands.add(`${kids.age_min}-${kids.age_max}`);
  }
  assert.deepEqual([...bands].sort(), ['11-13', '2-4', '5-7', '8-10']);
});

test('selection is stable within a UTC day, unique, and section-diverse', () => {
  const first = selectHomeIdeaIds(catalogue, { utcDay: 20_000 });
  const second = selectHomeIdeaIds([...catalogue].reverse(), { utcDay: 20_000 });
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  assert.equal(new Set(selected(catalogue, { utcDay: 20_000 }).map(({ section }) => section)).size, 3);
});

test('small and empty eligible pools are handled without duplicates or failure', () => {
  assert.deepEqual(selectHomeIdeaIds([], { utcDay: 1 }), []);
  const small = catalogue.slice(0, 2);
  assert.deepEqual(selectHomeIdeaIds(small, { utcDay: 1 }).sort(), small.map(({ id }) => id).sort());
});

test('Home keeps published-content and authenticated-family query boundaries', () => {
  const service = readFileSync(
    new URL('../src/services/activities.ts', import.meta.url),
    'utf8',
  );
  const hook = readFileSync(
    new URL('../src/features/activities/activity-hooks.ts', import.meta.url),
    'utf8',
  );
  const homeService = service.slice(
    service.indexOf('async function homeChildAges'),
    service.indexOf('async function runDiscoverQuery'),
  );

  assert.equal(homeService.match(/\.eq\('status', 'published'\)/g)?.length, 2);
  assert.match(homeService, /\.eq\('owner_id', userId\)/);
  assert.match(homeService, /relationship === 'Child'/);
  assert.doesNotMatch(homeService, /HOME_SECTION_POOL_SIZE|\.limit\(3\)/);
  assert.match(hook, /fetchIdeasForToday\(language, userId\)/);
  assert.match(hook, /currentRequestId === requestId\.current/);
});
