import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/vital/button';
import { FilterChip } from '@/components/vital/filter-chip';
import { customerSafeErrorMessage } from '@/lib/errors';
import type { CommunityApi } from './community-api';
import { participationMessage, REPORT_REASONS, STARTER_DISCLOSURE, type CommunityAccess, type CommunityRestriction, type ReportReason, type ReportTarget } from './community-model';
import { CommunityAction, CommunityField, CommunityModal, CommunityNotice, s } from './community-ui';

export function CommunityAbout({ api, access, onClose, onAccepted }: { api: CommunityApi; access: CommunityAccess | null; onClose: () => void; onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function accept() {
    if (!access?.rules || busy) return;
    setBusy(true); setError(null);
    try { await api.acceptRules(access.rules.version); onAccepted(); }
    catch (cause) { setError(customerSafeErrorMessage('Accept Community Rules', cause, "We couldn't save your acceptance. Please try again.")); }
    finally { setBusy(false); }
  }
  return <CommunityModal title="About Community" busy={busy} onClose={onClose}>
    <Text style={s.title}>Made to be useful, not noisy.</Text>
    <Text style={s.body}>Share what worked. Ask when you are stuck. Different families find different things useful. There is room here for the big adventures and the evenings when you order takeaway and watch a film.</Text>
    <Text accessibilityRole="header" style={s.title}>About starter conversations</Text>
    {STARTER_DISCLOSURE.map(paragraph => <Text key={paragraph} style={s.body}>{paragraph}</Text>)}
    <Text accessibilityRole="header" style={s.title}>{access?.rules?.title ?? 'Community Rules'}</Text>
    {access?.rules ? <Text selectable style={s.body}>{access.rules.content_markdown.trim()}</Text> : <Text style={s.meta}>We couldn't load the current rules. Close this page and try refreshing Community.</Text>}
    <CommunityNotice message={error} error />
    {access?.rules && !access.acceptedRules ? <Button label="I agree to the Community Rules" onPress={() => void accept()} loading={busy} /> : access?.acceptedRules ? <CommunityNotice message="You have accepted the current Community Rules." /> : null}
    {access?.restricted ? <CommunityNotice message={participationMessage(access)} /> : null}
  </CommunityModal>;
}

export function ReportComposer({ api, target, onClose, onReported, onBlocked }: {
  api: CommunityApi; target: ReportTarget; onClose: () => void; onReported: () => void; onBlocked: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>('spam_scam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(block = false) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (block) { await api.block(target.authorId); onBlocked(); }
      else { await api.report(target, reason, details); onReported(); }
    } catch (cause) { setError(customerSafeErrorMessage('Community report/block', cause, "We couldn't save that just now. Please try again.")); }
    finally { setBusy(false); }
  }
  return <CommunityModal title="Report a concern" busy={busy} onClose={onClose}>
    <Text style={s.body}>The Vital team will review your report. Your report is not shown publicly.</Text>
    <View style={s.stack}>{REPORT_REASONS.map(([value, label]) => <FilterChip key={value} label={label} selected={reason === value} onPress={() => setReason(value)} />)}</View>
    <CommunityField label="Anything else we should know? · optional" value={details} onChangeText={setDetails} multiline maxLength={4000} editable={!busy} />
    <CommunityNotice message={error} error />
    <Button label="Send report" onPress={() => void submit()} loading={busy} />
    <Text style={s.meta}>You can also block this member. Your posts and replies will be hidden from each other.</Text>
    {confirmBlock ? <View style={s.card}><Text style={s.body}>Block this member?</Text><Button label="Confirm block" variant="danger" disabled={busy} onPress={() => void submit(true)} /><CommunityAction label="Cancel" onPress={() => setConfirmBlock(false)} /></View> : <CommunityAction label="Block member" icon="ban-outline" onPress={() => setConfirmBlock(true)} />}
  </CommunityModal>;
}

export function MemberModeration({ api, profileId, onClose }: { api: CommunityApi; profileId: string; onClose: () => void }) {
  const [restrictions, setRestrictions] = useState<CommunityRestriction[]>([]);
  const [reason, setReason] = useState('');
  const [type, setType] = useState<'posting_restriction' | 'community_suspension' | 'permanent_community_ban'>('posting_restriction');
  const [days, setDays] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  async function refresh() { setRestrictions(await api.restrictions(profileId)); }
  useEffect(() => { let active = true; api.restrictions(profileId).then((rows) => { if (active) setRestrictions(rows); }).catch((cause) => { if (active) setError(customerSafeErrorMessage('Community restrictions', cause, "We couldn't load restrictions. Please close and try again.")); }); return () => { active = false; }; }, [api, profileId]);
  async function act(id?: string) {
    if (busy) return;
    if (!id && (!reason.trim() || reason.trim().length > 2000)) { setError('Add a reason, up to 2,000 characters.'); return; }
    if (!id && type !== 'permanent_community_ban' && (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 365)) { setError('Choose a duration from 1 to 365 days.'); return; }
    if (!id && !confirm) { setConfirm(true); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      if (id) await api.revoke(id);
      else await api.restrict(profileId, type, reason, type === 'permanent_community_ban' ? null : new Date(Date.now() + Number(days) * 86400000).toISOString());
      await refresh(); setNotice('The moderation action was saved.'); setConfirm(false);
    } catch (cause) { setError(customerSafeErrorMessage('Community restriction action', cause, "We couldn't make that change. Your moderation role may not permit it.")); }
    finally { setBusy(false); }
  }
  return <CommunityModal title="Member restrictions" busy={busy} onClose={onClose}>
    <Text style={s.meta}>Owner, Admin and Moderator permissions are checked by the server. You cannot restrict yourself or an equal or higher role, or revoke a restriction imposed by a higher role.</Text>
    <View style={s.row}>{([['posting_restriction', 'Pause posting'], ['community_suspension', 'Suspend participation'], ['permanent_community_ban', 'Permanent ban']] as const).map(([value,label]) => <FilterChip key={value} label={label} selected={type === value} onPress={() => { setType(value); setConfirm(false); }} />)}</View>
    {type !== 'permanent_community_ban' && <CommunityField label="Duration in days" keyboardType="number-pad" value={days} onChangeText={(v) => { setDays(v); setConfirm(false); }} />}
    <CommunityField label="Reason for restriction" value={reason} onChangeText={(v) => { setReason(v); setConfirm(false); }} multiline maxLength={2000} />
    <CommunityNotice message={error} error /><CommunityNotice message={notice} />
    {confirm && <CommunityNotice message="Confirm this restriction? It will take effect immediately and be recorded in moderation history." />}
    <Button label={confirm ? 'Confirm restriction' : 'Review restriction'} variant="danger" onPress={() => void act()} loading={busy} />
    <Text style={s.title}>Existing restrictions</Text>
    {!restrictions.length && <Text style={s.meta}>No active restrictions recorded.</Text>}
    {restrictions.map((restriction) => <View key={restriction.id} style={s.card}><Text style={s.body}>{restriction.reason}</Text><Text style={s.meta}>{restriction.ends_at ? `Ends ${new Date(restriction.ends_at).toLocaleDateString()}` : 'Permanent'}</Text><CommunityAction label="Revoke restriction" disabled={busy} onPress={() => void act(restriction.id)} /></View>)}
  </CommunityModal>;
}
