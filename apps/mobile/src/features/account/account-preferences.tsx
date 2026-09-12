import { useCallback, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Button } from '@/components/vital/button';
import { FilterChip } from '@/components/vital/filter-chip';
import { CommunityField, CommunityNotice } from '@/features/community/community-ui';
import { customerSafeErrorMessage } from '@/lib/errors';
import { colors, sectionColors } from '@/theme/tokens';
import type { AccountApi } from './account-api';
import { interestValues, NOTIFICATION_LABELS, type ActivityPreferences, type NotificationPreferences } from './account-model';
import { a, AccountLoadState, Group, useAccountLoad } from './account-ui';

function PreferenceSave({ label, save, valueKey, disabled = false }: { label: string; save: () => Promise<void>; valueKey: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [resultKey, setResultKey] = useState<string | null>(null);
  async function submit() {
    if (busy) return;
    setBusy(true); setMessage(null); setResultKey(valueKey);
    try { await save(); setError(false); setMessage('Your preferences have been saved.'); }
    catch (cause) { setError(true); setMessage(customerSafeErrorMessage('Save account preferences', cause, "We couldn't save your preferences. Please try again.")); }
    finally { setBusy(false); }
  }
  return <><CommunityNotice message={resultKey === valueKey ? message : null} error={error} /><Button label={label} loading={busy} disabled={disabled} onPress={() => void submit()} /></>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={[a.row, { minHeight: 48 }]}><Text style={[a.label, a.grow]}>{label}</Text>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} thumbColor={colors.surface} hitSlop={8} trackColor={{ false: colors.borderStrong, true: colors.brand }} />
  </View>;
}
function ActivityForm({ api, id, initial }: { api: AccountApi; id: string; initial: ActivityPreferences }) {
  const [sections, setSections] = useState(initial.preferred_sections);
  const [interests, setInterests] = useState(initial.interests.join(', '));
  const values = interestValues(interests);
  return <Group title="Activities & interests">
    <Text style={a.meta}>Choose the areas you enjoy. Age bands are held with your family details.</Text>
    <View style={a.wrap}>{Object.keys(sectionColors).map(section => <FilterChip key={section} label={section} selected={sections.includes(section)}
      onPress={() => setSections(current => current.includes(section) ? current.filter(s => s !== section) : [...current, section])} />)}</View>
    <CommunityField label="Your interests · separate with commas" value={interests} onChangeText={setInterests} maxLength={1000} />
    {values.length > 20 && <CommunityNotice error message="Choose up to 20 interests." />}
    <PreferenceSave label="Save activity preferences" valueKey={JSON.stringify([sections, interests])} disabled={values.length > 20} save={() => api.saveActivities(id, { preferred_sections: sections, interests: values })} />
  </Group>;
}
function NotificationForm({ api, id, initial }: { api: AccountApi; id: string; initial: NotificationPreferences }) {
  const [value, setValue] = useState(initial);
  return <Group title="Notifications">
    <Text style={a.meta}>Choose which updates you want to receive. Your device also controls notification permission.</Text>
    {(Object.keys(NOTIFICATION_LABELS) as (keyof NotificationPreferences)[]).map(key => <Toggle key={key} label={NOTIFICATION_LABELS[key]} value={value[key]} onChange={next => setValue(current => ({ ...current, [key]: next }))} />)}
    <PreferenceSave label="Save notification preferences" valueKey={JSON.stringify(value)} save={() => api.saveNotifications(id, value)} />
  </Group>;
}
function NewsletterForm({ api, id, initial }: { api: AccountApi; id: string; initial: boolean }) {
  const [value, setValue] = useState(initial);
  return <Group title="Newsletter & Vital news"><Toggle label="Receive the Vital newsletter" value={value} onChange={setValue} />
    <PreferenceSave label="Save newsletter preference" valueKey={String(value)} save={() => api.saveNewsletter(id, value)} />
  </Group>;
}
export function AccountPreferences({ api, id }: { api: AccountApi; id: string }) {
  const state = useAccountLoad(useCallback(() => api.preferences(id), [api, id]));
  const data = state.value;
  return <View style={a.stack}><AccountLoadState state={state} />{!state.loading && !state.error && data && <>
    {data.activities ? <ActivityForm api={api} id={id} initial={data.activities} /> : <Group title="Activities & interests"><Text style={a.meta}>Activity preferences are unavailable for this account.</Text></Group>}
    {data.notifications ? <NotificationForm api={api} id={id} initial={data.notifications} /> : <Group title="Notifications"><Text style={a.meta}>Notification preferences are unavailable for this account.</Text></Group>}
    {data.newsletter ? <NewsletterForm api={api} id={id} initial={data.newsletter.subscribed} /> : <Group title="Newsletter & Vital news"><Text style={a.meta}>Newsletter preferences are unavailable for this account.</Text></Group>}
  </>}</View>;
}
