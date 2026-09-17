import { useCallback, useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/vital/button';
import { FilterChip } from '@/components/vital/filter-chip';
import { Screen, ScreenHeader } from '@/components/vital/screen';
import { StatePanel } from '@/components/vital/state-panel';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { customerSafeErrorMessage, withFutureJwtTimingRetry } from '@/lib/errors';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import type { CommunityApi } from './community-api';
import { BlockedMembers, CommunityAbout, CommunityMemberActions, ReportComposer } from './community-actions';
import { CommunityComposer } from './community-composer';
import { CommunityDetail } from './community-detail';
import { useCommunityPage } from './community-hooks';
import { CommunityModeration } from './community-moderation';
import { COMMUNITY_TOPICS, POST_TYPES, participationMessage, type CommunityAccess, type CommunityMember, type CommunityOrder, type CommunityTopic, type PostType, type ReportTarget } from './community-model';
import { CommunityAction, CommunityAuthor, CommunityField, CommunityNotice, s } from './community-ui';

// API/navigation injection keeps component fixtures outside app routes and makes
// phone-width QA possible without manufacturing production community records.
export function CommunityScreenContent({ api, userId, onActivity, refreshKey = 0 }: {
  api: CommunityApi; userId: string; onActivity: (id: string) => void; refreshKey?: number;
}) {
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState<CommunityTopic | null>(null);
  const [postType, setPostType] = useState<PostType | null>(null);
  const [order, setOrder] = useState<CommunityOrder>('recent');
  const [postId, setPostId] = useState<string | null>(null);
  const [composer, setComposer] = useState<PostType | null>(null);
  const [about, setAbout] = useState(false);
  const [moderation, setModeration] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [member, setMember] = useState<CommunityMember | null>(null);
  const [blockedMembers, setBlockedMembers] = useState(false);
  const [access, setAccess] = useState<CommunityAccess | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [moreTypes, setMoreTypes] = useState(false);
  const query = useDebouncedValue(search, 300);
  const load = useCallback((offset: number) => api.posts({ search: query, topic, postType, order }, offset), [api, query, topic, postType, order, reload, refreshKey]);
  const feed = useCommunityPage(load);
  useEffect(() => {
    if (!postId || Platform.OS !== 'android') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { setPostId(null); return true; });
    return () => listener.remove();
  }, [postId]);
  useEffect(() => {
    let active = true; setAccessError(null);
    withFutureJwtTimingRetry(() => api.access()).then((data) => { if (active) setAccess(data); }).catch((cause) => {
      if (active) { setAccess(null); setAccessError(customerSafeErrorMessage('Community access', cause, "We couldn't check community access just now. Please try refreshing.")); }
    });
    return () => { active = false; };
  }, [api, reload, refreshKey]);
  function refresh() { setReload((value) => value + 1); }
  function blockSucceeded(profileId: string) {
    setPostId(null);
    feed.removeWhere((post) => post.author_id === profileId);
    void feed.refresh();
  }
  function replyCreated(id: string) {
    feed.updateItem(id, (post) => ({ ...post, reply_count: post.reply_count + 1 }));
  }
  function startPost(type: PostType) { setNotice(null); if (access?.canParticipate) setComposer(type); else setAbout(true); }
  function resetFilters() { setSearch(''); setTopic(null); setPostType(null); setOrder('recent'); }
  const filtering = Boolean(query.trim() || topic || postType);
  return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen key={postId ?? 'community-feed'} scrollProps={{ keyboardDismissMode: 'on-drag' }}>
      <View style={styles.reading}>
        {postId ? <CommunityDetail key={postId} api={api} id={postId} userId={userId} access={access} refreshKey={refreshKey}
          onBack={() => { setPostId(null); refresh(); }} onRules={() => setAbout(true)} onReport={setReport} onMember={setMember} onReplyCreated={replyCreated} onActivity={onActivity} /> : <>
          <ScreenHeader eyebrow="Community" title="Made to be useful, not noisy."
            description="Find and share useful family ideas, experiences, questions and encouragement." />
          <View style={s.stack}>
            <CommunityField label="Search Community" placeholder="Search ideas, questions and experiences" value={search}
              onChangeText={(value) => { setSearch(value); setOrder(value.trim() ? 'relevant' : 'recent'); }} maxLength={200}
              returnKeyType="search" autoCorrect={false} />
            <View style={s.row}><FilterChip label="All" selected={!topic} onPress={() => setTopic(null)} />{COMMUNITY_TOPICS.map((value) => <FilterChip key={value} label={value} selected={topic === value} onPress={() => setTopic(value)} />)}</View>
            <View style={styles.posting}>
              <Text style={s.label}>Something to share?</Text>
              <View style={styles.postingGrid}>{POST_TYPES.slice(0, 4).map((type) => <View key={type.value} style={styles.postingOption}><CommunityAction label={type.label} icon={type.icon} onPress={() => startPost(type.value)} /></View>)}</View>
            </View>
            <View style={s.row}>
              {Boolean(query.trim()) && <FilterChip label="Relevant" selected={order === 'relevant'} onPress={() => setOrder('relevant')} />}
              <FilterChip label="Recent" selected={order === 'recent'} onPress={() => setOrder('recent')} />
              <FilterChip label="Helpful" selected={order === 'helpful'} onPress={() => setOrder('helpful')} />
              <CommunityAction label={moreTypes ? 'Hide post types' : 'Post type'} icon="options-outline" onPress={() => setMoreTypes(!moreTypes)} />
            </View>
            {moreTypes && <View style={s.row}><FilterChip label="All post types" selected={!postType} onPress={() => setPostType(null)} />{POST_TYPES.map((type) => <FilterChip key={type.value} label={type.noun} selected={postType === type.value} onPress={() => setPostType(type.value)} />)}</View>}
            {filtering && <View style={s.row}><Text style={s.meta}>{[topic, POST_TYPES.find((t) => t.value === postType)?.noun, query.trim() ? `“${query.trim()}”` : null].filter(Boolean).join(' · ')}</Text><CommunityAction label="Clear filters" onPress={resetFilters} /></View>}
            <CommunityNotice message={notice} /><CommunityNotice message={accessError} error />
            {access?.restricted && <CommunityNotice message={participationMessage(access)} />}
            {feed.loading ? <StatePanel kind="loading" title="Finding conversations" message="A moment to gather the latest posts…" /> : feed.error && !feed.items.length ? <StatePanel kind="error" title="Community is unavailable just now" message={feed.error} onRetry={refresh} /> : !feed.items.length ? <View style={s.stack}>
              <StatePanel title={filtering ? 'No conversations found' : 'There is room for your first thought'} message={filtering ? 'Try fewer words or another topic. You can also ask the question yourself.' : 'Ask a question, share something that worked, or tell us how it really went.'} />
              {filtering && <Button label="Clear search and filters" variant="secondary" onPress={resetFilters} />}
              <Button label="Ask a question" onPress={() => startPost('question')} />
            </View> : feed.items.map((post) => <View key={post.id} style={s.card}>
              <Text style={s.eyebrow}>{POST_TYPES.find((t) => t.value === post.post_type)?.noun ?? 'Conversation'}{post.topic ? ` · ${post.topic}` : ''}{post.locked ? ' · Replies closed' : ''}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open conversation: ${post.title}`} onPress={() => { setPostId(post.id); setNotice(null); }} style={({ pressed }) => [s.stack, { opacity: pressed ? 0.75 : 1 }]}>
                <Text style={s.title}>{post.title}</Text>
                <Text style={s.body}>{post.excerpt}{post.excerpt.length === 320 ? '…' : ''}</Text>
              </Pressable>
              <CommunityAuthor name={post.author_name} imageUrl={post.author_image_url} bio={post.author_bio} createdAt={post.created_at} seeded={post.is_seeded || post.author_is_seeded} deleted={!post.author_id}
                onMember={post.author_id && post.author_id !== userId && !post.is_seeded && !post.author_is_seeded ? () => setMember({ id: post.author_id!, name: post.author_name, imageUrl: post.author_image_url, bio: post.author_bio, seeded: false }) : undefined} />
              {post.activity_id && post.activity_title && <CommunityAction label={`Activity: ${post.activity_title}`} icon="link-outline" onPress={() => onActivity(post.activity_id!)} />}
              <View style={s.row}><CommunityAction label={`${post.reply_count} ${post.reply_count === 1 ? 'reply' : 'replies'} · Read conversation`} icon="chatbubble-outline" onPress={() => setPostId(post.id)} />{post.helpful_count > 0 && <Text style={s.meta}>{post.helpful_count} Helpful</Text>}</View>
            </View>)}
            {!!feed.items.length && feed.error && <><CommunityNotice message={feed.error} error /><Button label="Try again" onPress={() => void feed.more()} /></>}
            {feed.hasMore && <Button label="Show more conversations" variant="secondary" loading={feed.loadingMore} onPress={() => void feed.more()} />}
            {!feed.loading && feed.items.length > 0 && !feed.hasMore && <Text style={styles.endNote}>You are up to date with these conversations. Come back when it is useful.</Text>}
            <View style={s.row}><CommunityAction label="About Community & rules" icon="information-circle-outline" onPress={() => setAbout(true)} /><CommunityAction label="Blocked members" icon="ban-outline" onPress={() => setBlockedMembers(true)} /><CommunityAction label="Refresh" icon="refresh-outline" onPress={refresh} />{access?.isModerator && <CommunityAction label="Moderation review" icon="shield-checkmark-outline" onPress={() => setModeration(true)} />}</View>
          </View>
        </>}
      </View>
    </Screen>
    {composer && <CommunityComposer api={api} initialType={composer} onClose={() => setComposer(null)} onCreated={(id) => { setComposer(null); setPostId(id); refresh(); }} />}
    {about && <CommunityAbout api={api} access={access} onClose={() => setAbout(false)} onAccepted={() => { refresh(); setAbout(false); setNotice('Your agreement to the current Community Rules has been saved.'); }} />}
    {report && <ReportComposer api={api} target={report} onClose={() => setReport(null)} onReported={() => { setReport(null); setPostId(null); setNotice('Thank you. Your concern has been sent to the Vital team.'); }} onBlocked={() => { const profileId = report.authorId; setReport(null); blockSucceeded(profileId); setNotice('This member is now blocked.'); }} />}
    {member && <CommunityMemberActions api={api} member={member} onClose={() => setMember(null)} onChanged={(blocked) => { const profileId = member.id; setMember(null); if (blocked) blockSucceeded(profileId); else refresh(); setNotice(blocked ? 'This member is now blocked.' : 'This member is no longer blocked.'); }} />}
    {blockedMembers && <BlockedMembers api={api} onClose={() => setBlockedMembers(false)} onChanged={() => { refresh(); setNotice('This member is no longer blocked.'); }} />}
    {moderation && <CommunityModeration api={api} onClose={() => { setModeration(false); refresh(); }} />}
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  reading: { width: '100%', maxWidth: 760, alignSelf: 'center', minWidth: 0 },
  posting: { gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.plumSoft },
  postingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  postingOption: { flexGrow: 1, flexBasis: '45%', minWidth: 130 },
  endNote: { color: colors.inkMuted, fontFamily: typography.bodyFamily, fontSize: typography.small, lineHeight: 23, textAlign: 'center', paddingVertical: spacing.md },
});
