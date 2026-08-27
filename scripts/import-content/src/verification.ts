import type {
  DatabaseVerificationResult,
  ImportPlan,
  SourceSetSnapshot,
} from "./types.js";

export function relationshipKey(activityId: string, resourceId: string): string {
  return `${activityId}::${resourceId}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function expectedSourceSet(
  plan: Pick<ImportPlan, "activities" | "resources" | "relationships">,
): SourceSetSnapshot {
  return {
    activityIds: uniqueSorted(plan.activities.map((activity) => activity.id)),
    resourceIds: uniqueSorted(plan.resources.map((resource) => resource.id)),
    relationshipKeys: uniqueSorted(
      plan.relationships.map((relationship) =>
        relationshipKey(relationship.activity_id, relationship.resource_id),
      ),
    ),
  };
}

function missingValues(expected: string[], actual: string[]): string[] {
  const actualSet = new Set(actual);
  return expected.filter((value) => !actualSet.has(value));
}

export function compareSourceSets(
  expected: SourceSetSnapshot,
  actual: SourceSetSnapshot,
): DatabaseVerificationResult {
  const missing = {
    activityIds: missingValues(expected.activityIds, actual.activityIds),
    resourceIds: missingValues(expected.resourceIds, actual.resourceIds),
    relationshipKeys: missingValues(expected.relationshipKeys, actual.relationshipKeys),
  };
  const status =
    missing.activityIds.length === 0 &&
    missing.resourceIds.length === 0 &&
    missing.relationshipKeys.length === 0
      ? "PASS"
      : "FAIL";

  return {
    status,
    expected: {
      activities: expected.activityIds.length,
      resources: expected.resourceIds.length,
      relationships: expected.relationshipKeys.length,
    },
    verified: {
      activities: expected.activityIds.length - missing.activityIds.length,
      resources: expected.resourceIds.length - missing.resourceIds.length,
      relationships: expected.relationshipKeys.length - missing.relationshipKeys.length,
    },
    missing,
  };
}

export function formatVerificationFailure(result: DatabaseVerificationResult): string {
  const details: string[] = [];
  if (result.missing.activityIds.length > 0) {
    details.push(`missing activity IDs (${result.missing.activityIds.length}): ${result.missing.activityIds.join(", ")}`);
  }
  if (result.missing.resourceIds.length > 0) {
    details.push(`missing resource IDs (${result.missing.resourceIds.length}): ${result.missing.resourceIds.join(", ")}`);
  }
  if (result.missing.relationshipKeys.length > 0) {
    details.push(
      `missing relationship keys (${result.missing.relationshipKeys.length}): ${result.missing.relationshipKeys.join(", ")}`,
    );
  }
  return `Post-import database verification failed: ${details.join("; ")}.`;
}
