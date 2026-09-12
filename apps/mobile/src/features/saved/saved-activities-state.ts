import { customerSafeErrorMessage } from '../../lib/errors.ts';
import type { ActivitySummary } from '../../types/content.ts';
import type { SavedActivitiesApi } from './activity-saves-api.ts';

type SavedActivitiesState = {
  activities: ActivitySummary[] | null;
  isLoading: boolean;
  error: string | null;
  visibleCount: number;
};

export function createSavedActivitiesController(api: Pick<SavedActivitiesApi, 'list'>, profileId: string) {
  let state: SavedActivitiesState = { activities: null, isLoading: true, error: null, visibleCount: 20 };
  let request = 0;
  const listeners = new Set<() => void>();
  function update(next: SavedActivitiesState) {
    state = next;
    listeners.forEach(listener => listener());
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async refresh() {
      const current = ++request;
      update({ ...state, isLoading: true, error: null });
      try {
        const activities = await api.list(profileId);
        if (current === request) update({ activities, isLoading: false, error: null, visibleCount: 20 });
      } catch (error) {
        if (current === request) update({ ...state, isLoading: false,
          error: customerSafeErrorMessage('Load saved activities', error,
            "We couldn't load your saved activities just now. Please try again."),
        });
      }
    },
    showMore() {
      if (!state.isLoading && !state.error) update({ ...state, visibleCount: state.visibleCount + 20 });
    },
  };
}
