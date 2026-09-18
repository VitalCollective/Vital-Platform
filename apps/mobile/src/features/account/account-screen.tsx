import { useCallback, useState } from 'react';
import { Keyboard, Linking, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/vital/button';
import { ProfileAvatar } from '@/components/vital/profile-avatar';
import { Screen, ScreenHeader } from '@/components/vital/screen';
import { BlockedMembersContent, CommunityAbout } from '@/features/community/community-actions';
import type { CommunityApi } from '@/features/community/community-api';
import { CommunityField, CommunityNotice } from '@/features/community/community-ui';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { customerSafeErrorMessage, reportTechnicalError } from '@/lib/errors';
import { getOwnCommunityProfile, updateOwnCommunityProfile } from '@/services/profiles';
import { AccountDeletionError, type AccountApi } from './account-api';
import { ACCOUNT_PANELS, accountParentPanel, profileValidation, type AccountPanel } from './account-model';
import { MEMBERSHIP_PLANS } from './account-content';
import { useBilling } from '@/features/billing/billing-context';
import { formatMembershipDate, membershipHeading } from '@/features/billing/billing-model';
import { AccountFamily } from './account-family';
import { AccountHelp, AccountLegal, SupportContact } from './account-information';
import { AccountPreferences } from './account-preferences';
import { AccountProfilePhoto } from './account-profile-photo';
import { ActivitySubmissionForm, FeedbackSubmissionForm } from './account-submissions';
import { a, AccountLink, AccountLoadState, Group, useAccountLoad } from './account-ui';
import { colors } from '@/theme/tokens';

type Profile = NonNullable<Awaited<ReturnType<typeof getOwnCommunityProfile>>>;
type Props = { id: string; email?: string; panel: AccountPanel | null; api: AccountApi; community: CommunityApi; navigate: (panel: AccountPanel | null) => void; openCommunity: () => void; signOut: () => Promise<void> };

function EditProfile({ id, profile, onSaved, onPhotoChanged }: {
  id: string; profile: Profile; onSaved: (profile: Profile) => void; onPhotoChanged: (profile: Profile) => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy || photoBusy) return;
    const invalid = profileValidation(name, bio); setError(invalid); if (invalid) return;
    setBusy(true);
    try { const saved = await updateOwnCommunityProfile(id, name, bio); Keyboard.dismiss(); onSaved(saved); }
    catch (cause) { setError(customerSafeErrorMessage('Update member profile', cause, "We couldn't save your profile. Please try again.")); }
    finally { setBusy(false); }
  }
  return <Group title="How members see you">
    <Text style={a.meta}>Your name, photo and introduction are visible in Community. Your email and family details are not part of your Community profile.</Text>
    <AccountProfilePhoto id={id} profile={profile} disabled={busy} onBusyChange={setPhotoBusy} onChanged={onPhotoChanged} />
    <CommunityField label="Member name" value={name} onChangeText={setName} maxLength={80} editable={!busy && !photoBusy} autoComplete="name" />
    <CommunityField label="A short introduction · optional" value={bio} onChangeText={setBio} maxLength={500} multiline editable={!busy && !photoBusy} />
    <CommunityNotice message={error} error /><Button label="Save profile" loading={busy} disabled={photoBusy} onPress={() => void save()} />
  </Group>;
}
function MembershipPanel() {
  const billing = useBilling();
  const endDate = formatMembershipDate(
    billing.membership.state === 'grace_period'
      ? billing.membership.gracePeriodEndsAt ?? billing.membership.periodEndsAt
      : billing.membership.periodEndsAt,
  );
  const purchaseReady = billing.providerAvailable && billing.purchasesEnabled;
  const showDevelopmentFallbackPlans = billing.plans.length === 0 && billing.purchasesEnabled;
  const displayedPlans = billing.plans.length
    ? billing.plans
    : showDevelopmentFallbackPlans ? MEMBERSHIP_PLANS : [];
  return <View style={a.stack}><Group title={membershipHeading(billing.membership)}>
    {billing.isResolving ? <Text style={a.body}>Checking your membership…</Text> : <>
      {billing.state === 'trial_active' && endDate && <Text style={a.body}>Your trial ends on {endDate}. It will renew at the store price unless you cancel beforehand.</Text>}
      {billing.state === 'active' && <Text style={a.body}>Your full Vital membership is active{endDate ? ` until its next renewal on ${endDate}` : ''}.</Text>}
      {billing.state === 'cancelled' && <Text style={a.body}>Automatic renewal is off. You still have full Vital access{endDate ? ` until ${endDate}` : ' until the verified period ends'}.</Text>}
      {billing.state === 'grace_period' && <Text style={a.body}>Your store reported a payment problem, but your Vital access continues{endDate ? ` during the grace period until ${endDate}` : ' during the current grace period'}.</Text>}
      {billing.state === 'billing_issue' && <Text style={a.body}>Your store says the payment issue is no longer within a valid grace period. Update your payment method to restore access.</Text>}
      {['expired', 'refunded', 'revoked'].includes(billing.state) && <Text style={a.body}>Choose a membership or restore an eligible store purchase to return to Vital.</Text>}
      {['no_entitlement', 'trial_available'].includes(billing.state) && <Text style={a.body}>Choose a Vital membership to access activities, resources, Saved and Community.</Text>}
      {billing.state === 'restoring' && <Text accessibilityLiveRegion="polite" style={a.body}>Checking your store purchases…</Text>}
      {billing.state === 'provider_unavailable' && <Text style={a.body}>We couldn’t confirm your membership just now. Your account, support and legal options remain available.</Text>}
      {billing.error && <CommunityNotice message={billing.error} error />}
      {billing.error && <Button label="Try again" variant="secondary" onPress={() => void billing.refresh()} />}
    </>}
  </Group>
    <Group title="Vital membership plans">
      {displayedPlans.map(plan => <View key={plan.id} style={a.rule}>
        <Text style={a.label}>{plan.title}</Text><Text style={a.title}>{plan.price} <Text style={a.meta}>{plan.interval}</Text></Text>
        {'trialDescription' in plan && plan.trialDescription && <Text style={a.meta}>{plan.trialDescription}</Text>}
        {'packageIdentifier' in plan && !billing.hasAccess && <Button
          label={plan.trialDescription
            ? `Start ${plan.trialDescription} · ${plan.price}`
            : `Choose ${plan.title.toLocaleLowerCase()} · ${plan.price}`}
          disabled={!purchaseReady || Boolean(billing.busyAction)} loading={billing.busyAction === 'purchase'}
          accessibilityHint="Opens the Apple or Google purchase confirmation"
          onPress={() => void billing.purchase(plan.id)} />}
      </View>)}
      {displayedPlans.length > 0 && <Text style={a.body}>The standard introductory trial is 7 days and converts to paid membership unless cancelled through Apple or Google before it ends.</Text>}
      {showDevelopmentFallbackPlans && <Text style={a.meta}>Development-only fallback prices are shown for testing. No payment or trial can start until store products load.</Text>}
      {billing.plans.length === 0 && !showDevelopmentFallbackPlans && <Text style={a.meta}>Membership plans are temporarily unavailable. Please try again.</Text>}
      {billing.plans.length === 0 && !billing.error && <Button label="Try again" variant="secondary" onPress={() => void billing.refresh()} />}
      {billing.plans.length > 0 && !billing.purchasesEnabled && <Text style={a.meta}>Membership purchases are unavailable in this version of Vital.</Text>}
      <Button label="Restore purchases" variant="secondary" disabled={!billing.providerAvailable || Boolean(billing.busyAction)}
        loading={billing.busyAction === 'restore'} onPress={() => void billing.restore()} />
      {billing.managementUrl && <Button label="Manage subscription" variant="secondary"
        onPress={() => void Linking.openURL(billing.managementUrl!)} />}
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
function PrivacySafetyPanel({ navigate }: Pick<Props, 'navigate'>) {
  return <View style={a.stack}>
    <Group title="Community privacy"><AccountLink label="Blocked members" detail="Review or unblock people you have blocked in Community." onPress={() => navigate('blocked')} /></Group>
    <Group title="Your privacy"><Text style={a.body}>Your family information stays private to your account. Your Community profile contains only the name, image and introduction you choose to share.</Text>
      <AccountLink label="Privacy Policy" onPress={() => navigate('privacy')} /></Group>
  </View>;
}
function DeleteAccountPanel({ api, id, navigate, signOut }: Pick<Props, 'api' | 'id' | 'navigate' | 'signOut'>) {
  const billing = useBilling();
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [billingAcknowledged, setBillingAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function removeAccount() {
    if (busy || confirmation !== 'DELETE') return;
    if (!billingAcknowledged) { setError('Confirm that deleting Vital does not cancel store billing.'); return; }
    setBusy(true); setError(null);
    try {
      await api.deleteAccount(id, confirmation);
      try { await signOut(); }
      catch (cause) { reportTechnicalError('Clear deleted account session', cause); }
    } catch (cause) {
      setError(cause instanceof AccountDeletionError ? cause.message : customerSafeErrorMessage('Delete account', cause, "We couldn't delete your account. Please try again."));
      setBusy(false);
    }
  }
  return <View style={a.stack}>
    <Group title="Delete your account">
      <Text style={a.body}>This permanently removes your Vital account, profile, family information, preferences, Saved items and Community content. It cannot be undone.</Text>
      <Text style={a.meta}>If another member has replied to one of your Community posts, only a neutral deleted-post marker may remain so their reply is not destroyed. Your original text, name, introduction and profile image will be removed.</Text>
      <Text style={a.meta}>Deleting your Vital account does not cancel your App Store or Google Play subscription.</Text>
      {billing.managementUrl && <Button label="Manage subscription" variant="secondary" onPress={() => void Linking.openURL(billing.managementUrl!)} />}
      <CommunityNotice message={error} error />
      {!confirming ? <>
        <Button label="Continue to deletion" variant="danger" onPress={() => { setConfirming(true); setError(null); }} />
        <Button label="Cancel" variant="secondary" onPress={() => navigate(null)} />
      </> : <>
        <Text style={a.body}>Type DELETE below to confirm permanent account deletion.</Text>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: billingAcknowledged }}
          onPress={() => setBillingAcknowledged(value => !value)} style={a.row}>
          <Ionicons name={billingAcknowledged ? 'checkbox' : 'square-outline'} size={24} color={colors.plum} />
          <Text style={a.meta}>I understand that deleting Vital does not cancel billing through Apple or Google.</Text>
        </Pressable>
        <CommunityField label="Type DELETE to confirm" value={confirmation} onChangeText={(value) => { setConfirmation(value); setError(null); }}
          editable={!busy} autoCapitalize="characters" autoCorrect={false} maxLength={6} />
        <Button label="Delete account permanently" variant="danger" loading={busy} disabled={confirmation !== 'DELETE' || !billingAcknowledged}
          accessibilityHint="Permanently deletes your Vital account and personal data" onPress={() => void removeAccount()} />
        <Button label="Cancel" variant="secondary" disabled={busy} onPress={() => navigate(null)} />
      </>}
    </Group>
  </View>;
}
function InformationPanel({ panel, navigate }: { panel: AccountPanel; navigate: Props['navigate'] }) {
  if (panel === 'about') return <Group title="Vital Collective"><Text style={a.body}>Activities, ideas and resources for you and your family, across Vital Mums, Vital Kids, Vital Together, Vital Life and Vital Food.</Text>
    <Text style={a.meta}>Discover something to try, save it for another day, and share experiences in Community.</Text><Text style={a.meta}>App version {Constants.expoConfig?.version ?? 'unavailable'}</Text></Group>;
  if (panel === 'privacy' || panel === 'terms') return <AccountLegal kind={panel} />;
  if (panel === 'help') return <AccountHelp navigate={navigate} />;
  return <Group title={ACCOUNT_PANELS[panel]}>
    <Text style={a.body}>{panel === 'problem' ? 'Tell us what you were doing, what happened and which device you were using. Please do not include passwords or private family information.' : 'Questions about using Vital or your account belong here.'}</Text>
    <SupportContact kind={panel === 'problem' ? 'problem' : 'help'} />
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
  const parentPanel = panel ? accountParentPanel(panel) : null;
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
  return <Screen key={panel ?? 'hub'} keyboardAware={panel === 'profile' || panel === 'family' || panel === 'suggest' || panel === 'feedback' || panel === 'problem' || panel === 'deletion'} scrollProps={{ keyboardDismissMode: 'on-drag' }}>
    {panel && <AccountLink direction="back" label={parentPanel ? `Back to ${ACCOUNT_PANELS[parentPanel]}` : 'Back to You'} onPress={() => navigate(parentPanel)} />}
    <ScreenHeader eyebrow="Your Vital" title={panel ? ACCOUNT_PANELS[panel] : 'You'} description={!panel ? 'Your details, your family, your place in Vital.' : undefined} />
    <View style={a.stack}><CommunityNotice message={notice} />
      {!panel ? <>
        <Group title="Profile"><AccountLoadState state={profile} />{!profile.loading && !profile.error && identity}{link('profile')}{link('identity')}</Group>
        <View style={a.grid}><View style={[a.column, isTablet && a.wideColumn]}>
          <Group title="Your family">{link('family', 'Family members & ages', 'Keep your private family details in one place.')}</Group>
          <Group title="Preferences">{link('preferences', 'Activities, notifications & Vital news')}</Group>
          <Group title="Vital membership">{link('membership', 'Manage Vital membership')}</Group>
          <Group title="Community">{link('identity')}{link('community', 'Rules, starter conversations & reporting')}</Group>
          <Group title="Privacy & safety">{link('privacySafety', 'Privacy & safety', 'Manage Community blocks and review how your information is used.')}</Group>
        </View><View style={[a.column, isTablet && a.wideColumn]}>
          <Group title="Help & feedback">{link('suggest', 'Suggest an activity', 'Share something your family genuinely enjoys.')}{link('feedback', 'Send feedback', 'Comments, suggestions or product feedback.')}{link('help')}{link('problem')}</Group>
          <Group title="About & legal">{link('about')}{link('privacy')}{link('terms')}<Text style={a.meta}>Version {Constants.expoConfig?.version ?? 'unavailable'}</Text></Group>
          <Group title="Account"><CommunityNotice message={error} error /><Button label="Sign out" icon="log-out-outline" variant="secondary" loading={busy} onPress={() => void leave()} />{link('deletion')}</Group>
        </View></View>
      </> : panel === 'profile' || panel === 'identity' ? <>
        <AccountLoadState state={profile} />{!profile.loading && !profile.error && (profile.value ? panel === 'profile' ?
          <EditProfile id={id} profile={profile.value}
            onSaved={saved => { profile.commit(saved); navigate(null); setNotice('Your profile has been saved.'); }}
            onPhotoChanged={profile.commit} /> :
          <Group title="Your Community identity">{identity}<Text style={a.meta}>This is the name, image and introduction members see beside your conversations.</Text>{link('profile')}<AccountLink label="Open Community" onPress={openCommunity} /></Group> : <><Text style={a.body}>Your profile is unavailable.</Text><Button label="Try again" onPress={profile.reload} /></>)}
      </> : panel === 'family' ? <AccountFamily api={api} id={id} /> : panel === 'preferences' ? <AccountPreferences api={api} id={id} /> :
        panel === 'membership' ? <MembershipPanel /> : panel === 'community' ? <CommunityPanel community={community} navigate={navigate} openCommunity={openCommunity} /> :
        panel === 'privacySafety' ? <PrivacySafetyPanel navigate={navigate} /> : panel === 'blocked' ? <Group title="Blocked members"><BlockedMembersContent api={community} onChanged={() => setNotice('This member is no longer blocked.')} /></Group> :
        panel === 'suggest' ? <ActivitySubmissionForm api={api} id={id} /> : panel === 'feedback' ? <FeedbackSubmissionForm api={api} id={id} /> :
        panel === 'problem' ? <FeedbackSubmissionForm api={api} id={id} initialType="bug" /> :
        panel === 'deletion' ? <DeleteAccountPanel api={api} id={id} navigate={navigate} signOut={signOut} /> : <InformationPanel key={panel} panel={panel} navigate={navigate} />}
    </View>
  </Screen>;
}

