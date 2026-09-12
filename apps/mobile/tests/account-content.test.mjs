import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PRIVACY, TERMS, FAQS, searchFaqs, SUPPORT_EMAIL, SUPPORT_SUBJECTS, MEMBERSHIP_PLANS } from '../src/features/account/account-content.ts';
import { supportUrl } from '../src/features/account/account-model.ts';

test('canonical member documents retain all numbered sections and substantive Privacy tables', () => {
  for (const [document, count] of [[PRIVACY, 16], [TERMS, 21]]) {
    assert.equal(document.sections.length, count);
    document.sections.forEach((section, i) => {
      assert.ok(section.heading.startsWith(`${i + 1}. `));
      assert.ok(section.blocks.length);
    });
    assert.equal(document.lastUpdated, '2026-09-12');
    const text = JSON.stringify(document);
    for (const value of ['Clay Theakston', 'Unit 1, The Breeze Hill, Bangor Road', 'Benllech', 'Anglesey', 'LL74 8TN', SUPPORT_EMAIL]) assert.ok(text.includes(value));
  }
  const tables = PRIVACY.sections.flatMap(section => section.blocks.filter(block => block.type === 'definitions'));
  assert.deepEqual(tables.map(table => table.entries.length), [10, 8]);
});

test('only member-facing text is shipped, without drafting/source/governance material', () => {
  const text = JSON.stringify([PRIVACY, TERMS, FAQS]);
  assert.doesNotMatch(text, /WORKING DRAFT|Before publication|Official sources|\[CONFIRM|DPIA|ROPA|Governance Pack|launch checklist|must provide practical in-app/i);
  const wrapper = readFileSync(new URL('../src/features/account/account-content.ts', import.meta.url), 'utf8');
  assert.match(wrapper, /packages\/content\/legal\/privacy.json/);
  assert.match(wrapper, /packages\/content\/legal\/terms.json/);
  assert.match(wrapper, /packages\/content\/legal\/faq.json/);
});

test('all 30 approved FAQs are searchable by question and answer, case-insensitively', () => {
  assert.equal(FAQS.length, 30);
  assert.equal(new Set(FAQS.map(item => item.id)).size, 30);
  assert.deepEqual(searchFaqs('  '), FAQS);
  assert.ok(searchFaqs('MEMBERSHIP').length);
  const matches = searchFaqs(' trial   membership ');
  assert.ok(matches.length);
  assert.ok(matches.every(item => /trial/i.test(item.question + item.answer.join(' ')) && /membership/i.test(item.question + item.answer.join(' '))));
  assert.deepEqual(searchFaqs('no-match-unique-phrase'), []);
});

test('contact actions use approved email subjects and store plans remain display-only', () => {
  assert.deepEqual(SUPPORT_SUBJECTS, { help: 'Vital Collective support', suggest: 'Vital Collective suggestion', problem: 'Vital Collective problem report' });
  for (const subject of Object.values(SUPPORT_SUBJECTS)) {
    const url = new URL(supportUrl(SUPPORT_EMAIL, subject));
    assert.equal(url.protocol, 'mailto:'); assert.equal(url.pathname, SUPPORT_EMAIL);
    assert.equal(url.searchParams.get('subject'), subject);
  }
  assert.deepEqual(MEMBERSHIP_PLANS.map(plan => plan.price), ['£9.99', '£59.99']);
  const terms = JSON.stringify(TERMS);
  for (const value of ['£9.99', '£59.99', '7-day', 'Apple', 'Google']) assert.ok(terms.includes(value));
  const screen = readFileSync(new URL('../src/features/account/account-screen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /label="Choose a plan" disabled/);
  assert.match(screen, /label="Manage membership" disabled/);
});

test('all You child panels share a leading back chevron; profile opts into native keyboard handling', () => {
  const screen = readFileSync(new URL('../src/features/account/account-screen.tsx', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/features/account/account-ui.tsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/components/vital/screen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /panel && <AccountLink direction="back" label="Back to You"/);
  assert.match(ui, /direction === 'back' && <Ionicons name="chevron-back"/);
  assert.match(screen, /keyboardAware=\{panel === 'profile'\}/);
  assert.match(layout, /automaticallyAdjustKeyboardInsets=\{keyboardAware && Platform.OS === 'ios'\}/);
  assert.match(layout, /measureInWindow/);
  assert.match(layout, /behavior="height" keyboardVerticalOffset=\{keyboardOffset\}/);
  assert.match(layout, /keyboardShouldPersistTaps="handled"/);
  assert.match(screen, /profile.commit\(saved\)/);
  assert.match(ui, /request === generation.current/);
});
