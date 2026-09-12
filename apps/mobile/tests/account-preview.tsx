// Isolated browser QA entry only. Never imported by the production router.
// All account reads/writes below are in memory, with no real member session.
import '../src/global.css';
import React, { useState } from 'react';
import { registerRootComponent } from 'expo';
import { ExpoRoot, Stack } from 'expo-router';
import { Text } from 'react-native';
import { useFonts } from 'expo-font';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AuthContext, type AuthContextValue } from '../src/features/auth/auth-context';
import YouScreen from '../src/app/(tabs)/you';
import TabLayout from '../src/app/(tabs)/_layout';
import { requireSupabase } from '../src/lib/supabase';
import { NOTIFICATION_LABELS } from '../src/features/account/account-model';

const mode = new URLSearchParams(window.location.search).get('state');
let failed = false;
const rows: Record<string, unknown> = {
  profiles: { id: 'qa-member', display_name: 'QA Member', bio: mode === 'empty' ? null : 'A local preview introduction.', avatar_url: null },
  families: mode === 'empty' ? [] : [{ id: 'qa-family', name: 'QA Family', members: [{ id: 'qa-child', display_name: 'QA Child', relationship: 'Child', age_band: '5–7', age_years: null, interests: ['Drawing'] }] }],
  user_preferences: { preferred_sections: ['Vital Kids'], interests: ['Walking'] },
  notification_preferences: Object.fromEntries(Object.keys(NOTIFICATION_LABELS).map(key => [key, true])),
  newsletter_preferences: { subscribed: true },
  subscription_entitlements: mode === 'empty' ? [] : [{ status: 'active', expires_at: null, started_at: null, auto_renewing: false }],
};
const client = requireSupabase();
client.auth.getSession = async () => ({ data: { session: { user: { id: 'qa-member' } } }, error: null }) as never;
client.from = ((table: string) => {
  let changes: object | undefined;
  const builder = {
    select() { return builder; }, eq() { return builder; }, order() { return builder; },
    update(value: object) { changes = value; return builder; },
    single() { return finish(); }, maybeSingle() { return finish(); },
    then(resolve: (value: unknown) => void, reject: (error: unknown) => void) { return finish().then(resolve, reject); },
  };
  async function finish() {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!(table in rows)) throw new Error(`Unexpected account QA table: ${table}`);
    if (!failed && ((mode === 'error' && table === 'families') || (mode === 'write-error' && changes))) {
      failed = true; return { data: null, error: { message: 'TEST raw JWT/database detail' } };
    }
    if (changes) rows[table] = { ...(rows[table] as object), ...changes };
    return { data: rows[table], error: null };
  }
  return builder;
}) as unknown as typeof client.from;
client.rpc = (async (name: string) => {
  if (name !== 'community_access') throw new Error('Unexpected account QA RPC');
  return { data: { acceptedRules: true, restricted: false, canParticipate: true, isModerator: false,
    rules: { version: 2, title: 'Community Rules', content_markdown: 'TEST ONLY: current rules are supplied by the existing Community service.' } }, error: null };
}) as unknown as typeof client.rpc;

function Layout() {
  const [signedOut, setSignedOut] = useState(false);
  if (signedOut) return <Text>QA sign-out completed</Text>;
  return <AuthContext.Provider value={{ user: { id: 'qa-member', email: 'qa@example.invalid' }, isLoading: false, signOut: async () => { setSignedOut(true); } } as AuthContextValue}>
    <Stack screenOptions={{ headerShown: false }} />
  </AuthContext.Provider>;
}
const modules: Record<string, { default: React.ComponentType }> = {
  './_layout.tsx': { default: Layout }, './(tabs)/_layout.tsx': { default: TabLayout }, './(tabs)/you.tsx': { default: YouScreen },
};
for (const route of ['index', 'discover', 'community', 'saved', 'vital-mums', 'vital-kids', 'vital-together', 'vital-life', 'vital-food']) {
  modules[`./(tabs)/${route}.tsx`] = { default: () => <Text>QA destination: {route}</Text> };
}
const context = Object.assign((key: string) => modules[key], { keys: () => Object.keys(modules), resolve: (key: string) => key, id: 'account-qa' });
function Preview() {
  const [fonts] = useFonts({ DMSerifDisplay_400Regular, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  return fonts ? <ExpoRoot context={context} location={new URL(`/you${window.location.search}`, window.location.origin)} /> : null;
}
registerRootComponent(Preview);
