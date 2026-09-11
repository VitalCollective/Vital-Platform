type DurationGroup = 'quick' | 'half-hour' | 'hour' | 'longer' | 'flexible';

type SearchableActivity = {
  id: string;
  section: string;
  title: string;
  summary: string | null;
  type: string;
  tags: string[];
  indoor?: boolean;
  outdoor?: boolean;
  duration?: string | null;
  equipment?: string | null;
  physical_benefits?: string | null;
  mental_benefits?: string | null;
  weather?: string | null;
  collection_labels?: string[];
};

export type DiscoverSearchIntent =
  | 'indoor'
  | 'outdoor'
  | 'movement'
  | 'quick'
  | 'no-equipment'
  | 'calm';

export type DiscoverSearchPlan = {
  normalizedSearch: string;
  literalSearch: string;
  intents: DiscoverSearchIntent[];
};

type DiscoverIntentDefinition = {
  intent: DiscoverSearchIntent;
  phrases: readonly string[];
};

const DISCOVER_INTENT_DEFINITIONS: readonly DiscoverIntentDefinition[] = [
  {
    intent: 'indoor',
    phrases: [
      'rainy day',
      'raining',
      'stuck indoors',
      'stuck inside',
      'stay indoors',
      'inside activity',
      'indoor activity',
      'indoors',
      'inside',
    ],
  },
  {
    intent: 'outdoor',
    phrases: [
      'get outside',
      'get outdoors',
      'fresh air',
      'outside activity',
      'outdoor activity',
      'outdoors',
      'outside',
    ],
  },
  {
    intent: 'movement',
    phrases: [
      'burn off energy',
      'burn energy',
      'get moving',
      'move around',
      'physical activity',
      'something active',
      'active',
      'exercise',
    ],
  },
  {
    intent: 'quick',
    phrases: [
      'not much time',
      'before dinner',
      'ten minutes',
      '10 minutes',
      'five minutes',
      '5 minutes',
      'short activity',
      'something quick',
      'quick activity',
      'quick',
    ],
  },
  {
    intent: 'no-equipment',
    phrases: [
      'without equipment',
      'no equipment',
      'nothing needed',
      'no supplies',
    ],
  },
  {
    intent: 'calm',
    phrases: [
      'something quiet',
      'quiet activity',
      'calm down',
      'something calm',
      'settle down',
      'wind down',
      'quiet',
      'calm',
    ],
  },
] as const;

const intentServerFilters: Readonly<
  Partial<Record<DiscoverSearchIntent, string>>
> = {
  movement: [
    'title.ilike.*obstacle*',
    'title.ilike.*dance*',
    'title.ilike.*chase*',
    'summary.ilike.*movement*',
    'summary.ilike.*active*',
    'instructions.ilike.*running*',
    'instructions.ilike.*jumping*',
    'physical_benefits.ilike.*running*',
    'physical_benefits.ilike.*jumping*',
    'physical_benefits.ilike.*movement*',
    'physical_benefits.ilike.*cardiovascular*',
    'physical_benefits.ilike.*agility*',
    'physical_benefits.ilike.*climbing*',
    'physical_benefits.ilike.*throwing*',
    'physical_benefits.ilike.*dancing*',
    'physical_benefits.ilike.*cycling*',
    'tags.cs.{movement}',
    'tags.cs.{running}',
    'tags.cs.{dance}',
    'tags.cs.{exercise}',
  ].join(','),
  'no-equipment': 'equipment.eq.None',
  calm: [
    'title.ilike.*quiet*',
    'title.ilike.*calm*',
    'title.ilike.*breath*',
    'summary.ilike.*quiet*',
    'summary.ilike.*calm*',
    'summary.ilike.*relax*',
    'instructions.ilike.*quiet*',
    'instructions.ilike.*calm*',
    'instructions.ilike.*breath*',
    'mental_benefits.ilike.*mindfulness*',
    'mental_benefits.ilike.*relaxation*',
    'tags.cs.{calm}',
    'tags.cs.{mindfulness}',
    'tags.cs.{breathing}',
    'tags.cs.{relaxation}',
    'tags.cs.{silence}',
  ].join(','),
};

const movementEvidencePattern =
  /\b(active|agility|cardiovascular|chase|climb(?:ing)?|cycl(?:e|ing)|danc(?:e|ing)|exercise|jump(?:ing)?|movement|obstacle|run(?:ning)?|throw(?:ing)?)\b/i;
