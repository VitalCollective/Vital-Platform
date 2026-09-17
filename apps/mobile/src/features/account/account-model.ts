export const ACCOUNT_PANELS = {
  profile: 'Edit profile', identity: 'Community profile', family: 'Your family',
  preferences: 'Preferences', membership: 'Vital membership', community: 'Community',
  privacySafety: 'Privacy & safety', blocked: 'Blocked members',
  help: 'Help & contact', suggest: 'Suggest an activity', feedback: 'Send feedback', problem: 'Report a problem',
  about: 'About Vital Collective', privacy: 'Privacy Policy', terms: 'Terms', deletion: 'Delete account',
} as const;
export type AccountPanel = keyof typeof ACCOUNT_PANELS;
export function accountPanel(value: string | string[] | undefined): AccountPanel | null {
  return typeof value === 'string' && Object.hasOwn(ACCOUNT_PANELS, value) ? value as AccountPanel : null;
}
export function accountParentPanel(panel: AccountPanel): AccountPanel | null {
  return panel === 'blocked' ? 'privacySafety' : null;
}
export function profileValidation(name: string, bio: string): string | null {
  if (!name.trim()) return 'Enter the name you would like members to see.';
  if (name.trim().length > 80) return 'Keep your name to 80 characters or fewer.';
  if (bio.trim().length > 500) return 'Keep your introduction to 500 characters or fewer.';
  return null;
}
export function interestValues(value: string): string[] {
  return [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))];
}
export const NOTIFICATION_LABELS = {
  community_replies: 'Replies to your conversations', planned_activity_reminders: 'Activity reminders',
  recommendations: 'Activity ideas', editorial_updates: 'Vital news', product_updates: 'App updates',
} as const;
export type NotificationPreferences = Record<keyof typeof NOTIFICATION_LABELS, boolean>;
export type ActivityPreferences = { preferred_sections: string[]; interests: string[] };
export const FAMILY_RELATIONSHIPS = ['Child', 'Partner', 'Parent', 'Grandparent', 'Other'] as const;
export type FamilyRelationship = typeof FAMILY_RELATIONSHIPS[number];
export type FamilyMember = {
  id: string; family_id: string; display_name: string | null;
  relationship: FamilyRelationship; age_years: number; age_confirmed_at: string;
};
export type FamilyMemberInput = { displayName: string; relationship: FamilyRelationship; ageYears: number };
export type Family = { id: string; name: string; members: FamilyMember[] };
export const FEEDBACK_TYPES = [
  ['bug', 'Bug'], ['suggestion', 'Suggestion'], ['comment', 'Comment'], ['other', 'Other'],
] as const;
export type FeedbackType = typeof FEEDBACK_TYPES[number][0];
export const SUBMISSION_SECTIONS = ['Vital Mums', 'Vital Kids', 'Vital Together', 'Vital Life', 'Vital Food'] as const;
export type SubmissionSection = typeof SUBMISSION_SECTIONS[number];
export type FeedbackSubmission = { type: FeedbackType; subject: string; message: string };
export type ActivitySubmission = {
  name: string; section: SubmissionSection | null; suitableAge: string;
  description: string; equipmentNotes: string; rightsConfirmed: boolean;
};
export function feedbackSubmissionValidation(input: FeedbackSubmission): string | null {
  if (!FEEDBACK_TYPES.some(([value]) => value === input.type)) return 'Choose a feedback type.';
  if (input.subject.trim().length > 120) return 'Keep the subject to 120 characters or fewer.';
  if (!input.message.trim()) return 'Add your feedback before submitting.';
  if (input.message.trim().length > 5000) return 'Keep your feedback to 5,000 characters or fewer.';
  return null;
}
export function activitySubmissionValidation(input: ActivitySubmission): string | null {
  if (!input.name.trim()) return 'Add a name for the activity.';
  if (input.name.trim().length > 160) return 'Keep the activity name to 160 characters or fewer.';
  if (input.section && !(SUBMISSION_SECTIONS as readonly string[]).includes(input.section)) return 'Choose a Vital section.';
  if (input.suitableAge.trim().length > 80) return 'Keep the suitable age to 80 characters or fewer.';
  if (!input.description.trim()) return 'Add a description or instructions for the activity.';
  if (input.description.trim().length > 10000) return 'Keep the description to 10,000 characters or fewer.';
  if (input.equipmentNotes.trim().length > 2000) return 'Keep equipment and notes to 2,000 characters or fewer.';
  if (!input.rightsConfirmed) return 'Confirm that the activity is yours or that you have the right to submit it.';
  return null;
}
export function parseFamilyAge(value: string): number | null {
  const age = value.trim();
  if (!/^(0|[1-9]\d{0,2})$/.test(age)) return null;
  const years = Number(age);
  return years <= 120 ? years : null;
}
export function familyMemberValidation(name: string, relationship: string, age: string): string | null {
  if (name.trim().length > 60) return 'Keep the name or nickname to 60 characters or fewer.';
  if (!(FAMILY_RELATIONSHIPS as readonly string[]).includes(relationship)) return 'Choose a relationship.';
  if (parseFamilyAge(age) === null) return 'Enter the current age as a whole number from 0 to 120.';
  return null;
}
export function supportUrl(email: string | null, subject: string, body = ''): string | null {
  if (!email || !/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
