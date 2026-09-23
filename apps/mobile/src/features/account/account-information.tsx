import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/vital/button';
import { CommunityField, CommunityNotice } from '@/features/community/community-ui';
import { customerSafeErrorMessage } from '@/lib/errors';
import { useLanguage } from '@/features/localization/language-context';
import { colors, layout } from '@/theme/tokens';
import { a, AccountLink, Group } from './account-ui';
import { PRIVACY, TERMS, searchFaqs, SUPPORT_EMAIL, SUPPORT_SUBJECTS, type LegalDocument } from './account-content';
import { supportUrl, type AccountPanel } from './account-model';

function LegalText({ document }: { document: LegalDocument }) {
  return <View style={[a.stack, { maxWidth: layout.readingMaxWidth, width: '100%', alignSelf: 'center' }]}>
    <Text style={a.meta}>Last updated: {new Date(`${document.lastUpdated}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
    {document.sections.map(section => <View key={section.heading} style={a.stack}>
      <Text accessibilityRole="header" style={a.title}>{section.heading}</Text>
      {section.blocks.map((block, index) => block.type === 'definitions' ? <View key={index} style={a.stack}>
        {block.entries.map(entry => <View key={entry.label} style={a.rule}><Text style={a.label}>{entry.label}</Text><Text selectable style={a.body}>{entry.text}</Text></View>)}
      </View> : block.type === 'bullet' ? <View key={index} style={[a.row, { alignItems: 'flex-start' }]}><Text style={a.body} accessible={false}>•</Text><Text selectable style={[a.body, a.grow]}>{block.text}</Text></View> : <Text key={index} selectable style={a.body}>{block.text}</Text>)}
    </View>)}
  </View>;
}
export function AccountLegal({ kind }: { kind: 'privacy' | 'terms' }) {
  return <LegalText document={kind === 'privacy' ? PRIVACY : TERMS} />;
}
export function SupportContact({ kind }: { kind: keyof typeof SUPPORT_SUBJECTS }) {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  async function compose() {
    const url = supportUrl(SUPPORT_EMAIL, SUPPORT_SUBJECTS[kind]);
    if (!url) return;
    setError(null);
    try { await Linking.openURL(url); }
    catch (cause) { setError(customerSafeErrorMessage('Open support email', cause, `We couldn't open your email app. You can email ${SUPPORT_EMAIL} directly.`)); }
  }
  return <View style={a.stack}>
    <Text selectable style={a.body}>{SUPPORT_EMAIL}</Text>
    <Text style={a.meta}>{t('Your email app will open so you can review your message before sending. Please avoid passwords or unnecessary sensitive information.')}</Text>
    <CommunityNotice message={error} error />
    <Button label={kind === 'problem' ? 'Report a problem' : 'Contact Vital'} icon="mail-outline" onPress={() => void compose()} />
  </View>;
}
export function AccountHelp({ navigate }: { navigate: (panel: AccountPanel) => void }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const questions = searchFaqs(search);
  return <View style={a.stack}>
    <Group title="Talk to Vital"><SupportContact kind="help" />
      <AccountLink label="Suggest an activity" onPress={() => navigate('suggest')} />
      <AccountLink label="Send feedback" onPress={() => navigate('feedback')} />
      <AccountLink label="Report a problem" onPress={() => navigate('problem')} /></Group>
    <CommunityField label="Search help" placeholder="Try membership, Saved or privacy" value={search} onChangeText={setSearch} autoCapitalize="none" returnKeyType="search" />
    {!questions.length && <Text accessibilityLiveRegion="polite" style={a.body}>{t('No matching questions. Try another word, or contact Vital above.')}</Text>}
    {questions.map(item => <View key={item.id} style={a.rule}>
      <Pressable accessibilityRole="button" accessibilityLabel={item.question} accessibilityState={{ expanded: expanded === item.id }} aria-expanded={expanded === item.id}
        onFocus={() => setFocused(item.id)} onBlur={() => setFocused(null)} onPress={() => setExpanded(current => current === item.id ? null : item.id)}
        style={[a.link, focused === item.id && a.focused]}>
        <Text style={[a.label, a.grow]}>{item.question}</Text><Ionicons name={expanded === item.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.plum} />
      </Pressable>
      {expanded === item.id && item.answer.map(paragraph => <Text selectable key={paragraph} style={a.body}>{paragraph}</Text>)}
    </View>)}
  </View>;
}
