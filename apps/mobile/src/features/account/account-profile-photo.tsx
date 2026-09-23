import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/vital/button';
import { ProfileAvatar } from '@/components/vital/profile-avatar';
import { CommunityNotice } from '@/features/community/community-ui';
import { customerSafeErrorMessage } from '@/lib/errors';
import { useLanguage } from '@/features/localization/language-context';
import type { MemberProfile } from '@/services/profile-api';
import { pickPreparedProfilePhoto } from '@/services/profile-photo-picker';
import { removeOwnProfilePhoto, updateOwnProfilePhoto } from '@/services/profiles';
import { a } from './account-ui';

export function AccountProfilePhoto({ id, profile, disabled, onBusyChange, onChanged }: {
  id: string;
  profile: MemberProfile;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onChanged: (profile: MemberProfile) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasPhoto = Boolean(profile.avatarReference);

  async function choose() {
    if (busy || disabled) return;
    setError(null); setNotice(null); setConfirmingRemoval(false);
    try {
      // The system picker is opened only from this explicit member action. It
      // requests library access only if the operating system requires it.
      const photo = await pickPreparedProfilePhoto();
      if (!photo) return;
      setBusy(true); onBusyChange(true);
      const saved = await updateOwnProfilePhoto(id, photo);
      onChanged(saved); setNotice(t(hasPhoto ? 'Your profile photo has been changed.' : 'Your profile photo has been added.'));
    } catch (cause) {
      setError(customerSafeErrorMessage('Update profile photo', cause, "We couldn’t update your profile photo. Please try again."));
    } finally { setBusy(false); onBusyChange(false); }
  }

  async function remove() {
    if (busy || disabled || !hasPhoto) return;
    setBusy(true); onBusyChange(true); setError(null); setNotice(null);
    try {
      const saved = await removeOwnProfilePhoto(id);
      onChanged(saved); setConfirmingRemoval(false); setNotice(t('Your profile photo has been removed.'));
    } catch (cause) {
      setError(customerSafeErrorMessage('Remove profile photo', cause, "We couldn’t update your profile photo. Please try again."));
    } finally { setBusy(false); onBusyChange(false); }
  }

  return <View style={a.stack}>
    <View style={a.row}>
      <ProfileAvatar name={profile.displayName} imageUrl={profile.imageUrl} size={82} decorative={false} />
      <View style={a.grow}><Text style={a.label}>{t('Profile photo')}</Text><Text style={a.meta}>{t('Shown with your Community posts and replies. If you remove it, your initials are used instead.')}</Text></View>
    </View>
    <CommunityNotice message={notice} /><CommunityNotice message={error} error />
    {!confirmingRemoval ? <View style={a.stack}>
      <Button label={hasPhoto ? 'Change profile photo' : 'Add profile photo'} icon="image-outline" variant="secondary"
        loading={busy} disabled={disabled} onPress={() => void choose()} />
      {hasPhoto && <Button label="Remove profile photo" variant="secondary" disabled={busy || disabled}
        onPress={() => { setConfirmingRemoval(true); setError(null); setNotice(null); }} />}
    </View> : <View style={a.stack}>
      <Text style={a.body}>{t('Remove your current profile photo? Your initials will appear instead.')}</Text>
      <Button label="Remove photo" variant="danger" loading={busy} disabled={disabled} onPress={() => void remove()} />
      <Button label="Keep photo" variant="secondary" disabled={busy || disabled} onPress={() => setConfirmingRemoval(false)} />
    </View>}
  </View>;
}
