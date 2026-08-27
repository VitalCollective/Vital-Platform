import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  DatabaseVerificationResult,
  ImportPlan,
  SourceSetSnapshot,
} from "./types.js";
import {
  compareSourceSets,
  expectedSourceSet,
  formatVerificationFailure,
  relationshipKey,
} from "./verification.js";

const DEFAULT_BATCH_SIZE = 100;
const VERIFICATION_PAGE_SIZE = 1_000;

async function upsertBatches<T extends object>(
  client: SupabaseClient,
  table: string,
  rows: T[],
  onConflict: string,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += DEFAULT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + DEFAULT_BATCH_SIZE);
    const { error } = await client.from(table).upsert(batch, {
      onConflict,
      ignoreDuplicates: false,
    });
    if (error) {
      throw new Error(`${table} upsert failed for rows ${offset + 1}-${offset + batch.length}: ${error.message}`);
    }
  }
}

export interface ImportResult {
  resources: number;
  activities: number;
  relationships: number;
  verification: DatabaseVerificationResult;
}

async function selectExistingIds(
  client: SupabaseClient,
  table: "activities" | "resources",
  expectedIds: string[],
): Promise<string[]> {
  const found: string[] = [];
  for (let offset = 0; offset < expectedIds.length; offset += DEFAULT_BATCH_SIZE) {
    const batch = expectedIds.slice(offset, offset + DEFAULT_BATCH_SIZE);
    const { data, error } = await client.from(table).select("id").in("id", batch);
    if (error) throw new Error(`Post-import verification query failed for ${table}: ${error.message}`);
    for (const row of data ?? []) {
      if (typeof row.id === "string") found.push(row.id);
    }
  }
  return found;
}

async function selectExistingRelationships(
  client: SupabaseClient,
  expectedActivityIds: string[],
): Promise<string[]> {
  const found: string[] = [];
  for (let offset = 0; offset < expectedActivityIds.length; offset += DEFAULT_BATCH_SIZE) {
    const batch = expectedActivityIds.slice(offset, offset + DEFAULT_BATCH_SIZE);
    for (let pageStart = 0; ; pageStart += VERIFICATION_PAGE_SIZE) {
      const { data, error } = await client
        .from("activity_resources")
        .select("activity_id,resource_id")
        .in("activity_id", batch)
        .order("activity_id", { ascending: true })
        .order("resource_id", { ascending: true })
        .range(pageStart, pageStart + VERIFICATION_PAGE_SIZE - 1);
      if (error) throw new Error(`Post-import verification query failed for activity_resources: ${error.message}`);
      for (const row of data ?? []) {
        if (typeof row.activity_id === "string" && typeof row.resource_id === "string") {
          found.push(relationshipKey(row.activity_id, row.resource_id));
        }
      }
      if ((data?.length ?? 0) < VERIFICATION_PAGE_SIZE) break;
    }
  }
  return found;
}

async function verifyDatabaseImport(
  client: SupabaseClient,
  plan: ImportPlan,
): Promise<DatabaseVerificationResult> {
  const expected = expectedSourceSet(plan);
  const actual: SourceSetSnapshot = {
    activityIds: await selectExistingIds(client, "activities", expected.activityIds),
    resourceIds: await selectExistingIds(client, "resources", expected.resourceIds),
    relationshipKeys: await selectExistingRelationships(client, expected.activityIds),
  };
  const result = compareSourceSets(expected, actual);
  if (result.status === "FAIL") throw new Error(formatVerificationFailure(result));
  return result;
}

export async function executeDatabaseImport(plan: ImportPlan): Promise<ImportResult> {
  if (!plan.report.readyToImport) {
    throw new Error("Refusing to import because validation did not pass.");
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Execute mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment.");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Foreign-key-safe order. Stable primary/composite keys make every upsert repeatable.
  await upsertBatches(client, "resources", plan.resources, "id");
  await upsertBatches(client, "activities", plan.activities, "id");
  await upsertBatches(client, "activity_resources", plan.relationships, "activity_id,resource_id");

  const verification = await verifyDatabaseImport(client, plan);

  return {
    resources: plan.resources.length,
    activities: plan.activities.length,
    relationships: plan.relationships.length,
    verification,
  };
}
