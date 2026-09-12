import privacyContent from '../../../../../packages/content/legal/privacy.json' with { type: 'json' };
import termsContent from '../../../../../packages/content/legal/terms.json' with { type: 'json' };
import faqContent from '../../../../../packages/content/legal/faq.json' with { type: 'json' };

export type LegalBlock = { type: 'paragraph' | 'bullet'; text: string } | { type: 'definitions'; entries: { label: string; text: string }[] };
export type LegalDocument = { title: string; lastUpdated: string; sections: { heading: string; blocks: LegalBlock[] }[] };
export const PRIVACY = privacyContent as LegalDocument;
export const TERMS = termsContent as LegalDocument;
export const FAQS = faqContent.questions;
export function searchFaqs(query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return FAQS.filter(item => words.every(word => `${item.question} ${item.answer.join(' ')}`.toLocaleLowerCase().includes(word)));
}
export const SUPPORT_EMAIL = 'info@vitalcollective.co.uk';
export const SUPPORT_SUBJECTS = {
  help: 'Vital Collective support', suggest: 'Vital Collective suggestion', problem: 'Vital Collective problem report',
} as const;
// Display offers only. Store product identifiers, eligibility and transactions
// must come from the billing integration; these are not purchasable products.
export const MEMBERSHIP_PLANS = [
  { id: 'monthly', title: 'Monthly', price: '£9.99', interval: 'per month' },
  { id: 'annual', title: 'Annual', price: '£59.99', interval: 'per year' },
] as const;
