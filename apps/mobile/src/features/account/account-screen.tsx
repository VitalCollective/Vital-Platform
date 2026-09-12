import { useCallback, useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Button } from '@/components/vital/button';
import { ProfileAvatar } from '@/components/vital/profile-avatar';
import { Screen, ScreenHeader } from '@/components/vital/screen';
import { CommunityAbout } from '@/features/community/community-actions';
import type { CommunityApi } from '@/features/community/community-api';
import { CommunityField, CommunityNotice } from '@/features/community/community-ui';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { customerSafeErrorMessage } from '@/lib/errors';
import { getOwnCommunityProfile, updateOwnCommunityProfile } from '@/services/profiles';
import type { AccountApi } from './account-api';
import { ACCOUNT_PANELS, membershipStatus, profileValidation, type AccountPanel } from './account-model';
import { MEMBERSHIP_PLANS } from './account-content';
import { AccountHelp, AccountLegal, SupportContact } from './account-information';
import { AccountPreferences } from './account-preferences';
import { a, AccountLink, AccountLoadState, Group, useAccountLoad } from './account-ui';

type Profile = NonNullable<Awaited<ReturnType<typeof getOwnCommunityProfile>>>;
type Props = { id: string; email?: string; panel: AccountPanel | null; api: AccountApi; community: CommunityApi; navigate: (panel: AccountPanel | null) => void; openCommunity: () => void; signOut: () => Promise<void> };

