import {
  normalizeRevenueCatSubscriber,
  type RevenueCatSubscriberResponse,
  type VerifiedMembershipState,
} from '../_shared/revenuecat.ts';

export type ReconcileMembershipDependencies = {
  verifyUser: (token: string) => Promise<{ id: string } | null>;
  isGenuineProfile: (id: string) => Promise<boolean>;
  fetchSubscriber: (id: string) => Promise<RevenueCatSubscriberResponse>;
  applyState: (id: string, state: VerifiedMembershipState) => Promise<void>;
  clearState: (id: string) => Promise<void>;
  reportFailure?: (code: string) => void;
};

const responseHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};
function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function createReconcileMembershipHandler(dependencies: ReconcileMembershipDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders });
    if (request.method !== 'POST') return json({ reconciled: false, code: 'method_not_allowed' }, 405);
    try {
      const authorization = request.headers.get('Authorization') ?? '';
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match) return json({ reconciled: false, code: 'unauthorized' }, 401);
      const user = await dependencies.verifyUser(match[1]);
      if (!user || !await dependencies.isGenuineProfile(user.id)) {
        return json({ reconciled: false, code: 'unauthorized' }, 401);
      }
      const subscriber = await dependencies.fetchSubscriber(user.id);
      const state = normalizeRevenueCatSubscriber(user.id, subscriber);
      if (state) await dependencies.applyState(user.id, state);
      else await dependencies.clearState(user.id);
      return json({ reconciled: true });
    } catch {
      dependencies.reportFailure?.('reconciliation_failed');
      return json({ reconciled: false, code: 'temporarily_unavailable' }, 503);
    }
  };
}
