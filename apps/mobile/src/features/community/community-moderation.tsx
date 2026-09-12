import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/vital/button';
import { customerSafeErrorMessage } from '@/lib/errors';
import type { CommunityApi } from './community-api';
import { MemberModeration } from './community-actions';
import { useCommunityPage } from './community-hooks';
import { REPORT_REASONS, type CommunityReport } from './community-model';
import { CommunityAction, CommunityAuthor, CommunityField, CommunityModal, CommunityNotice, s } from './community-ui';

export function CommunityModeration({ api, onClose }: { api: CommunityApi; onClose: () => void }) {
  const load = useCallback((offset: number) => api.reportQueue(offset), [api]);
  const queue = useCommunityPage(load);
  const [selected, setSelected] = useState<CommunityReport | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function act(action: 'remove' | 'restore' | 'lock' | 'unlock' | 'under_review' | 'resolved' | 'dismissed') {
    if (!selected || busy) return;
    if (!note.trim() && action !== 'under_review') { setError('Add a brief reason or review note.'); return; }
    setBusy(true); setError(null);
    try {
      if (action === 'under_review' || action === 'resolved' || action === 'dismissed') {
        await api.resolveReport(selected.id, action, note);
        setSelected(null); setNote(''); await queue.refresh();
      } else {
        if (selected.target_type === 'profile') return;
        await api.moderate(selected.target_type, selected.target_id, action, note);
        setSelected({ ...selected, target: selected.target ? { ...selected.target, moderation_status: action === 'remove' ? 'removed_by_moderator' : action === 'restore' ? 'visible' : selected.target.moderation_status } : undefined });
      }
      setNotice('The moderation action was saved.');
    } catch (cause) { setError(customerSafeErrorMessage('Community moderation', cause, "We couldn't make that moderation change. Please check your permissions and try again.")); }
    finally { setBusy(false); }
  }
  if (memberId) return <MemberModeration api={api} profileId={memberId} onClose={() => setMemberId(null)} />;
  return <CommunityModal title="Moderation review" busy={busy} onClose={onClose}>
    <CommunityNotice message={error ?? queue.error} error /><CommunityNotice message={notice} />
    {selected ? <View style={s.stack}>
      <CommunityAction label="Back to reports" icon="arrow-back" onPress={() => { setSelected(null); setError(null); setNotice(null); }} />
      <Text style={s.label}>{REPORT_REASONS.find(([key]) => key === selected.reason_category)?.[1] ?? 'Reported concern'}</Text>
      {selected.details && <Text selectable style={s.body}>{selected.details}</Text>}
      <Text style={s.title}>{selected.target?.title ?? 'Reported content'}</Text>
      {selected.target?.author_name && <CommunityAuthor name={selected.target.author_name} imageUrl={selected.target.author_image_url} bio={selected.target.author_bio}
        seeded={selected.target.author_is_seeded ?? false} createdAt={selected.target.created_at ?? selected.created_at} />}
      <Text selectable style={s.body}>{selected.target?.body ?? 'The content is no longer available, or this report concerns a profile.'}</Text>
      <CommunityField label="Moderation reason / review note" value={note} onChangeText={setNote} multiline maxLength={2000} editable={!busy} />
      {selected.target && selected.target_type !== 'profile' && <View style={s.row}>
        {selected.target.moderation_status === 'removed_by_moderator' ? <CommunityAction label="Restore content" disabled={busy} onPress={() => void act('restore')} /> : selected.target.moderation_status === 'visible' ? <CommunityAction label="Remove content" disabled={busy} onPress={() => void act('remove')} /> : null}
        {selected.target_type === 'post' && <><CommunityAction label="Lock replies" disabled={busy} onPress={() => void act('lock')} /><CommunityAction label="Unlock replies" disabled={busy} onPress={() => void act('unlock')} /></>}
      </View>}
      <View style={s.row}><CommunityAction label="Mark under review" disabled={busy} onPress={() => void act('under_review')} /><CommunityAction label="Resolve report" disabled={busy} onPress={() => void act('resolved')} /><CommunityAction label="Dismiss report" disabled={busy} onPress={() => void act('dismissed')} /></View>
      {(selected.target?.author_id || selected.target_type === 'profile') && <CommunityAction label="Review member restrictions" icon="shield-checkmark-outline" onPress={() => setMemberId(selected.target?.author_id ?? selected.target_id)} />}
    </View> : <>
      <Text style={s.meta}>Open concerns, oldest first. Content removals, restorations, locks, restrictions and dismissals use the existing audit history.</Text>
      {queue.loading ? <Text style={s.meta}>Loading reports…</Text> : !queue.items.length && !queue.error ? <Text style={s.body}>No open reports to review.</Text> : null}
      {queue.items.map((report) => <View key={report.id} style={s.card}><Text style={s.label}>{REPORT_REASONS.find(([key]) => key === report.reason_category)?.[1]}</Text><Text style={s.meta}>{report.target?.title ?? 'Reported reply or profile'} · {new Date(report.created_at).toLocaleDateString()}</Text><CommunityAction label="Review report" onPress={() => { setSelected(report); setNote(''); setNotice(null); }} /></View>)}
      {queue.error && <Button label="Try again" onPress={() => void (queue.items.length ? queue.more() : queue.refresh())} />}
      {queue.hasMore && <Button label="Show more reports" variant="secondary" loading={queue.loadingMore} onPress={() => void queue.more()} />}
    </>}
  </CommunityModal>;
}
