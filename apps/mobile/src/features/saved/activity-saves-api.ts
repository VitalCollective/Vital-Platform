import type { SupabaseClient } from '@supabase/supabase-js';

import { withFutureJwtTimingRetry } from '../../lib/errors.ts';
import type { ActivitySummary } from '../../types/content.ts';

export type ActivitySavesApi = {
  read: (profileId: string, activityId: string) => Promise<boolean>;
  write: (profileId: string, activityId: string, saved: boolean) => Promise<void>;
};

export type SavedActivitiesApi = ActivitySavesApi & {
  list: (profileId: string) => Promise<ActivitySummary[]>;
};

const SAVED_ACTIVITY_FIELDS = 'id,section,title,age_min,age_max,summary,type,tags,duration,indoor,outdoor,equipment,physical_benefits,mental_benefits,weather,collection_labels';
const SAVED_PAGE_SIZE = 100;

// The simple bookmark uses the existing favourite list. Try Later is separate:
// neither reading nor removing a favourite changes any try_later row.
export const ACTIVITY_SAVE_LIST = 'favourite';

// Only in-flight operations, not a second store of saved state. A remounted
// detail must not read the old row while its previous save is still committing.
const writesByClient = new WeakMap<SupabaseClient, Map<string, Promise<void>>>();

export function createActivitySavesApi(client: SupabaseClient): SavedActivitiesApi {
  const writes = writesByClient.get(client) ?? new Map<string, Promise<void>>();
  writesByClient.set(client, writes);
  const keyFor = (profileId: string, activityId: string) => JSON.stringify([profileId, activityId]);
  async function requireCurrentMember(profileId: string) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!profileId || data.session?.user.id !== profileId) {
      throw new Error('Activity bookmark session changed.');
    }
    // This is a local race guard, not authorization. The member JWT and existing
    // ownership + genuine-member RLS policies remain authoritative on every call.
  }

  return {
    async list(profileId) {
      // Returning from detail can happen before its optimistic write settles.
      await Promise.all([...writes.entries()]
        .filter(([key]) => JSON.parse(key)[0] === profileId)
        .map(([, pending]) => pending.catch(() => undefined)));
      return withFutureJwtTimingRetry(async () => {
        const activities = new Map<string, ActivitySummary>();
        for (let offset = 0; ; offset += SAVED_PAGE_SIZE) {
          await requireCurrentMember(profileId);
          const { data, error } = await client.from('saved_activities')
            .select(`activity:activities!inner(${SAVED_ACTIVITY_FIELDS})`)
            .eq('profile_id', profileId)
            .eq('list_type', ACTIVITY_SAVE_LIST)
            .eq('activity.status', 'published')
            .order('created_at', { ascending: false })
            .order('activity_id', { ascending: true })
            .range(offset, offset + SAVED_PAGE_SIZE - 1);
          if (error) throw error;
          const rows = (data ?? []) as unknown as { activity: ActivitySummary }[];
          for (const row of rows) activities.set(row.activity.id, row.activity);
          if (rows.length < SAVED_PAGE_SIZE) break;
        }
        await requireCurrentMember(profileId);
        return [...activities.values()];
      });
    },
    async read(profileId, activityId) {
      await writes.get(keyFor(profileId, activityId))?.catch(() => undefined);
      return withFutureJwtTimingRetry(async () => {
        await requireCurrentMember(profileId);
        const { data, error } = await client.from('saved_activities')
          .select('activity_id')
          .eq('profile_id', profileId)
          .eq('activity_id', activityId)
          .eq('list_type', ACTIVITY_SAVE_LIST)
          .maybeSingle();
        if (error) throw error;
        return data !== null;
      });
    },
    write(profileId, activityId, saved) {
      const key = keyFor(profileId, activityId);
      const pending = (writes.get(key) ?? Promise.resolve()).catch(() => undefined)
        .then(() => withFutureJwtTimingRetry(async () => {
          await requireCurrentMember(profileId);
          if (saved) {
            // Idempotent, including retry after a lost response. Read the returned
            // row so denied/missing writes cannot masquerade as a successful save.
            const { error } = await client.from('saved_activities').upsert({
              profile_id: profileId, activity_id: activityId, list_type: ACTIVITY_SAVE_LIST,
            }, { onConflict: 'profile_id,activity_id,list_type' }).select('activity_id').single();
            if (error) throw error;
          } else {
            const { error } = await client.from('saved_activities').delete()
              .eq('profile_id', profileId)
              .eq('activity_id', activityId)
              .eq('list_type', ACTIVITY_SAVE_LIST);
            if (error) throw error;
          }
        }));
      writes.set(key, pending);
      const settled = () => { if (writes.get(key) === pending) writes.delete(key); };
      void pending.then(settled, settled);
      return pending;
    },
  };
}
