import {
  hashRevenueCatIdentifier,
  isUuid,
  normalizeRevenueCatSubscriber,
  parseRevenueCatEvent,
  verifyRevenueCatSignature,
  type RevenueCatSubscriberResponse,
  type VerifiedMembershipState,
} from '../_shared/revenuecat.ts';

export type EventClaim = 'claimed' | 'duplicate' | 'busy';
export type RevenueCatWebhookDependencies = {
  authorization: string;
  hmacSecret: string;
  nowSeconds: () => number;
  findGenuineProfiles: (ids: string[]) => Promise<string[]>;
  claimEvent: (event: {
    id: string; type: string; environment: 'sandbox' | 'production';
    customerIdHash: string; profileId: string | null;
  }) => Promise<EventClaim>;
  fetchSubscriber: (profileId: string) => Promise<RevenueCatSubscriberResponse>;
  applyState: (profileId: string, state: VerifiedMembershipState) => Promise<void>;
  clearState: (profileId: string) => Promise<void>;
  completeEvent: (id: string, status: 'processed' | 'ignored' | 'failed', errorCode?: string) => Promise<void>;
  reportFailure?: (code: string) => void;
};

const headers = { 'Content-Type': 'application/json' };
function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

export function createRevenueCatWebhookHandler(dependencies: RevenueCatWebhookDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ received: false, code: 'method_not_allowed' }, 405);
    const rawBody = await request.text();
    if (request.headers.get('Authorization') !== dependencies.authorization) {
      return json({ received: false, code: 'unauthorized' }, 401);
    }
    if (!await verifyRevenueCatSignature(
      rawBody,
      request.headers.get('X-RevenueCat-Webhook-Signature'),
      dependencies.hmacSecret,
      dependencies.nowSeconds(),
    )) return json({ received: false, code: 'invalid_signature' }, 401);

    let parsed: unknown;
    try { parsed = JSON.parse(rawBody); }
    catch { return json({ received: false, code: 'invalid_payload' }, 400); }
    const event = parseRevenueCatEvent(parsed);
    if (!event) return json({ received: false, code: 'invalid_payload' }, 400);

    let claimed = false;
    try {
      const candidates = [...new Set([
        event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []),
      ].filter(isUuid))];
      const profiles = await dependencies.findGenuineProfiles(candidates);
      if (profiles.length > 1) throw new Error('ambiguous_profile');
      const profileId = profiles[0] ?? null;
      const claim = await dependencies.claimEvent({
        id: event.id,
        type: event.type,
        environment: event.environment.toLocaleLowerCase() as 'sandbox' | 'production',
        customerIdHash: await hashRevenueCatIdentifier(event.app_user_id),
        profileId,
      });
      if (claim !== 'claimed') return json({ received: true, duplicate: claim === 'duplicate' });
      claimed = true;

      if (!profileId) {
        await dependencies.completeEvent(event.id, 'ignored');
        return json({ received: true, ignored: true });
      }
      const subscriber = await dependencies.fetchSubscriber(profileId);
      const state = normalizeRevenueCatSubscriber(profileId, subscriber, event);
      if (state) await dependencies.applyState(profileId, state);
      else await dependencies.clearState(profileId);
      await dependencies.completeEvent(event.id, 'processed');
      return json({ received: true });
    } catch (error) {
      const code = error instanceof Error && error.message === 'ambiguous_profile'
        ? 'ambiguous_profile' : 'processing_failed';
      dependencies.reportFailure?.(code);
      if (claimed) {
        try { await dependencies.completeEvent(event.id, 'failed', code); }
        catch { dependencies.reportFailure?.('event_failure_record_failed'); }
      }
      return json({ received: false, code }, 500);
    }
  };
}