const calmEvidencePattern =
  /\b(breath(?:e|ing)?|calm|mindful(?:ness)?|quiet|relax(?:ation|ing)?|silence|wind down)\b/i;
const intentFillerWords = new Set([
  'a',
  'an',
  'activity',
  'do',
  'for',
  'idea',
  'me',
  'please',
  'something',
  'the',
  'to',
  'us',
]);

const SOURCE_DURATION_VALUES = [
  '1 min',
  '1–2 hours',
  '1–2 mins',
  '1–3 hours',
  '1–3 mins',
  '1–5 mins',
  '10 mins',
  '10 mins monthly',
  '10–15 mins',
  '10–20 mins',
  '10–20 mins extra',
  '10–20 mins weekly',
  '10–25 mins',
  '10–30 mins',
  '10–45 mins',
  '10–60 mins',
  '15 mins',
  '15 mins per observation',
  '15 mins setup',
  '15–25 mins',
  '15–30 mins',
  '15–35 mins',
  '15–40 mins',
  '15–45 mins',
  '15–60 mins',
  '2 mins',
  '2–10 mins',
  '2–3 hours',
  '2–4 hours',
  '2–4 mins',
  '2–5 mins',
  '2–5 mins after cooking',
  '20 mins',
  '20–30 mins',
  '20–30 mins weekly',
  '20–40 mins',
  '20–45 mins',
  '20–60 mins',
  '25–45 mins',
  '25–50 mins',
  '3 mins',
  '3–10 mins',
  '3–5 hours',
  '3–5 mins',
  '30 mins spread across the day',
  '30–45 mins',
  '30–45 mins per visit',
  '30–60 mins',
  '30–90 mins',
  '45–60 mins',
  '45–60 mins (plus future visits)',
  '45–60 mins per visit',
  '45–75 mins',
  '45–75 mins per visit',
  '45–90 mins',
  '5 mins',
  '5 mins daily',
  '5–10 mins',
  '5–10 mins daily',
  '5–15 mins',
  '5–20 mins',
  '5–30 mins',
  '60–120 mins',
  '60–120 mins per visit',
  '60–180 mins',
  '60–90 mins',
  '90–120 mins',
  '90–150 mins',
  '90–180 mins',
  'All day',
  'Always available',
  'Before cooking',
  'During shopping',
  'Length of phone call',
  'One evening',
  'One meal',
  'Ongoing',
  'Ongoing (20–30 mins per observation)',
  'Ongoing (20–30 mins per visit)',
  'Set-up 20 mins; Review 20–40 mins',
  'Several meals',
  'Throughout cooking',
  'Throughout the day',
  'Varies',
] as const;

const flexibleDurationPattern =
  /always available|before cooking|during shopping|length of|one evening|one meal|ongoing|several meals|throughout|varies/i;

export function durationGroupForValue(value: string): DurationGroup {
  if (flexibleDurationPattern.test(value)) return 'flexible';
  if (/all day|\bhours?\b/i.test(value)) return 'longer';

  const maxima = [...value.matchAll(/(\d+)(?:\s*[–-]\s*(\d+))?\s*mins?/gi)].map(
    (match) => Number(match[2] ?? match[1]),
  );
  const maximumMinutes = maxima.length ? Math.max(...maxima) : null;

  if (maximumMinutes === null) return 'flexible';
  if (maximumMinutes <= 15) return 'quick';
  if (maximumMinutes <= 30) return 'half-hour';
  if (maximumMinutes <= 60) return 'hour';
  return 'longer';
}

const durationFilterValues = SOURCE_DURATION_VALUES.reduce<
  Record<DurationGroup, string[]>
>(
  (groups, value) => {
    groups[durationGroupForValue(value)].push(value);
    return groups;
  },
  { quick: [], 'half-hour': [], hour: [], longer: [], flexible: [] },
);

export function durationsForFilter(filter: string): readonly string[] {
  return filter in durationFilterValues
    ? durationFilterValues[filter as DurationGroup]
    : [];
}

export function interleaveActivityPools<T>(pools: readonly (readonly T[])[]): T[] {
  const result: T[] = [];
  const longestPool = Math.max(0, ...pools.map((pool) => pool.length));

  for (let index = 0; index < longestPool; index += 1) {
    for (const pool of pools) {
      const item = pool[index];
      if (item !== undefined) result.push(item);
    }
  }

  return result;
}