function EditProfile({ id, profile, onSaved }: { id: string; profile: Profile; onSaved: (profile: Profile) => void }) {
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy) return;
    const invalid = profileValidation(name, bio); setError(invalid); if (invalid) return;
    setBusy(true);
    try { const saved = await updateOwnCommunityProfile(id, name, bio); Keyboard.dismiss(); onSaved(saved); }
    catch (cause) { setError(customerSafeErrorMessage('Update member profile', cause, "We couldn't save your profile. Please try again.")); }
    finally { setBusy(false); }
  }
  return <Group title="How members see you">
    <Text style={a.meta}>Your name, photo and introduction are visible in Community. Your email and family details are not part of your Community profile.</Text>
    <CommunityField label="Member name" value={name} onChangeText={setName} maxLength={80} editable={!busy} autoComplete="name" />
    <CommunityField label="A short introduction · optional" value={bio} onChangeText={setBio} maxLength={500} multiline editable={!busy} />
    <CommunityNotice message={error} error /><Button label="Save profile" loading={busy} onPress={() => void save()} />
  </Group>;
}
function FamilyPanel({ api, id }: Pick<Props, 'api' | 'id'>) {
  const state = useAccountLoad(useCallback(() => api.families(id), [api, id]));
  return <View style={a.stack}><AccountLoadState state={state} />{!state.loading && !state.error && <>
    <Text style={a.body}>A place for the people you share Vital with, their age bands and interests.</Text>
    {state.value?.length ? state.value.map(family => <Group key={family.id} title={family.name}>
      {family.members.length ? family.members.map(member => <View key={member.id} style={a.rule}>
        <Text style={a.label}>{member.display_name}</Text>
        <Text style={a.meta}>{[member.relationship, member.age_band ? `Age ${member.age_band}` : member.age_years !== null ? `Age ${member.age_years}` : null].filter(Boolean).join(' · ') || 'No age details recorded'}</Text>
        {!!member.interests.length && <Text style={a.meta}>{member.interests.join(' · ')}</Text>}
      </View>) : <Text style={a.meta}>No family members recorded.</Text>}
    </Group>) : <Group title="Your family details"><Text style={a.body}>No family members recorded.</Text><Text style={a.meta}>Children’s age bands and shared interests belong here, separate from your public Community identity.</Text></Group>}
    <Text style={a.meta}>Family editing is unavailable in the app.</Text><Button label="Edit family" variant="secondary" disabled onPress={() => {}} />
  </>}</View>;
}
function MembershipPanel({ api, id }: Pick<Props, 'api' | 'id'>) {
  const state = useAccountLoad(useCallback(() => api.memberships(id), [api, id]));
  return <View style={a.stack}><AccountLoadState state={state} />{!state.loading && !state.error && <Group title="Your membership">
    {state.value?.length ? state.value.map((membership, index) => <View key={index} style={a.rule}>
      <Text style={a.label}>{membershipStatus(membership.status)}</Text>
      {membership.expires_at && <Text style={a.meta}>Recorded end date: {new Date(membership.expires_at).toLocaleDateString()}</Text>}
      {membership.auto_renewing !== null && <Text style={a.meta}>Automatic renewal: {membership.auto_renewing ? 'on' : 'off'}</Text>}
    </View>) : <Text style={a.body}>No membership plan is recorded for your account.</Text>}
  </Group>}
    <Group title="Vital membership plans">
      {MEMBERSHIP_PLANS.map(plan => <View key={plan.id} style={a.rule}><Text style={a.label}>{plan.title}</Text><Text style={a.title}>{plan.price} <Text style={a.meta}>{plan.interval}</Text></Text></View>)}
      <Text style={a.body}>The standard free trial is 7 days. It converts to paid membership unless cancelled before the trial ends.</Text>
      <Text style={a.meta}>Selected promotional or partner offers may include a longer trial or a discount. Check the offer terms before joining.</Text>
      <Text style={a.meta}>Memberships purchased through Apple or Google are managed through the relevant store’s subscription settings.</Text>
      <Text style={a.meta}>Purchases and in-app subscription management are not enabled yet. No payment or trial will start here.</Text>
      <Button label="Choose a plan" disabled onPress={() => {}} />
      <Button label="Manage membership" disabled variant="secondary" onPress={() => {}} />
    </Group>
  </View>;
}
function CommunityPanel({ community, navigate, openCommunity }: Pick<Props, 'community' | 'navigate' | 'openCommunity'>) {
  const state = useAccountLoad(useCallback(() => community.access(), [community]));
  const [about, setAbout] = useState(false);
  return <View style={a.stack}>
    <Group title="Your place in Community"><AccountLink label="Community profile" onPress={() => navigate('identity')} /><AccountLink label="Open Community" onPress={openCommunity} /></Group>
    <Group title="Rules & transparency"><AccountLoadState state={state} />
      {!state.loading && !state.error && <><AccountLink label="Community rules" onPress={() => setAbout(true)} /><AccountLink label="About Community & starter conversations" onPress={() => setAbout(true)} /></>}
    </Group>
    <Group title="Reporting & moderation"><Text style={a.body}>Use Report on a post or reply to raise a concern with the Vital team. Reports are not shown publicly.</Text>
      <Text style={a.meta}>You can also block a member from the report options. Your posts and replies will be hidden from each other. Community rules explain what is expected when taking part.</Text></Group>
    {about && <CommunityAbout api={community} access={state.value ?? null} onClose={() => setAbout(false)} onAccepted={state.reload} />}
  </View>;
}
function InformationPanel({ panel, navigate }: { panel: AccountPanel; navigate: Props['navigate'] }) {
  if (panel === 'about') return <Group title="Vital Collective"><Text style={a.body}>Activities, ideas and resources for you and your family, across Vital Mums, Vital Kids, Vital Together, Vital Life and Vital Food.</Text>
    <Text style={a.meta}>Discover something to try, save it for another day, and share experiences in Community.</Text><Text style={a.meta}>App version {Constants.expoConfig?.version ?? 'unavailable'}</Text></Group>;
  if (panel === 'privacy' || panel === 'terms') return <AccountLegal kind={panel} />;
  if (panel === 'help') return <AccountHelp navigate={navigate} />;
  if (panel === 'deletion') return <Group title="Account deletion"><Text style={a.body}>Account deletion is unavailable in the app. No deletion request has been made.</Text>
    <Text style={a.meta}>Signing out does not delete your account or remove your information.</Text><Button label="Request account deletion" disabled variant="danger" onPress={() => {}} /></Group>;
  return <Group title={ACCOUNT_PANELS[panel]}>
    <Text style={a.body}>{panel === 'suggest' ? 'What would make Vital more useful for you and your family? Share an activity idea, a resource you would value, or something you wish was easier.' : panel === 'problem' ? 'Tell us what you were doing, what happened and which device you were using. Please do not include passwords or private family information.' : 'Questions about using Vital or your account belong here.'}</Text>
    <SupportContact kind={panel === 'suggest' ? 'suggest' : panel === 'problem' ? 'problem' : 'help'} />
  </Group>;
}

