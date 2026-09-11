import type { SupabaseClient } from '@supabase/supabase-js';
import { profileImageResolver } from '../../lib/profile-images.ts';
import { COMMUNITY_PAGE_SIZE, GENERAL_ROOM_ID, validatePostDraft, validateReply } from './community-model.ts';
import type {
  ActivityLinkOption, CommunityAccess, CommunityFilters, CommunityPage,
  CommunityPost, CommunityPostDetail, CommunityReply, CommunityReport,
  CommunityRestriction, PostDraft, ReportReason, ReportTarget,
} from './community-model.ts';

// The authenticated client is injected for integration tests. No administrative
// key, claimed moderator role or seed provenance ever enters member writes.
export function createCommunityApi(client: SupabaseClient) {
  const resolveImages = profileImageResolver(client);
  async function withAuthors<T extends { author_id: string }>(rows: T[]) {
    if (!rows.length) return rows;
    // One bounded directory query + one batched signing call, not per-card reads.
    // Works against the already-applied schema; no new view/RPC columns required.
    try {
      const { data, error } = await client.from('profiles').select('id,display_name,avatar_url,is_seeded').in('id', [...new Set(rows.map(row => row.author_id))]);
      if (error) return rows;
      const profiles = data ?? [];
      const images = await resolveImages(profiles);
      return rows.map(row => {
        const profile = profiles.find(p => p.id === row.author_id);
        return { ...row, ...(profile ? { author_name: profile.display_name, author_is_seeded: profile.is_seeded } : {}), author_image_url: images.get(row.author_id) ?? null };
      });
    } catch { return rows; } // Image/directory decoration must not hide content.
  }
  async function subject() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.user.id) throw new Error('Authentication required');
    return data.session.user.id;
  }
  return {
    async access(): Promise<CommunityAccess> {
      const { data, error } = await client.rpc('community_access');
      if (error) throw error;
      return data as CommunityAccess;
    },
    async posts(filters: CommunityFilters, offset = 0): Promise<CommunityPage<CommunityPost>> {
      const { data, error } = await client.rpc('search_community_posts', {
        search_text: filters.search.slice(0, 200), selected_topic: filters.topic,
        selected_type: filters.postType, ordering: filters.search.trim() ? filters.order : filters.order === 'relevant' ? 'recent' : filters.order,
        page_offset: offset, page_size: COMMUNITY_PAGE_SIZE, provenance: 'combined',
      });
      if (error) throw error;
      return { ...data, items: await withAuthors(data.items as CommunityPost[]) } as CommunityPage<CommunityPost>;
    },
    async post(id: string): Promise<CommunityPostDetail> {
      const [summary, content] = await Promise.all([
        client.from('community_post_catalogue').select('*').eq('id', id).eq('moderation_status', 'visible').maybeSingle(),
        client.from('community_posts').select('body').eq('id', id).eq('moderation_status', 'visible').maybeSingle(),
      ]);
      if (summary.error) throw summary.error;
      if (content.error) throw content.error;
      if (!summary.data || !content.data) throw new Error('Post unavailable');
      return (await withAuthors([{ ...summary.data, body: content.data.body } as CommunityPostDetail]))[0];
    },
    async replies(postId: string, offset = 0): Promise<CommunityPage<CommunityReply>> {
      const { data, error } = await client.rpc('community_reply_page', {
        target_post: postId, page_offset: offset, page_size: COMMUNITY_PAGE_SIZE,
      });
      if (error) throw error;
      return { ...data, items: await withAuthors(data.items as CommunityReply[]) } as CommunityPage<CommunityReply>;
    },
    async createPost(draft: PostDraft): Promise<string> {
      const validation = validatePostDraft(draft);
      if (validation) throw new Error(validation);
      const { data, error } = await client.from('community_posts').insert({
        author_id: await subject(), room_id: GENERAL_ROOM_ID, post_type: draft.postType,
        topic: draft.topic, title: draft.title.trim(), body: draft.body.trim(), activity_id: draft.activityId,
      }).select('id').single();
      if (error) throw error;
      return data.id;
    },
    async reply(postId: string, body: string, parentId: string | null): Promise<void> {
      const validation = validateReply(body);
      if (validation) throw new Error(validation);
      const { error } = await client.from('community_comments').insert({
        post_id: postId, author_id: await subject(), body: body.trim(), parent_comment_id: parentId,
      });
      if (error) throw error;
    },
    async helpful(kind: 'post' | 'comment', id: string, remove: boolean): Promise<void> {
      const table = kind === 'post' ? 'community_post_reactions' : 'community_comment_reactions';
      const column = kind === 'post' ? 'post_id' : 'comment_id';
      const profileId = await subject();
      const result = remove
        ? await client.from(table).delete().eq(column, id).eq('profile_id', profileId)
        : await client.from(table).upsert({ [column]: id, profile_id: profileId, reaction_type: 'helpful' }, { onConflict: `${column},profile_id` });
      if (result.error) throw result.error;
    },
    async report(target: ReportTarget, reason: ReportReason, details: string): Promise<void> {
      const { error } = await client.from('community_reports').insert({
        reporter_id: await subject(), target_type: target.type, target_id: target.id,
        reason_category: reason, details: details.trim() || null,
      });
      // The existing unique index treats a repeated open report as already received.
      if (error && error.code !== '23505') throw error;
    },
    async block(profileId: string): Promise<void> {
      const { error } = await client.from('community_blocks').upsert({
        blocker_id: await subject(), blocked_profile_id: profileId,
      }, { onConflict: 'blocker_id,blocked_profile_id', ignoreDuplicates: true });
      if (error) throw error;
    },
    async acceptRules(version: number): Promise<void> {
      const { error } = await client.from('community_rule_acceptances').upsert({
        profile_id: await subject(), rules_version: version,
      }, { onConflict: 'profile_id,rules_version', ignoreDuplicates: true });
      if (error) throw error;
    },
    async findActivities(search: string): Promise<ActivityLinkOption[]> {
      const clean = search.replace(/[%_*(),.]/g, ' ').trim().slice(0, 120);
      if (clean.length < 2) return [];
      const { data, error } = await client.from('activities').select('id,title,section')
        .eq('status', 'published').ilike('title', `%${clean}%`).order('title').limit(8);
      if (error) throw error;
      return data as ActivityLinkOption[];
    },
    async moderate(kind: 'post' | 'comment', id: string, action: 'remove' | 'restore' | 'lock' | 'unlock', reason: string): Promise<void> {
      const update = action === 'lock' || action === 'unlock'
        ? { locked: action === 'lock' }
        : { moderation_status: action === 'remove' ? 'removed_by_moderator' : 'visible', removal_reason: action === 'remove' ? reason.trim() : null };
      const { data, error } = await client.from(kind === 'post' ? 'community_posts' : 'community_comments')
        .update(update).eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Action not permitted');
    },
    async removeOwn(kind: 'post' | 'comment', id: string): Promise<void> {
      const { data, error } = await client.from(kind === 'post' ? 'community_posts' : 'community_comments')
        .update({ moderation_status: 'removed_by_author' }).eq('id', id).eq('author_id', await subject()).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Action not permitted');
    },
    async reportQueue(offset = 0): Promise<CommunityPage<CommunityReport>> {
      const { data, error } = await client.from('community_reports').select('id,target_type,target_id,reason_category,details,created_at,status')
        .in('status', ['open', 'under_review']).order('created_at').order('id').range(offset, offset + COMMUNITY_PAGE_SIZE);
      if (error) throw error;
      const reports = (data ?? []).slice(0, COMMUNITY_PAGE_SIZE) as CommunityReport[];
      // Bounded queries for the whole batch, never one request per report.
      const postIds = reports.filter((r) => r.target_type === 'post').map((r) => r.target_id);
      const commentIds = reports.filter((r) => r.target_type === 'comment').map((r) => r.target_id);
      const [posts, comments] = await Promise.all([
        postIds.length ? client.from('community_posts').select('id,author_id,title,body,moderation_status,created_at').in('id', postIds) : Promise.resolve({ data: [], error: null }),
        commentIds.length ? client.from('community_comments').select('id,author_id,body,moderation_status,created_at').in('id', commentIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (posts.error) throw posts.error;
      if (comments.error) throw comments.error;
      const targets = new Map((await withAuthors([...(posts.data ?? []), ...(comments.data ?? [])])).map((item) => [item.id, item]));
      return { items: reports.map((r) => ({ ...r, target: targets.get(r.target_id) })), hasMore: (data?.length ?? 0) > COMMUNITY_PAGE_SIZE, nextOffset: offset + COMMUNITY_PAGE_SIZE };
    },
    async resolveReport(id: string, status: 'under_review' | 'resolved' | 'dismissed', note: string): Promise<void> {
      const { data, error } = await client.from('community_reports').update({ status, resolution_note: note.trim() || null }).eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Action not permitted');
    },
    async restrict(profileId: string, type: 'posting_restriction' | 'community_suspension' | 'permanent_community_ban', reason: string, endsAt: string | null): Promise<void> {
      const { error } = await client.from('community_user_restrictions').insert({
        profile_id: profileId, imposed_by: await subject(), restriction_type: type, reason: reason.trim(), ends_at: endsAt,
      });
      if (error) throw error;
    },
    async restrictions(profileId: string): Promise<CommunityRestriction[]> {
      const { data, error } = await client.from('community_user_restrictions').select('id,profile_id,imposed_by,restriction_type,ends_at,reason,status')
        .eq('profile_id', profileId).eq('status', 'active').order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data as CommunityRestriction[];
    },
    async revoke(id: string): Promise<void> {
      const { data, error } = await client.from('community_user_restrictions').update({ status: 'revoked' }).eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('The moderation hierarchy does not permit this action');
    },
  };
}
export type CommunityApi = ReturnType<typeof createCommunityApi>;
