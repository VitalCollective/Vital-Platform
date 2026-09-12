// Isolated QA entry, never a production route. The real detail screen + save
// control run against local stand-ins only; no connected Supabase writes.
import '../src/global.css';
import React from 'react';
import { registerRootComponent } from 'expo';
import { ExpoRoot, Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { AuthContext, type AuthContextValue } from '../src/features/auth/auth-context';
import { Button } from '../src/components/vital/button';
import ActivityDetailScreen from '../src/app/activity/[id]';
import SavedScreen from '../src/app/(tabs)/saved';
import TabLayout from '../src/app/(tabs)/_layout';
import { requireSupabase } from '../src/lib/supabase';

const mode = new URLSearchParams(window.location.search).get('state');
const listMode = mode?.startsWith('list');
let failRead = mode === 'read-error' || mode === 'list-error', failWrite = mode === 'write-error';
const saved = new Set<string>();
const sections = ['Vital Mums', 'Vital Kids', 'Vital Together', 'Vital Life', 'Vital Food'];
if (listMode && mode !== 'list-empty') {
  for (let i = 0; i < (mode === 'list-many' ? 25 : 3); i++) saved.add(`TEST-${i}`);
}
function activity(id: string) {
  return {
    id, title: `TEST: An activity to try together ${id.split('-')[1]}`, section: sections[Number(id.split('-')[1]) % sections.length || 0],
    summary: 'Isolated layout check of the approved activity detail and its new Save control.',
    instructions: 'TEST ONLY. Use the Save button, reopen this activity and check the saved state.',
    duration: '15 minutes', indoor: true, outdoor: false,
  };
}
const client = requireSupabase();
client.auth.getSession = async () => ({ data: { session: { user: { id: 'qa-member' } } }, error: null }) as never;
// No SDK request builder survives this replacement. All query results are local.
client.from = ((table: string) => {
  const filters: Record<string, string> = {};
  let action = 'read';
  let selection = '', from = 0, to = 99;
  const builder = {
    select(fields: string) { selection = fields; return builder; },
    eq(key: string, value: string) { filters[key] = value; return builder; },
    order() { return builder; },
    range(start: number, end: number) { from = start; to = end; return builder; },
    upsert(row: Record<string, string>) { Object.assign(filters, row); action = 'save'; return builder; },
    delete() { action = 'delete'; return builder; },
    maybeSingle() { return finish(); }, single() { return finish(); },
    then(resolve: (value: unknown) => void, reject: (error: unknown) => void) { return finish().then(resolve, reject); },
  };
  async function finish() {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (table === 'activities') return { data: activity(filters.id), error: null };
    if (table === 'activity_resources') return { data: [], error: null };
    if (table !== 'saved_activities') throw new Error('Unexpected QA table');
    if ((action === 'read' && failRead) || (action !== 'read' && failWrite)) {
      failRead = false; failWrite = false;
      return { data: null, error: { code: '42501', message: 'TEST raw database/JWT error must stay out of customer UI' } };
    }
    if (action === 'save') saved.add(filters.activity_id);
    if (action === 'delete') saved.delete(filters.activity_id);
    if (selection.startsWith('activity:')) return { data: [...saved].slice(from, to + 1).map(id => ({ activity: activity(id) })), error: null };
    return { data: saved.has(filters.activity_id) ? { activity_id: filters.activity_id } : null, error: null };
  }
  return builder;
}) as unknown as typeof client.from;

function Layout() {
  const router = useRouter();
  return <AuthContext.Provider value={{ user: { id: 'qa-member' }, isLoading: false } as AuthContextValue}>
    <View style={{ flex: 1 }}>
      <Text style={{ padding: 8 }}>Isolated save QA · local fixtures only</Text>
      {!listMode && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {sections.map((section, i) => <Button key={section} label={`QA ${section.slice(6)}`} variant="secondary" onPress={() => router.push(`/activity/TEST-${i}`)} />)}
      </View>}
      <Stack screenOptions={{ headerTintColor: '#344834', headerStyle: { backgroundColor: '#FDF5E7' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </View>
  </AuthContext.Provider>;
}
const modules: Record<string, { default: React.ComponentType }> = {
  './_layout.tsx': { default: Layout }, './activity/[id].tsx': { default: ActivityDetailScreen },
  './(tabs)/_layout.tsx': { default: TabLayout }, './(tabs)/saved.tsx': { default: SavedScreen },
};
for (const route of ['index', 'discover', 'community', 'you', 'vital-mums', 'vital-kids', 'vital-together', 'vital-life', 'vital-food']) {
  modules[`./(tabs)/${route}.tsx`] = { default: () => <Text>QA destination: {route}</Text> };
}
const context = Object.assign((key: string) => modules[key], {
  keys: () => Object.keys(modules), resolve: (key: string) => key, id: 'saved-qa',
});
function Preview() {
  const [fonts] = useFonts({ DMSerifDisplay_400Regular, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  return fonts ? <ExpoRoot context={context} location={new URL(listMode ? '/saved' : '/activity/TEST-0', window.location.origin)} /> : null;
}
registerRootComponent(Preview);