export function AccountScreen({ id, email, panel, api, community, navigate, openCommunity, signOut }: Props) {
  const { isTablet } = useResponsiveLayout();
  const profileDestination = panel === 'profile' || panel === 'identity' ? panel : null;
  const profile = useAccountLoad(useCallback(() => getOwnCommunityProfile(id), [id, profileDestination]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const name = profile.value?.displayName ?? 'Vital Member';
  async function leave() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await signOut(); }
    catch (cause) { setError(customerSafeErrorMessage('Sign out failed', cause, "We couldn't sign you out just now. Please try again.")); }
    finally { setBusy(false); }
  }
  const link = (destination: AccountPanel, label: string = ACCOUNT_PANELS[destination], detail?: string) =>
    <AccountLink label={label} detail={detail} onPress={() => { setNotice(null); navigate(destination); }} />;
  const identity = <><View style={a.row}><ProfileAvatar name={name} imageUrl={profile.value?.imageUrl} size={54} /><View style={a.grow}>
    <Text style={a.title}>{name}</Text>{!panel && <Text style={a.meta}>{email ?? 'Email unavailable'}</Text>}</View></View>
    {panel === 'identity' && <Text style={a.body}>{profile.value?.bio || 'No introduction added.'}</Text>}</>;
  return <Screen key={panel ?? 'hub'} keyboardAware={panel === 'profile'} scrollProps={{ keyboardDismissMode: 'on-drag' }}>
    {panel && <AccountLink direction="back" label="Back to You" onPress={() => navigate(null)} />}
    <ScreenHeader eyebrow="Your Vital" title={panel ? ACCOUNT_PANELS[panel] : 'You'} description={!panel ? 'Your details, your family, your place in Vital.' : undefined} />
    <View style={a.stack}><CommunityNotice message={notice} />
      {!panel ? <>
        <Group title="Profile"><AccountLoadState state={profile} />{!profile.loading && !profile.error && identity}{link('profile')}{link('identity')}</Group>
        <View style={a.grid}><View style={[a.column, isTablet && a.wideColumn]}>
          <Group title="Your family">{link('family', 'Family members & age bands', 'Keep your family details in one place.')}</Group>
          <Group title="Preferences">{link('preferences', 'Activities, notifications & Vital news')}</Group>
          <Group title="Vital membership">{link('membership', 'Your plan & membership')}</Group>
          <Group title="Community">{link('identity')}{link('community', 'Rules, starter conversations & reporting')}</Group>
        </View><View style={[a.column, isTablet && a.wideColumn]}>
          <Group title="Help & feedback">{link('suggest', 'Suggest an idea', 'What would you love Vital to help with?')}{link('help')}{link('problem')}</Group>
          <Group title="About & legal">{link('about')}{link('privacy')}{link('terms')}<Text style={a.meta}>Version {Constants.expoConfig?.version ?? 'unavailable'}</Text></Group>
          <Group title="Account"><CommunityNotice message={error} error /><Button label="Sign out" icon="log-out-outline" variant="secondary" loading={busy} onPress={() => void leave()} />{link('deletion')}</Group>
        </View></View>
      </> : panel === 'profile' || panel === 'identity' ? <>
        <AccountLoadState state={profile} />{!profile.loading && !profile.error && (profile.value ? panel === 'profile' ?
          <EditProfile id={id} profile={profile.value} onSaved={saved => { profile.commit(saved); navigate(null); setNotice('Your profile has been saved.'); }} /> :
          <Group title="Your Community identity">{identity}<Text style={a.meta}>This is the name, image and introduction members see beside your conversations.</Text>{link('profile')}<AccountLink label="Open Community" onPress={openCommunity} /></Group> : <><Text style={a.body}>Your profile is unavailable.</Text><Button label="Try again" onPress={profile.reload} /></>)}
      </> : panel === 'family' ? <FamilyPanel api={api} id={id} /> : panel === 'preferences' ? <AccountPreferences api={api} id={id} /> :
        panel === 'membership' ? <MembershipPanel api={api} id={id} /> : panel === 'community' ? <CommunityPanel community={community} navigate={navigate} openCommunity={openCommunity} /> : <InformationPanel key={panel} panel={panel} navigate={navigate} />}
    </View>
  </Screen>;
}
