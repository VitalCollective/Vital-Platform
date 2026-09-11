import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button } from '@/components/vital/button';
import { StatePanel } from '@/components/vital/state-panel';
import { customerSafeErrorMessage, withFutureJwtTimingRetry } from '@/lib/errors';
import type { CommunityApi } from './community-api';
import { useCommunityPage } from './community-hooks';
import { participationMessage, POST_TYPES, validateReply, type CommunityAccess, type CommunityPostDetail, type CommunityReply, type ReportTarget } from './community-model';
import { CommunityAction, CommunityAuthor, CommunityField, CommunityNotice, s } from './community-ui';

export function CommunityDetail({ api, id, userId, access, onBack, onRules, onReport, onActivity }: {
  api: CommunityApi; id: string; userId: string; access: CommunityAccess | null; onBack: () => void;
  onRules: () => void; onReport: (target: ReportTarget) => void; onActivity: (id: string) => void;
}) {
  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const replyInput = useRef<TextInput>(null);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ kind: 'post' | 'comment'; id: string } | null>(null);
  const [reload, setReload] = useState(0);
  const loadReplies = useCallback((offset: number) => api.replies(id, offset), [api, id]);
  const replies = useCommunityPage(loadReplies);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    withFutureJwtTimingRetry(() => api.post(id)).then((data) => { if (active) setPost(data); }).catch((cause) => {
      if (active) setError(customerSafeErrorMessage('Community post', cause, "We couldn't open this conversation. It may no longer be available."));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, id, reload]);
  async function action(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setActionError(null); setNotice(null);
    try { await operation(); }
    catch (cause) { setActionError(customerSafeErrorMessage('Community contribution', cause, "We couldn't save that change. Your text is still here. Check your connection and community permissions, then try again.")); }
    finally { setBusy(false); }
  }
  async function helpful(kind: 'post' | 'comment', target: CommunityPostDetail | CommunityReply) {
    await action(async () => {
      await api.helpful(kind, target.id, target.viewer_helpful);
      if (kind === 'post') setPost(await api.post(id)); else await replies.refresh();
    });
  }
  function sendReply() {
    const validation = validateReply(body);
    if (validation) { setActionError(validation); return; }
    void action(async () => {
      await api.reply(id, body, replyTo ? replyTo.parent_comment_id ?? replyTo.id : null);
      setBody(''); setReplyTo(null); setNotice('Your reply has been added to the conversation.'); await replies.refresh(); setPost(await api.post(id));
    });
  }
  return <View style={s.stack}>
    <View style={s.row}><CommunityAction label="Back to Community" icon="arrow-back" onPress={onBack} /><CommunityAction label="Refresh" icon="refresh-outline" onPress={() => { setReload((v) => v + 1); void replies.refresh(); }} /></View>
    {loading && !post ? <StatePanel kind="loading" title="Opening conversation" message="Finding the post and replies…" /> : error ? <StatePanel kind="error" title="Conversation unavailable" message={error} onRetry={() => setReload((v) => v + 1)} /> : post ? <>
      <View style={s.card}>
        <Text style={s.eyebrow}>{POST_TYPES.find((type) => type.value === post.post_type)?.noun ?? 'Conversation'}{post.topic ? ` · ${post.topic}` : ''}</Text>
        <Text accessibilityRole="header" style={s.title}>{post.title}</Text>
        <CommunityAuthor name={post.author_name} imageUrl={post.author_image_url} createdAt={post.created_at} seeded={post.is_seeded || post.author_is_seeded} />
        <Text selectable style={s.body}>{post.body}</Text>
        {post.activity_id && post.activity_title && <CommunityAction label={`Vital activity: ${post.activity_title}`} icon="link-outline" onPress={() => onActivity(post.activity_id!)} />}
        <View style={s.row}>
          <CommunityAction label={`Helpful${post.helpful_count ? ` · ${post.helpful_count}` : ''}`} icon="hand-left-outline" selected={post.viewer_helpful}
            disabled={busy || (!post.viewer_helpful && !access?.canParticipate)} onPress={() => void helpful('post', post)} />
          {post.author_id !== userId ? <CommunityAction label="Report / block" icon="flag-outline" onPress={() => onReport({ type: 'post', id: post.id, authorId: post.author_id })} /> : !post.locked && !post.pinned && !access?.restricted ? <CommunityAction label="Remove my post" onPress={() => setConfirmRemove({ kind: 'post', id })} /> : null}
        </View>
      </View>
      <CommunityNotice message={actionError} error />
      <CommunityNotice message={notice} />
      {confirmRemove && <View style={s.card}><Text style={s.body}>Remove your {confirmRemove.kind === 'post' ? 'post' : 'reply'}?</Text><Text style={s.meta}>It will no longer be visible in the conversation.</Text><Button label="Confirm removal" variant="danger" loading={busy} onPress={() => void action(async () => { await api.removeOwn(confirmRemove.kind, confirmRemove.id); if (confirmRemove.kind === 'post') onBack(); else await replies.refresh(); setConfirmRemove(null); })} /><CommunityAction label="Keep it" onPress={() => setConfirmRemove(null)} /></View>}
      <Text accessibilityRole="header" style={s.title}>Replies</Text>
      {replies.loading ? <Text style={s.meta}>Loading replies…</Text> : !replies.items.length && !replies.error ? <Text style={s.body}>No replies yet. A useful thought or a little encouragement is welcome.</Text> : null}
      {replies.items.map((reply) => <View key={reply.id} style={s.card}>
        <CommunityAuthor name={reply.author_name} imageUrl={reply.author_image_url} createdAt={reply.created_at} seeded={reply.is_seeded} />
        {reply.parent_comment_id && <Text style={s.meta}>In reply to {reply.reply_to_name ?? 'an earlier reply'}</Text>}
        <Text selectable style={s.body}>{reply.body}</Text>
        <View style={s.row}>
          <CommunityAction label={`Helpful${reply.helpful_count ? ` · ${reply.helpful_count}` : ''}`} icon="hand-left-outline" selected={reply.viewer_helpful}
            disabled={busy || (!reply.viewer_helpful && !access?.canParticipate)} onPress={() => void helpful('comment', reply)} />
          {!post.locked && access?.canParticipate && <CommunityAction label="Reply" icon="return-down-forward-outline" onPress={() => { setReplyTo(reply); requestAnimationFrame(() => replyInput.current?.focus()); }} />}
          {reply.author_id !== userId ? <CommunityAction label="Report / block" icon="flag-outline" onPress={() => onReport({ type: 'comment', id: reply.id, authorId: reply.author_id })} /> : !access?.restricted ? <CommunityAction label="Remove my reply" onPress={() => setConfirmRemove({ kind: 'comment', id: reply.id })} /> : null}
        </View>
      </View>)}
      <CommunityNotice message={replies.error} error />
      {replies.error && <Button label="Try again" onPress={() => void (replies.items.length ? replies.more() : replies.refresh())} />}
      {replies.hasMore && <Button label="Show more replies" variant="secondary" loading={replies.loadingMore} onPress={() => void replies.more()} />}
      {post.locked ? <CommunityNotice message="Replies are closed for this conversation. You can still report a concern." /> : !access?.canParticipate ? <View style={s.stack}><CommunityNotice message={participationMessage(access)} />{!access?.acceptedRules && <Button label="Read Community Rules" variant="secondary" onPress={onRules} />}</View> : <View style={s.card}>
        <Text style={s.title}>{replyTo ? `Reply to ${replyTo.author_name}` : 'Add your reply'}</Text>
        {replyTo && <CommunityAction label="Reply to the post instead" onPress={() => setReplyTo(null)} />}
        <CommunityField inputRef={replyInput} label="Your reply" value={body} onChangeText={setBody} multiline maxLength={10000} editable={!busy} placeholder="Share a useful thought…" />
        <Button label="Send reply" loading={busy} onPress={sendReply} />
      </View>}
    </> : null}
  </View>;
}