const PAYWALL_PANELS = new Set<AccountPanel>(['membership', 'help', 'suggest', 'feedback', 'problem', 'privacy', 'terms', 'deletion']);
export function MembershipAccessScreen({ id, email, panel, api, navigate, signOut }: Pick<Props, 'id' | 'email' | 'panel' | 'api' | 'navigate' | 'signOut'>) {
  const destination = panel && PAYWALL_PANELS.has(panel) ? panel : 'membership';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function leave() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await signOut(); }
    catch (cause) { setError(customerSafeErrorMessage('Sign out failed', cause, "We couldn't sign you out just now. Please try again.")); }
    finally { setBusy(false); }
  }
  const link = (next: AccountPanel, label: string = ACCOUNT_PANELS[next]) =>
    <AccountLink label={label} onPress={() => navigate(next)} />;
  return <Screen key={destination} keyboardAware={destination === 'suggest' || destination === 'feedback' || destination === 'problem' || destination === 'deletion'}>
    {destination !== 'membership' && <AccountLink direction="back" label="Back to membership" onPress={() => navigate('membership')} />}
    <ScreenHeader eyebrow="Your Vital" title={ACCOUNT_PANELS[destination]}
      description={destination === 'membership' ? `Signed in as ${email ?? 'a Vital member'}` : undefined} />
    <View style={a.stack}>
      {destination === 'membership' ? <><MembershipPanel />
        <Group title="Account, help & legal">
          {link('help', 'Help & contact')}{link('privacy')}{link('terms')}{link('deletion')}
          <CommunityNotice message={error} error />
          <Button label="Sign out" icon="log-out-outline" variant="secondary" loading={busy} onPress={() => void leave()} />
        </Group>
      </> : destination === 'deletion' ? <DeleteAccountPanel api={api} id={id} navigate={navigate} signOut={signOut} />
        : destination === 'suggest' ? <ActivitySubmissionForm api={api} id={id} />
        : destination === 'feedback' ? <FeedbackSubmissionForm api={api} id={id} />
        : destination === 'problem' ? <FeedbackSubmissionForm api={api} id={id} initialType="bug" />
        : <InformationPanel panel={destination} navigate={navigate} />}
    </View>
  </Screen>;
}
