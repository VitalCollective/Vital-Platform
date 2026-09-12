import { customerSafeErrorMessage } from '../../lib/errors.ts';
import type { ActivitySavesApi } from './activity-saves-api.ts';

export type ActivitySaveState = {
  saved: boolean | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
};

// One controller per member/activity, not a global bookmark cache. Reopening or
// refocusing the detail reads Supabase again; account changes get fresh state.
export function createActivitySaveController(
  api: ActivitySavesApi,
  profileId: string,
  activityId: string,
) {
  let state: ActivitySaveState = {
    saved: null, isLoading: true, isSaving: false, error: null,
  };
  let request = 0;
  const listeners = new Set<() => void>();
  function update(next: ActivitySaveState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async refresh() {
      // A focus event must not overwrite a pending optimistic write with an
      // earlier database value. That write will settle and publish its result.
      if (state.isSaving) return;
      const current = ++request;
      update({ ...state, isLoading: true, error: null });
      try {
        const saved = await api.read(profileId, activityId);
        if (current === request) update({ saved, isLoading: false, isSaving: false, error: null });
      } catch (error) {
        if (current === request) update({
          ...state, isLoading: false,
          error: customerSafeErrorMessage('Read activity bookmark', error,
            "We couldn't check whether this activity is saved. Please try again."),
        });
      }
    },
    async toggle() {
      // Synchronous gate also rejects a second tap before React has rendered.
      if (state.saved === null || state.isLoading || state.isSaving || state.error) return;
      const previous = state.saved;
      update({ saved: !previous, isLoading: false, isSaving: true, error: null });
      try {
        await api.write(profileId, activityId, !previous);
        update({ ...state, isSaving: false });
      } catch (error) {
        update({ saved: previous, isLoading: false, isSaving: false,
          error: customerSafeErrorMessage('Update activity bookmark', error,
            "We couldn't update your saved activity. Please try again."),
        });
        // Retry reloads the truth before enabling another toggle: a network
        // failure can lose the acknowledgement of an already-committed write.
      }
    },
  };
}
