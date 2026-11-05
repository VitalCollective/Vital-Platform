import { VITAL_SECTIONS, type ActivitySummary } from '../types/content.ts';

export type HomeIdeaCandidate = Pick<
  ActivitySummary,
  'id' | 'section' | 'age_min' | 'age_max' | 'type' | 'tags' | 'duration' | 'collection_labels'
>;

type HomeIdeaSelectionOptions = {
  childAges?: readonly number[];
  count?: number;
  utcDay?: number;
};

const KIDS_AGE_BANDS = ['2-4', '5-7', '8-10', '11-13', 'all-ages', 'other'] as const;

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function numericAgeRange(candidate: HomeIdeaCandidate): [number, number] | null {
  const minimum = Number(candidate.age_min);
  const maximum = Number(candidate.age_max);
  return Number.isFinite(minimum) && Number.isFinite(maximum)
    ? [minimum, maximum]
    : null;
}

function kidsAgeBand(candidate: HomeIdeaCandidate): (typeof KIDS_AGE_BANDS)[number] {
  const range = numericAgeRange(candidate);
  if (!range) {
    return candidate.age_min === 'All' || candidate.age_max === 'All' ? 'all-ages' : 'other';
  }
  const [minimum, maximum] = range;
  if (minimum <= 2 && maximum <= 4) return '2-4';
  if (minimum <= 5 && maximum <= 7) return '5-7';
  if (minimum <= 8 && maximum <= 10) return '8-10';
  if (minimum <= 11 && maximum <= 13) return '11-13';
  return 'other';
}

function ageDistance(candidate: HomeIdeaCandidate, age: number): number {
  const range = numericAgeRange(candidate);
  if (!range) return kidsAgeBand(candidate) === 'all-ages' ? 0 : Number.POSITIVE_INFINITY;
  const [minimum, maximum] = range;
  if (age < minimum) return minimum - age;
  if (age > maximum) return age - maximum;
  return 0;
}

function kidsCandidatesForDay(
  candidates: readonly HomeIdeaCandidate[],
  childAges: readonly number[],
  utcDay: number,
): HomeIdeaCandidate[] {
  const ages = [...new Set(childAges.filter((age) => Number.isInteger(age) && age >= 0 && age <= 17))]
    .sort((left, right) => left - right);

  if (ages.length) {
    const targetAge = ages[utcDay % ages.length];
    const distances = candidates.map((candidate) => ageDistance(candidate, targetAge));
    const closestDistance = Math.min(...distances);
    return candidates.filter((_, index) => distances[index] === closestDistance);
  }

  const populatedBands = KIDS_AGE_BANDS.filter((band) =>
    candidates.some((candidate) => kidsAgeBand(candidate) === band),
  );
  if (!populatedBands.length) return [...candidates];
  const dailyBand = populatedBands[utcDay % populatedBands.length];
  return candidates.filter((candidate) => kidsAgeBand(candidate) === dailyBand);
}

function similarityPenalty(
  candidate: HomeIdeaCandidate,
  selected: readonly HomeIdeaCandidate[],
): number {
  return selected.reduce((penalty, existing) => {
    const existingTags = new Set(existing.tags ?? []);
    const sharedTags = (candidate.tags ?? []).filter((tag) => existingTags.has(tag)).length;
    const sharedCollections = new Set(existing.collection_labels ?? []);
    const collectionOverlap = (candidate.collection_labels ?? [])
      .filter((label) => sharedCollections.has(label)).length;
    return penalty
      + sharedTags * 2
      + collectionOverlap * 2
      + (candidate.type === existing.type ? 1 : 0)
      + (candidate.duration && candidate.duration === existing.duration ? 1 : 0);
  }, 0);
}

function orderedCandidates(
  candidates: readonly HomeIdeaCandidate[],
  selected: readonly HomeIdeaCandidate[],
  seed: string,
): HomeIdeaCandidate[] {
  return [...candidates].sort((left, right) => {
    const penaltyDifference = similarityPenalty(left, selected) - similarityPenalty(right, selected);
    if (penaltyDifference) return penaltyDifference;
    const hashDifference = stableHash(`${seed}:${left.id}`) - stableHash(`${seed}:${right.id}`);
    return hashDifference || left.id.localeCompare(right.id);
  });
}

export function currentUtcDay(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}

export function selectHomeIdeaIds(
  candidates: readonly HomeIdeaCandidate[],
  options: HomeIdeaSelectionOptions = {},
): string[] {
  const count = Math.max(0, options.count ?? 3);
  if (!count || !candidates.length) return [];

  const utcDay = options.utcDay ?? currentUtcDay();
  const childAges = options.childAges ?? [];
  const sectionOffset = ((utcDay % VITAL_SECTIONS.length) + VITAL_SECTIONS.length)
    % VITAL_SECTIONS.length;
  const dailySections = VITAL_SECTIONS.map(
    (_, index) => VITAL_SECTIONS[(index + sectionOffset) % VITAL_SECTIONS.length],
  );
  const selected: HomeIdeaCandidate[] = [];

  for (const section of dailySections) {
    if (selected.length >= count) break;
    let sectionCandidates = candidates.filter(
      (candidate) => candidate.section === section && !selected.some(({ id }) => id === candidate.id),
    );
    if (section === 'Vital Kids') {
      sectionCandidates = kidsCandidatesForDay(sectionCandidates, childAges, utcDay);
    }
    const [choice] = orderedCandidates(
      sectionCandidates,
      selected,
      `${utcDay}:${section}`,
    );
    if (choice) selected.push(choice);
  }

  if (selected.length < count) {
    const remaining = candidates.filter(
      (candidate) => !selected.some(({ id }) => id === candidate.id),
    );
    selected.push(...orderedCandidates(remaining, selected, `${utcDay}:remainder`)
      .slice(0, count - selected.length));
  }

  return selected.map(({ id }) => id);
}
