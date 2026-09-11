export const COMMUNITY_TOPICS = ['Mums', 'Kids', 'Together', 'Life', 'Food'] as const;
export type CommunityTopic = (typeof COMMUNITY_TOPICS)[number];
export const POST_TYPES = [
  { value: 'question', label: 'Ask a question', noun: 'Question', icon: 'help-circle-outline' },
  { value: 'idea', label: 'Share an idea', noun: 'Idea', icon: 'bulb-outline' },
  { value: 'experience', label: 'Share an experience', noun: 'Experience', icon: 'chatbubbles-outline' },
  { value: 'tip', label: 'Post a tip', noun: 'Tip', icon: 'sparkles-outline' },
  { value: 'discussion', label: 'Start a conversation', noun: 'Conversation', icon: 'people-outline' },
] as const;
export type PostType = (typeof POST_TYPES)[number]['value'];
export type CommunityOrder = 'recent' | 'helpful' | 'relevant';
export const COMMUNITY_PAGE_SIZE = 20;
export const GENERAL_ROOM_ID = '10000000-0000-4000-8000-000000000001';
export const STARTER_DISCLOSURE = [
  'To help get Community going, Vital created some starter profiles and conversations showing the kinds of questions, ideas and experiences people can share here. As the community grows, conversations from members will naturally take their place.',
  'Some starter profiles use generated profile images.',
] as const;
export const REPORT_REASONS = [
  ['spam_scam', 'Advertising, promotion or spam'],
  ['harassment_bullying', 'Harassment or judgemental behaviour'],
  ['hate_abuse', 'Hate or abuse'],
  ['child_safety_concern', 'Child safety concern'],
  ['privacy_personal_information', 'Private or identifying information'],
  ['misinformation_dangerous_advice', 'Dangerous advice or misinformation'],
  ['sexual_inappropriate_content', 'Inappropriate content'],
  ['threat_violence', 'Threats or violence'],
  ['other', 'Something else'],
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number][0];
export type CommunityRules = { version: number; title: string; content_markdown: string };
export type CommunityAccess = {
  canParticipate: boolean; restricted: boolean; acceptedRules: boolean;
  isModerator: boolean; rules: CommunityRules | null;
};
export type CommunityPost = {
  id: string; author_id: string; author_name: string; author_is_seeded: boolean;
  author_image_url?: string | null;
  title: string; excerpt: string; post_type: PostType; topic: CommunityTopic | null;
  tags: string[]; activity_id: string | null; activity_title: string | null;
  is_seeded: boolean; locked: boolean; pinned: boolean;
  created_at: string; updated_at: string; helpful_count: number; reply_count: number;
  viewer_helpful: boolean; moderation_status: string;
};
export type CommunityPostDetail = CommunityPost & { body: string };
export type CommunityReply = {
  id: string; post_id: string; author_id: string; author_name: string;
  author_image_url?: string | null;
  body: string; created_at: string; is_seeded: boolean;
  parent_comment_id: string | null; reply_to_name: string | null;
  helpful_count: number; viewer_helpful: boolean;
};
export type CommunityPage<T> = { items: T[]; hasMore: boolean; nextOffset: number };
export type CommunityFilters = {
  search: string; topic: CommunityTopic | null; postType: PostType | null; order: CommunityOrder;
};
export type PostDraft = {
  title: string; body: string; postType: PostType; topic: CommunityTopic | null;
  activityId: string | null;
};
export type ActivityLinkOption = { id: string; title: string; section: string };
export type ReportTarget = { type: 'post' | 'comment'; id: string; authorId: string };
export type CommunityReport = {
  id: string; target_type: 'post' | 'comment' | 'profile'; target_id: string;
  reason_category: ReportReason; details: string | null; created_at: string; status: string;
  target?: { author_id: string; body: string; title?: string; moderation_status?: string; author_name?: string; author_image_url?: string | null; author_is_seeded?: boolean; created_at?: string };
};
export type CommunityRestriction = {
  id: string; profile_id: string; imposed_by: string; restriction_type: string;
  ends_at: string | null; reason: string; status: string;
};

export function validatePostDraft(draft: PostDraft): string | null {
  if (!draft.title.trim()) return 'Add a short title so people can find your post.';
  if (draft.title.trim().length > 200) return 'Keep your title to 200 characters or fewer.';
  if (!draft.body.trim()) return 'Add your question, idea or experience.';
  if (draft.body.trim().length > 20000) return 'Keep your post to 20,000 characters or fewer.';
  if (!POST_TYPES.some((type) => type.value === draft.postType)) return 'Choose a post type.';
  if (draft.topic && !COMMUNITY_TOPICS.includes(draft.topic)) return 'Choose a Vital topic.';
  return null;
}
export function validateReply(body: string): string | null {
  if (!body.trim()) return 'Write a reply first.';
  if (body.trim().length > 10000) return 'Keep your reply to 10,000 characters or fewer.';
  return null;
}
export { profileInitials as communityInitials } from '../../lib/profile-images.ts';
export function appendCommunityPage<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const ids = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => !ids.has(item.id))];
}
export function participationMessage(access: CommunityAccess | null): string {
  if (access?.restricted) return 'Your community participation is paused. You can still read, report concerns, block members and remove your Helpful reactions.';
  if (access && !access.rules) return 'Posting will open once the Community Rules are available.';
  return 'Read and accept the Community Rules before posting, replying or marking something Helpful.';
}
