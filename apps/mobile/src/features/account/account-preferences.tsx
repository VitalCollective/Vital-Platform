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
import { LanguageSelector } from '@/features/localization/language-selector';
import { useLanguage } from '@/features/localization/language-context';
import type { AppLanguage } from '@/features/localization/localization-model';

function PreferenceSave({ label, save, valueKey, disabled = false }: { label: string; save: () => Promise<void>; valueKey: string; disabled?: boolean }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [resultKey, setResultKey] = useState<string | null>(null);
  async function submit() {
    if (busy) return;
    setBusy(true); setMessage(null); setResultKey(valueKey);
    try { await save(); setError(false); setMessage(t('Your preferences have been saved.')); }
    catch (cause) { setError(true); setMessage(customerSafeErrorMessage('Save account preferences', cause, t("We couldn't save your preferences. Please try again."))); }
    finally { setBusy(false); }
  }
  return <><CommunityNotice message={resultKey === valueKey ? message : null} error={error} /><Button label={label} loading={busy} disabled={disabled} onPress={() => void submit()} /></>;
}
function LanguageForm({ api, id, initial }: { api: AccountApi; id: string; initial: AppLanguage | null }) {
  const { language, t } = useLanguage();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  async function save(next: AppLanguage) {
    setMessage(null);
    try {
      await api.saveLanguage(id, next);
      setError(false); setMessage(t('Your preferences have been saved.'));
    } catch (cause) {
      setError(true);
      setMessage(customerSafeErrorMessage('Save language preference', cause, t("We couldn't save your preferences. Please try again.")));
    }
  }
  return <Group title={t('Language')}>
    <Text style={a.meta}>{t('Choose the language used for Vital controls and navigation. Activities without a Welsh translation will remain in English.')}</Text>
    <LanguageSelector onChange={save} />
    <CommunityNotice message={message} error={error} />
    {initial && initial !== language ? <Text style={a.meta}>{t('Your selected language is saved when you choose it above.')}</Text> : null}
  </Group>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={[a.row, { minHeight: 48 }]}><Text style={[a.label, a.grow]}>{label}</Text>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} thumbColor={colors.surface} hitSlop={8} trackColor={{ false: colors.borderStrong, true: colors.brand }} />
  </View>;
}
function ActivityForm({ api, id, initial }: { api: AccountApi; id: string; initial: ActivityPreferences }) {
  const { t } = useLanguage();
  const [sections, setSections] = useState(initial.preferred_sections);
  const [interests, setInterests] = useState(initial.interests.join(', '));
  const values = interestValues(interests);
  return <Group title={t('Activities & interests')}>
    <Text style={a.meta}>{t('Choose the areas you enjoy. Age bands are held with your family details.')}</Text>
    <View style={a.wrap}>{Object.keys(sectionColors).map(section => <FilterChip key={section} label={t(section)} selected={sections.includes(section)}
      onPress={() => setSections(current => current.includes(section) ? current.filter(s => s !== section) : [...current, section])} />)}</View>
    <CommunityField label="Your interests · separate with commas" value={interests} onChangeText={setInterests} maxLength={1000} />
    {values.length > 20 && <CommunityNotice error message="Choose up to 20 interests." />}
    <PreferenceSave label="Save activity preferences" valueKey={JSON.stringify([sections, interests])} disabled={values.length > 20} save={() => api.saveActivities(id, { preferred_sections: sections, interests: values })} />
  </Group>;
}
function NotificationForm({ api, id, initial }: { api: AccountApi; id: string; initial: NotificationPreferences }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(initial);
  return <Group title="Notifications">
    <Text style={a.meta}>{t('Choose which updates you want to receive. Your device also controls notification permission.')}</Text>
    {(Object.keys(NOTIFICATION_LABELS) as (keyof NotificationPreferences)[]).map(key => <Toggle key={key} label={t(NOTIFICATION_LABELS[key])} value={value[key]} onChange={next => setValue(current => ({ ...current, [key]: next }))} />)}
    <PreferenceSave label="Save notification preferences" valueKey={JSON.stringify(value)} save={() => api.saveNotifications(id, value)} />
  </Group>;
}
function NewsletterForm({ api, id, initial }: { api: AccountApi; id: string; initial: boolean }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(initial);
  return <Group title="Newsletter & Vital news"><Toggle label="Receive the Vital newsletter" value={value} onChange={setValue} />
    <PreferenceSave label="Save newsletter preference" valueKey={String(value)} save={() => api.saveNewsletter(id, value)} />
  </Group>;
}
export function AccountPreferences({ api, id }: { api: AccountApi; id: string }) {
  const { t } = useLanguage();
  const state = useAccountLoad(useCallback(() => api.preferences(id), [api, id]));
  const data = state.value;
  return <View style={a.stack}><AccountLoadState state={state} />{!state.loading && !state.error && data && <>
    <LanguageForm api={api} id={id} initial={data.language} />
    {data.activities ? <ActivityForm api={api} id={id} initial={data.activities} /> : <Group title={t('Activities & interests')}><Text style={a.meta}>{t('Activity preferences are unavailable for this account.')}</Text></Group>}
    {data.notifications ? <NotificationForm api={api} id={id} initial={data.notifications} /> : <Group title={t('Notifications')}><Text style={a.meta}>{t('Notification preferences are unavailable for this account.')}</Text></Group>}
    {data.newsletter ? <NewsletterForm api={api} id={id} initial={data.newsletter.subscribed} /> : <Group title={t('Newsletter & Vital news')}><Text style={a.meta}>{t('Newsletter preferences are unavailable for this account.')}</Text></Group>}
  </>}</View>;
}
