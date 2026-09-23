import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/vital/button';
import { FilterChip } from '@/components/vital/filter-chip';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useLanguage } from '@/features/localization/language-context';
import { customerSafeErrorMessage } from '@/lib/errors';
import type { CommunityApi } from './community-api';
import { COMMUNITY_TOPICS, POST_TYPES, validatePostDraft, type ActivityLinkOption, type CommunityTopic, type PostType } from './community-model';
import { CommunityAction, CommunityField, CommunityModal, CommunityNotice, s } from './community-ui';

export function CommunityComposer({ api, initialType, onClose, onCreated }: {
  api: CommunityApi; initialType: PostType; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [postType, setPostType] = useState(initialType);
  const [topic, setTopic] = useState<CommunityTopic | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activity, setActivity] = useState<ActivityLinkOption | null>(null);
  const [options, setOptions] = useState<ActivityLinkOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const query = useDebouncedValue(activitySearch, 300);
  useEffect(() => {
    let active = true;
    setOptions([]); setActivityError(null);
    if (query.trim().length < 2 || activity) { setSearching(false); return; }
    setSearching(true);
    api.findActivities(query).then((data) => { if (active) setOptions(data); }).catch((cause) => {
      if (active) setActivityError(customerSafeErrorMessage('Community activity lookup', cause, "We couldn't find activities just now. You can still post without a link."));
    }).finally(() => { if (active) setSearching(false); });
    return () => { active = false; };
  }, [api, query, activity]);
  async function publish() {
    if (busy) return;
    const draft = { title, body, postType, topic, activityId: activity?.id ?? null };
    const validation = validatePostDraft(draft);
    if (validation) { setError(validation); return; }
    setBusy(true); setError(null);
    try { onCreated(await api.createPost(draft)); }
    catch (cause) { setError(customerSafeErrorMessage('Community publish', cause, "We couldn't publish your post. Your words are still here; check your connection and community permissions, then try again.")); }
    finally { setBusy(false); }
  }
  return <CommunityModal title={t('Share with Community')} busy={busy} onClose={() => {
    if (title || body) setConfirmDiscard(true); else onClose();
  }}>
    {confirmDiscard ? <View style={s.card}><Text style={s.body}>{t('Discard this draft?')}</Text><Text style={s.meta}>{t('Your unpublished words will be cleared.')}</Text><Button label="Keep writing" onPress={() => setConfirmDiscard(false)} /><Button label="Discard draft" variant="danger" onPress={onClose} /></View> : null}
    <Text style={s.meta}>{t('Share what worked, ask when you are stuck, or tell us how it really went.')}</Text>
    <View style={s.row}>{POST_TYPES.map((type) => <FilterChip key={type.value} label={t(type.noun)} selected={postType === type.value} onPress={() => setPostType(type.value)} />)}</View>
    <CommunityField label="Title" value={title} onChangeText={setTitle} maxLength={200} editable={!busy} placeholder="What would you like to share?" />
    <CommunityField label="Your post" value={body} onChangeText={setBody} multiline maxLength={20000} editable={!busy} placeholder="Different families find different things useful." />
    <Text style={s.label}>{t('Topic · optional')}</Text>
    <View style={s.row}><FilterChip label={t('General')} selected={!topic} onPress={() => setTopic(null)} />{COMMUNITY_TOPICS.map((value) => <FilterChip key={value} label={t(value)} selected={topic === value} onPress={() => setTopic(value)} />)}</View>
    <Text style={s.label}>{t('Link a Vital activity · optional')}</Text>
    {activity ? <View style={s.card}><Text style={s.body}>{activity.title}</Text><CommunityAction label="Remove activity link" icon="close" onPress={() => { setActivity(null); setActivitySearch(''); }} /></View> : <>
      <CommunityField label="Find an activity by title" value={activitySearch} onChangeText={setActivitySearch} maxLength={120} placeholder="For example, Rescue the Explorer" />
      {searching ? <Text style={s.meta}>{t('Finding activities…')}</Text> : null}
      {!searching && query.trim().length >= 2 && !options.length && !activityError ? <Text style={s.meta}>{t('No matching activities. Try a different part of the title.')}</Text> : null}
      {options.map((option) => <CommunityAction key={option.id} label={`${option.title} · ${option.section}`} icon="link-outline" onPress={() => setActivity(option)} />)}
    </>}
    <CommunityNotice message={activityError} error />
    <Text style={s.meta}>{t("No advertising or sales pitches. Please keep children's identifying details private.")}</Text>
    <CommunityNotice message={error} error />
    <Button label={t('Publish post')} icon="paper-plane-outline" onPress={() => void publish()} loading={busy} />
  </CommunityModal>;
}
