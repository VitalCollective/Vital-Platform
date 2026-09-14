export const ACCOUNT_PANELS = {
  profile: 'Edit profile', identity: 'Community profile', family: 'Your family',
  preferences: 'Preferences', membership: 'Vital membership', community: 'Community',
  help: 'Help & contact', suggest: 'Suggest an idea', problem: 'Report a problem',
  about: 'About Vital Collective', privacy: 'Privacy Policy', terms: 'Terms', deletion: 'Delete account',
} as const;
export type AccountPanel = keyof typeof ACCOUNT_PANELS;
export function accountPanel(value: string | string[] | undefined): AccountPanel | null {
  return typeof value === 'string' && Object.hasOwn(ACCOUNT_PANELS, value) ? value as AccountPanel : null;
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
export type Membership = { status: string; started_at: string | null; expires_at: string | null; auto_renewing: boolean | null };
export function membershipStatus(value: string): string {
  return ({ trial: 'Trial', active: 'Active', grace_period: 'Payment needs attention', expired: 'Expired', cancelled: 'Cancelled' } as Record<string, string>)[value] ?? 'Status unavailable';
}
export function supportUrl(email: string | null, subject: string, body = ''): string | null {
  if (!email || !/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
