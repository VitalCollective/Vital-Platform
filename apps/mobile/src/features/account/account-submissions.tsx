import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/vital/button';
import { FilterChip } from '@/components/vital/filter-chip';
import { CommunityField, CommunityNotice, s } from '@/features/community/community-ui';
import { customerSafeErrorMessage } from '@/lib/errors';
import { colors } from '@/theme/tokens';
import type { AccountApi } from './account-api';
import {
  activitySubmissionValidation,
  FEEDBACK_TYPES,
  feedbackSubmissionValidation,
  SUBMISSION_SECTIONS,
  type FeedbackType,
  type SubmissionSection,
} from './account-model';
import { a, Group } from './account-ui';

export function FeedbackSubmissionForm({ api, id }: { api: AccountApi; id: string }) {
  const [type, setType] = useState<FeedbackType>('comment');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function submit() {
    if (busy) return;
    const input = { type, subject, message };
    const invalid = feedbackSubmissionValidation(input);
    if (invalid) { setError(invalid); setNotice(null); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.submitFeedback(id, input);
      setSubject(''); setMessage('');
      setNotice('Thank you. Your feedback has been sent privately to the Vital team.');
    } catch (cause) {
      setError(customerSafeErrorMessage('Submit member feedback', cause, "We couldn't send your feedback just now. Your words are still here; please try again."));
    } finally { setBusy(false); }
  }
  return <Group title="Send feedback">
    <Text style={a.body}>Tell us about a bug, suggestion, comment, or anything else that would make Vital better for your family.</Text>
    <Text style={s.label}>Feedback type</Text>
    <View style={s.row}>{FEEDBACK_TYPES.map(([value, label]) => <FilterChip key={value} label={label} selected={type === value} onPress={() => { setType(value); setError(null); setNotice(null); }} />)}</View>
    <CommunityField label="Subject · optional" value={subject} onChangeText={(value) => { setSubject(value); setError(null); setNotice(null); }} maxLength={120} editable={!busy} />
    <CommunityField label="Your feedback" value={message} onChangeText={(value) => { setMessage(value); setError(null); setNotice(null); }} multiline maxLength={5000} editable={!busy} placeholder="What would you like us to know?" />
    <Text style={a.meta}>Your submission is private and is not posted in Community.</Text>
    <CommunityNotice message={error} error /><CommunityNotice message={notice} />
    <Button label="Submit feedback" icon="paper-plane-outline" loading={busy} onPress={() => void submit()} />
  </Group>;
}

export function ActivitySubmissionForm({ api, id }: { api: AccountApi; id: string }) {
  const [name, setName] = useState('');
  const [section, setSection] = useState<SubmissionSection | null>(null);
  const [suitableAge, setSuitableAge] = useState('');
  const [description, setDescription] = useState('');
  const [equipmentNotes, setEquipmentNotes] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function changed() { setError(null); setNotice(null); }
  async function submit() {
    if (busy) return;
    const input = { name, section, suitableAge, description, equipmentNotes, rightsConfirmed };
    const invalid = activitySubmissionValidation(input);
    if (invalid) { setError(invalid); setNotice(null); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.submitActivity(id, input);
      setName(''); setSection(null); setSuitableAge(''); setDescription(''); setEquipmentNotes(''); setRightsConfirmed(false);
      setNotice('Thank you. Your activity has been sent privately to the Vital team for review.');
    } catch (cause) {
      setError(customerSafeErrorMessage('Submit member activity', cause, "We couldn't send your activity just now. Your words are still here; please try again."));
    } finally { setBusy(false); }
  }
  return <Group title="Suggest an activity">
    <Text style={a.body}>Got an activity your family loves? Send it to us. If we add it to Vital, we’ll give you one month of Vital membership free.</Text>
    <CommunityField label="Activity name" value={name} onChangeText={(value) => { setName(value); changed(); }} maxLength={160} editable={!busy} />
    <Text style={s.label}>Vital section · optional</Text>
    <View style={s.row}><FilterChip label="Not sure" selected={!section} onPress={() => { setSection(null); changed(); }} />
      {SUBMISSION_SECTIONS.map(value => <FilterChip key={value} label={value} selected={section === value} onPress={() => { setSection(value); changed(); }} />)}
    </View>
    <CommunityField label="Suitable age · optional" value={suitableAge} onChangeText={(value) => { setSuitableAge(value); changed(); }} maxLength={80} editable={!busy} placeholder="For example, age 5–8 or all ages" />
    <CommunityField label="Description or instructions" value={description} onChangeText={(value) => { setDescription(value); changed(); }} multiline maxLength={10000} editable={!busy} placeholder="How does your family do this activity?" />
    <CommunityField label="Equipment or notes · optional" value={equipmentNotes} onChangeText={(value) => { setEquipmentNotes(value); changed(); }} multiline maxLength={2000} editable={!busy} />
    <Text style={a.meta}>If we accept it, Vital may edit, adapt and publish it clearly for other families. Duplicate or already-known activities may not qualify. The reward applies only when Vital accepts and publishes the activity, has no cash alternative, and will be fulfilled using the membership options supported by your subscription platform.</Text>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: rightsConfirmed }} disabled={busy}
      onPress={() => { setRightsConfirmed(value => !value); changed(); }} style={({ pressed }) => [a.link, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
      <Ionicons name={rightsConfirmed ? 'checkbox' : 'square-outline'} size={24} color={colors.plum} />
      <Text style={[a.body, a.grow]}>I confirm this activity is my own, or I have the right to submit it to Vital.</Text>
    </Pressable>
    <Text style={a.meta}>Your submission is private and is not posted in Community.</Text>
    <CommunityNotice message={error} error /><CommunityNotice message={notice} />
    <Button label="Submit activity" icon="paper-plane-outline" loading={busy} onPress={() => void submit()} />
  </Group>;
}
