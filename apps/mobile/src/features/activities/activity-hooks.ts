import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchActivityWithResources,
  fetchDiscoverActivities,
  fetchIdeasForToday,
} from '@/services/activities';
import { fetchSectionActivities } from '@/features/activities/section-activities-api';
import { customerSafeErrorMessage } from '@/lib/errors';
import { requireSupabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/request-lifecycle';
import type {
  ActivitySummary,
  ActivityWithResources,
  AgeFilter,
  DiscoverFilters,
  DiscoverResult,
  VitalSection,
} from '@/types/content';
import { useLanguage } from '@/features/localization/language-context';

type AsyncState<T> = {
  data: T | null;
  error: string | null;
  isLoading: boolean;
};

export function useIdeasForToday() {
  const { language, t } = useLanguage();
  const [state, setState] = useState<AsyncState<ActivitySummary[]>>({
    data: null,
    error: null,
    isLoading: true,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const data = await withRequestTimeout(fetchIdeasForToday(language));
      setState({ data, error: null, isLoading: false });
    } catch (error) {
      setState({
        data: null,
        error: customerSafeErrorMessage(
          'Unable to load Home ideas',
          error,
          t("We couldn't load your ideas just now."),
        ),
        isLoading: false,
      });
    }
  }, [language, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, retry: load };
}

export function useDiscoverActivities(filters: DiscoverFilters) {
  const { language, t } = useLanguage();
  const requestId = useRef(0);
  const [state, setState] = useState<AsyncState<DiscoverResult>>({
    data: null,
    error: null,
    isLoading: true,
  });

  const { age, duration, environment, limit, search, section } = filters;
  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const data = await withRequestTimeout(fetchDiscoverActivities({
        environment,
        age,
        duration,
        limit,
        search,
        section,
      }, language));
      if (currentRequestId === requestId.current) {
        setState({ data, error: null, isLoading: false });
      }
    } catch (error) {
      if (currentRequestId === requestId.current) {
        setState({
          data: null,
          error: customerSafeErrorMessage(
            'Unable to load Discover activities',
            error,
            t("We couldn't load activities just now."),
          ),
          isLoading: false,
        });
      }
    }
  }, [age, duration, environment, language, limit, search, section, t]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return { ...state, retry: load };
}

export function useSectionActivities(section: VitalSection, age: AgeFilter) {
  const { language, t } = useLanguage();
  const requestId = useRef(0);
  const [state, setState] = useState<AsyncState<DiscoverResult>>({
    data: null,
    error: null,
    isLoading: true,
  });

  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const data = await withRequestTimeout(
        fetchSectionActivities(requireSupabase(), section, age, language),
      );
      if (currentRequestId === requestId.current) {
        setState({ data, error: null, isLoading: false });
      }
    } catch (error) {
      if (currentRequestId === requestId.current) {
        setState({
          data: null,
          error: customerSafeErrorMessage(
            `Unable to load ${section} activities`,
            error,
            t("We couldn't load these activities just now."),
          ),
          isLoading: false,
        });
      }
    }
  }, [age, language, section, t]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return { ...state, retry: load };
}

export function useActivity(activityId: string | undefined) {
  const { language, t } = useLanguage();
  const requestId = useRef(0);
  const [state, setState] = useState<AsyncState<ActivityWithResources>>({
    data: null,
    error: null,
    isLoading: true,
  });

  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    if (!activityId) {
      setState({ data: null, error: 'No activity was selected.', isLoading: false });
      return;
    }

    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const data = await withRequestTimeout(fetchActivityWithResources(activityId, language));
      if (currentRequestId === requestId.current) {
        setState({ data, error: null, isLoading: false });
      }
    } catch (error) {
      if (currentRequestId === requestId.current) {
        setState({
          data: null,
          error: customerSafeErrorMessage(
            'Unable to load activity details',
            error,
            t("We couldn't load this activity just now."),
          ),
          isLoading: false,
        });
      }
    }
  }, [activityId, language, t]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return { ...state, retry: load };
}
