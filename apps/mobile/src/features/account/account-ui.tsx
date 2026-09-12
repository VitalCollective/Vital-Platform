import { useCallback, useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StatePanel } from '@/components/vital/state-panel';
import { customerSafeErrorMessage } from '@/lib/errors';
import { colors, radii, spacing, typography } from '@/theme/tokens';

export function useAccountLoad<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    const request = ++generation.current;
    const current = () => active && request === generation.current;
    setLoading(true); setError(null);
    void load().then(data => { if (current()) setValue(data); }).catch(cause => {
      if (current()) setError(customerSafeErrorMessage('Load account information', cause, "We couldn't load this just now."));
    }).finally(() => { if (current()) setLoading(false); });
    return () => { active = false; };
  }, [load, revision]));
  const reload = useCallback(() => setRevision(n => n + 1), []);
  const commit = useCallback((data: T) => {
    // An acknowledged save supersedes any older in-flight read.
    generation.current += 1;
    setValue(data); setError(null); setLoading(false);
  }, []);
  return { value, error, loading, reload, commit };
}
export function AccountLoadState({ state }: { state: { error: string | null; loading: boolean; reload: () => void } }) {
  return state.loading ? <StatePanel kind="loading" title="Loading your details" message="One moment." /> : state.error ?
    <StatePanel kind="error" title={state.error} message="Please try again." onRetry={state.reload} /> : null;
}
export function Group({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={a.group}><Text accessibilityRole="header" style={a.title}>{title}</Text>{children}</View>;
}
export function AccountLink({ label, detail, onPress, direction = 'forward' }: { label: string; detail?: string; onPress: () => void; direction?: 'forward' | 'back' }) {
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [a.link, direction === 'back' && { alignSelf: 'flex-start' }, focused && a.focused, pressed && { backgroundColor: colors.brandSoft }]}>
    {direction === 'back' && <Ionicons name="chevron-back" size={18} color={colors.plum} />}
    <View style={direction === 'forward' ? a.grow : undefined}><Text style={a.label}>{label}</Text>{detail && <Text style={a.meta}>{detail}</Text>}</View>
    {direction === 'forward' && <Ionicons name="chevron-forward" size={18} color={colors.plum} />}
  </Pressable>;
}
export const a = StyleSheet.create({
  stack: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' },
  column: { width: '100%', gap: spacing.md },
  wideColumn: { flex: 1, minWidth: 0 },
  group: { padding: spacing.md, gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  title: { fontFamily: typography.headingFamily, color: colors.ink, fontSize: 24, lineHeight: 31 },
  body: { fontFamily: typography.bodyFamily, color: colors.ink, fontSize: 16, lineHeight: 25 },
  meta: { fontFamily: typography.bodyFamily, color: colors.inkMuted, fontSize: 14, lineHeight: 22, flexShrink: 1 },
  label: { fontFamily: typography.bodySemiboldFamily, color: colors.ink, fontSize: 15, lineHeight: 23 },
  link: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.sm, borderWidth: 2, borderColor: 'transparent' },
  focused: { borderColor: colors.focus },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  rule: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border, gap: spacing.xxs },
});
