import { useState, type PropsWithChildren, type Ref } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, layout, radii, spacing, typography } from '@/theme/tokens';
import { ProfileAvatar } from '@/components/vital/profile-avatar';

export function CommunityField({ label, inputRef, ...props }: TextInputProps & { label: string; inputRef?: Ref<TextInput> }) {
  const [focused, setFocused] = useState(false);
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <TextInput {...props} ref={inputRef} accessibilityLabel={label} placeholderTextColor={colors.inkSubtle}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={[s.input, props.multiline && s.multiline, focused && s.focused, props.style]} />
  </View>;
}
export function CommunityModal({ title, onClose, children, busy = false }: PropsWithChildren<{ title: string; onClose: () => void; busy?: boolean }>) {
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={s.modal} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.modalHeader}>
          <Text accessibilityRole="header" style={s.heading}>{title}</Text>
          <CommunityAction label="Close" icon="close" disabled={busy} onPress={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={s.modalBody}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
export function CommunityAction({ label, onPress, icon, selected = false, disabled = false }: {
  label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; selected?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.action, selected && s.actionSelected, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    {icon && <Ionicons name={icon} color={colors.plum} size={19} />}
    <Text style={s.actionText}>{label}</Text>
  </Pressable>;
}
export function CommunityNotice({ message, error = false }: { message: string | null; error?: boolean }) {
  if (!message) return null;
  return <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[s.notice, error && s.error]}>{message}</Text>;
}
export function CommunityAuthor({ name, seeded, createdAt, imageUrl, bio }: { name: string; seeded: boolean; createdAt: string; imageUrl?: string | null; bio?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const author = <View style={s.author}>
    <ProfileAvatar name={name} imageUrl={imageUrl} />
    <View style={s.flex}>
      <View style={s.row}><Text style={s.authorName}>{name}</Text>{!!bio && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.plum} />}</View>
      <Text style={s.meta}>{new Date(createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{seeded ? ' · Vital starter' : ''}</Text>
    </View>
  </View>;
  if (!bio) return author;
  return <View style={{ gap: spacing.xs }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`About ${name}`} accessibilityState={{ expanded }} aria-expanded={expanded}
      onPress={() => setExpanded(value => !value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ minHeight: layout.touchTarget, justifyContent: 'center', borderRadius: radii.sm, borderWidth: 2, borderColor: focused ? colors.focus : 'transparent' }}>
      {author}
    </Pressable>
    {expanded && <Text selectable style={s.body}>{bio}</Text>}
  </View>;
}
export const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  field: { gap: spacing.xs, minWidth: 0 },
  label: { color: colors.ink, fontFamily: typography.bodySemiboldFamily, fontSize: typography.small },
  input: { minHeight: layout.touchTarget, width: '100%', minWidth: 0, borderColor: colors.borderStrong,
    borderWidth: 1, borderRadius: radii.md, padding: spacing.sm, backgroundColor: colors.surface,
    color: colors.ink, fontFamily: typography.bodyFamily, fontSize: 16, lineHeight: 24 },
  multiline: { minHeight: 152, textAlignVertical: 'top' },
  focused: { borderColor: colors.focus, borderWidth: 2 },
  modal: { flex: 1, backgroundColor: colors.canvas },
  modalHeader: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 1 },
  modalBody: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  heading: { flex: 1, minWidth: 0, color: colors.ink, fontFamily: typography.headingFamily, fontSize: typography.heading, lineHeight: 33 },
  title: { color: colors.ink, fontFamily: typography.headingFamily, fontSize: 25, lineHeight: 32 },
  body: { color: colors.ink, fontFamily: typography.bodyFamily, fontSize: typography.body, lineHeight: 25, flexShrink: 1, minWidth: 0 },
  meta: { color: colors.inkMuted, fontFamily: typography.bodyFamily, fontSize: typography.small, lineHeight: 21, flexShrink: 1 },
  card: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, padding: spacing.md, minWidth: 0 },
  action: { minHeight: layout.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: radii.md, maxWidth: '100%' },
  actionSelected: { backgroundColor: colors.plumSoft },
  actionText: { color: colors.plum, fontFamily: typography.bodySemiboldFamily, fontSize: typography.small, flexShrink: 1, lineHeight: 21 },
  notice: { color: colors.inkMuted, backgroundColor: colors.brandSoft, padding: spacing.md, borderRadius: radii.md, fontFamily: typography.bodyFamily, fontSize: typography.small, lineHeight: 22 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  authorName: { color: colors.ink, fontFamily: typography.bodySemiboldFamily, fontSize: typography.small, lineHeight: 21, flexShrink: 1 },
  eyebrow: { color: colors.plum, fontFamily: typography.bodyBoldFamily, fontSize: typography.eyebrow, textTransform: 'uppercase', letterSpacing: 1 },
});
