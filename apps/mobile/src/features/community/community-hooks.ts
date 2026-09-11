import { useCallback, useEffect, useRef, useState } from 'react';
import { customerSafeErrorMessage, withFutureJwtTimingRetry } from '@/lib/errors';
import { appendCommunityPage, type CommunityPage } from './community-model';

export function useCommunityPage<T extends { id: string }>(load: (offset: number) => Promise<CommunityPage<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const offset = useRef(0);
  const epoch = useRef(0);
  const busy = useRef(false);
  const request = useCallback(async (more: boolean) => {
    if (more && busy.current) return;
    const current = ++epoch.current;
    busy.current = true;
    setError(null);
    if (more) setLoadingMore(true);
    else { setLoading(true); setItems([]); setHasMore(false); offset.current = 0; }
    try {
      // Only reads retry the narrowly recognised bootstrap JWT timing error.
      const page = await withFutureJwtTimingRetry(() => load(more ? offset.current : 0));
      if (epoch.current !== current) return;
      setItems((existing) => more ? appendCommunityPage(existing, page.items) : page.items);
      setHasMore(page.hasMore);
      offset.current = page.nextOffset;
    } catch (cause) {
      if (epoch.current !== current) return;
      setError(customerSafeErrorMessage('Community page', cause, "We couldn't load the conversation just now."));
    } finally {
      if (epoch.current === current) { busy.current = false; setLoading(false); setLoadingMore(false); }
    }
  }, [load]);
  useEffect(() => { void request(false); return () => { epoch.current += 1; busy.current = false; }; }, [request]);
  return { items, loading, loadingMore, hasMore, error, refresh: () => request(false), more: () => request(true) };
}