export function normalizeDiscoverSearch(search: string): string {
  return search
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveDiscoverSearch(search: string): DiscoverSearchPlan {
  const normalizedSearch = normalizeDiscoverSearch(search);
  let literalSearch = normalizedSearch;
  const intents: DiscoverSearchIntent[] = [];

  for (const definition of DISCOVER_INTENT_DEFINITIONS) {
    let matched = false;
    for (const phrase of [...definition.phrases].sort(
      (left, right) => right.length - left.length,
    )) {
      if (!` ${literalSearch} `.includes(` ${phrase} `)) continue;
      matched = true;
      literalSearch = ` ${literalSearch} `
        .replaceAll(` ${phrase} `, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (matched) intents.push(definition.intent);
  }

  if (intents.length > 0) {
    literalSearch = literalSearch
      .split(' ')
      .filter((term) => term && !intentFillerWords.has(term))
      .join(' ');
  }

  return { normalizedSearch, literalSearch, intents };
}

export function discoverIntentServerFilter(
  intent: DiscoverSearchIntent,
): string | null {
  return intentServerFilters[intent] ?? null;
}

export function activityMatchesSearchIntent(
  activity: SearchableActivity,
  intent: DiscoverSearchIntent,
): boolean {
  if (intent === 'indoor') return activity.indoor === true;
  if (intent === 'outdoor') return activity.outdoor === true;
  if (intent === 'quick') {
    return Boolean(activity.duration && durationGroupForValue(activity.duration) === 'quick');
  }
  if (intent === 'no-equipment') {
    return normalizeDiscoverSearch(activity.equipment ?? '') === 'none';
  }

  const evidence = [
    activity.title,
    activity.summary,
    activity.type,
    activity.tags.join(' '),
    activity.physical_benefits,
    activity.mental_benefits,
    activity.collection_labels?.join(' '),
  ]
    .filter(Boolean)
    .join(' ');

  return intent === 'movement'
    ? movementEvidencePattern.test(evidence)
    : calmEvidencePattern.test(evidence);
}

export function discoverSearchFilter(
  normalizedSearch: string,
  useFallback: boolean,
): string {
  const terms = normalizedSearch.split(' ').filter(Boolean);
  const filters = [
    ...(useFallback
      ? []
      : [`search_document.wfts(english).${normalizedSearch}`]),
    `title.ilike.*${normalizedSearch}*`,
    `summary.ilike.*${normalizedSearch}*`,
    `instructions.ilike.*${normalizedSearch}*`,
    `equipment.ilike.*${normalizedSearch}*`,
    `section.ilike.*${normalizedSearch}*`,
    `type.ilike.*${normalizedSearch}*`,
    `weather.ilike.*${normalizedSearch}*`,
    ...terms.flatMap((term) => [
      `tags.cs.{${term}}`,
      `collection_labels.cs.{${term}}`,
    ]),
  ];

  return filters.join(',');
}

function normalizedSearchValue(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function searchScore(activity: SearchableActivity, search: string): number {
  const searchPlan = resolveDiscoverSearch(search);
  const phrase = normalizedSearchValue(searchPlan.literalSearch);
  const terms = phrase.split(' ').filter(Boolean);
  const title = normalizedSearchValue(activity.title);
  const summary = normalizedSearchValue(activity.summary ?? '');
  const section = normalizedSearchValue(activity.section);
  const type = normalizedSearchValue(activity.type);
  const tags = activity.tags.map(normalizedSearchValue);

  let score = searchPlan.intents.reduce(
    (total, intent) =>
      total + (activityMatchesSearchIntent(activity, intent) ? 250 : 0),
    0,
  );
  if (phrase) {
    if (title === phrase) score += 1_000;
    else if (title.startsWith(phrase)) score += 600;
    else if (title.includes(phrase)) score += 350;
    if (summary.includes(phrase)) score += 120;
    if (tags.some((tag) => tag === phrase)) score += 180;
    if (section.includes(phrase) || type.includes(phrase)) score += 100;
  }

  for (const term of terms) {
    if (title.includes(term)) score += 70;
    if (tags.some((tag) => tag.includes(term))) score += 45;
    if (summary.includes(term)) score += 20;
    if (section.includes(term) || type.includes(term)) score += 15;
  }

  return score;
}

export function rankActivitiesForSearch<T extends SearchableActivity>(
  activities: readonly T[],
  search: string,
): T[] {
  return [...activities].sort((left, right) => {
    const scoreDifference = searchScore(right, search) - searchScore(left, search);
    if (scoreDifference !== 0) return scoreDifference;

    const titleDifference = left.title.localeCompare(right.title);
    return titleDifference !== 0 ? titleDifference : left.id.localeCompare(right.id);
  });
}
