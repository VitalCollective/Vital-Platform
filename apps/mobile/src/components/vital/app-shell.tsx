import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, layout, radii, spacing, typography } from '@/theme/tokens';
import { useLanguage } from '@/features/localization/language-context';

type ShellPath =
  | '/'
  | '/vital-mums'
  | '/vital-kids'
  | '/vital-together'
  | '/vital-life'
  | '/vital-food'
  | '/discover'
  | '/community'
  | '/saved'
  | '/you';

type NavigationItem = {
  href: ShellPath;
  label: string;
};

const primaryNavigation: NavigationItem[] = [
  { href: '/', label: 'Home' },
  { href: '/vital-mums', label: 'Vital Mums' },
  { href: '/vital-kids', label: 'Vital Kids' },
  { href: '/vital-together', label: 'Vital Together' },
  { href: '/vital-life', label: 'Vital Life' },
  { href: '/vital-food', label: 'Vital Food' },
];

function pathIsActive(pathname: string, href: ShellPath) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function BrandLockup() {
  const [focused, setFocused] = useState(false);
  const { t } = useLanguage();

  return (
    <Link href="/" asChild>
      <Pressable
        accessibilityLabel={t('Vital Collective home')}
        accessibilityRole="link"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          styles.brandLink,
          focused && styles.focusedControl,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.brandVital}>VITAL</Text>
        <Text style={styles.brandCollective}>Collective</Text>
      </Pressable>
    </Link>
  );
}

function NavigationLink({
  item,
  onNavigate,
  menu = false,
}: {
  item: NavigationItem;
  onNavigate?: () => void;
  menu?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const active = pathIsActive(pathname, item.href);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <Link href={item.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        aria-current={active ? 'page' : undefined}
        onPress={onNavigate}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={StyleSheet.flatten([
          menu ? styles.menuLink : styles.desktopNavLink,
          hovered && !menu && styles.desktopNavLinkHovered,
          active && (menu ? styles.menuLinkActive : styles.desktopNavLinkActive),
          focused && styles.focusedControl,
          pressed && styles.pressed,
        ])}>
        <Text
          style={[
            menu ? styles.menuLinkText : styles.desktopNavText,
            hovered && !menu && styles.desktopNavTextHovered,
            active && styles.navigationTextActive,
          ]}>
          {t(item.label)}
        </Text>
        {menu ? (
          <Ionicons
            name={active ? 'checkmark' : 'chevron-forward'}
            size={20}
            color={active ? colors.plum : colors.inkSubtle}
          />
        ) : null}
      </Pressable>
    </Link>
  );
}

function UtilityLink({
  href,
  icon,
  label,
  showLabel = false,
  onNavigate,
}: {
  href: ShellPath;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  showLabel?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const active = pathIsActive(pathname, href);
  const [focused, setFocused] = useState(false);

  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityLabel={t(label)}
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        onPress={onNavigate}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          styles.utilityLink,
          showLabel && styles.utilityLinkWithLabel,
          active && styles.utilityLinkActive,
          focused && styles.focusedControl,
          pressed && styles.pressed,
        ]}>
        <Ionicons name={icon} size={21} color={active ? colors.plum : colors.brand} />
        {showLabel ? <Text style={styles.utilityLabel}>{t(label)}</Text> : null}
      </Pressable>
    </Link>
  );
}

function DesktopPrimaryNavigation({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  return (
    <View
      accessibilityLabel={t('Primary navigation')}
      role="navigation"
      style={[styles.desktopNavigation, compact && styles.desktopNavigationCompact]}>
      {primaryNavigation.map((item) => (
        <NavigationLink key={item.href} item={item} />
      ))}
    </View>
  );
}

function DesktopUtilities() {
  return (
    <View style={styles.desktopUtilities}>
      <UtilityLink href="/discover" icon="search-outline" label="Find something" showLabel />
      <UtilityLink href="/community" icon="people-outline" label="Community" />
      <UtilityLink href="/saved" icon="bookmark-outline" label="Saved" />
      <UtilityLink href="/you" icon="person-outline" label="Your account" />
    </View>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={open}>
      <View style={styles.menuOverlay}>
        <Pressable
          accessibilityLabel={t('Close navigation menu')}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.menuBackdrop}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.menuPanel,
            { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg },
          ]}>
          <View style={styles.menuHeader}>
            <View>
              <Text style={styles.menuEyebrow}>Vital Collective</Text>
              <Text style={styles.menuTitle}>{t('Explore Vital')}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('Close menu')}
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.menuClose, pressed && styles.pressed]}>
              <Ionicons name="close" size={25} color={colors.brand} />
            </Pressable>
          </View>

          <View accessibilityLabel={t('Primary navigation')} role="navigation" style={styles.menuLinks}>
            {primaryNavigation.map((item) => (
              <NavigationLink key={item.href} item={item} menu onNavigate={onClose} />
            ))}
          </View>

          <View style={styles.menuUtilities}>
            <UtilityLink href="/discover" icon="search-outline" label="Find something" showLabel onNavigate={onClose} />
            <UtilityLink href="/you" icon="person-outline" label="Your account" showLabel onNavigate={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const { horizontalPadding, isDesktop, width } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();
  const compactDesktop = isDesktop && width < 1200;

  useEffect(() => {
    if (isDesktop) setMenuOpen(false);
  }, [isDesktop]);

  return (
    <View style={styles.shell}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View
          style={[
            styles.headerInner,
            !isDesktop && styles.headerInnerMobile,
            compactDesktop && styles.headerInnerCompact,
            { paddingHorizontal: horizontalPadding },
          ]}>
          <BrandLockup />

          {isDesktop ? (
            compactDesktop ? (
              <View style={styles.compactDesktopArea}>
                <DesktopUtilities />
                <DesktopPrimaryNavigation compact />
              </View>
            ) : (
              <>
                <DesktopPrimaryNavigation />
                <DesktopUtilities />
              </>
            )
          ) : (
            <View style={styles.mobileUtilities}>
              <UtilityLink href="/discover" icon="search-outline" label="Find something" />
              <Pressable
                accessibilityLabel={t('Open navigation menu')}
                accessibilityRole="button"
                accessibilityState={{ expanded: menuOpen }}
                onPress={() => setMenuOpen(true)}
                style={({ pressed }) => [styles.utilityLink, pressed && styles.pressed]}>
                <Ionicons name="menu" size={24} color={colors.brand} />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <View style={styles.content}>{children}</View>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.canvas },
  header: {
    zIndex: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.canvas,
  },
  headerInner: {
    width: '100%',
    maxWidth: layout.headerMaxWidth,
    minHeight: layout.headerHeight,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerInnerMobile: { minHeight: 56 },
  headerInnerCompact: { minHeight: 112 },
  content: { flex: 1, backgroundColor: colors.canvas },
  brandLink: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
  },
  brandVital: {
    color: colors.plum,
    fontFamily: typography.bodyBoldFamily,
    fontSize: 10,
    letterSpacing: 2.2,
    lineHeight: 13,
  },
  brandCollective: {
    color: colors.brand,
    fontFamily: typography.headingFamily,
    fontSize: 22,
    lineHeight: 24,
  },
  desktopNavigation: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  compactDesktopArea: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
  },
  desktopNavigationCompact: {
    width: '100%',
    flex: 0,
    justifyContent: 'center',
  },
  desktopNavLink: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    borderRadius: radii.sm,
  },
  desktopNavLinkHovered: { borderBottomColor: colors.borderStrong },
  desktopNavLinkActive: { borderBottomColor: colors.plum },
  desktopNavText: {
    color: colors.inkMuted,
    fontFamily: typography.bodyMediumFamily,
    fontSize: 13,
  },
  desktopNavTextHovered: { color: colors.brand },
  navigationTextActive: { color: colors.plum, fontFamily: typography.bodySemiboldFamily },
  desktopUtilities: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  mobileUtilities: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  utilityLink: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  utilityLinkWithLabel: { paddingHorizontal: spacing.md, backgroundColor: colors.brandSoft },
  utilityLinkActive: { backgroundColor: colors.plumSoft },
  utilityLabel: {
    color: colors.brand,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
  },
  focusedControl: { borderColor: colors.focus, borderWidth: 2 },
  pressed: { opacity: 0.7 },
  menuOverlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  menuBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(37, 54, 37, 0.34)',
  },
  menuPanel: {
    width: '88%',
    maxWidth: 380,
    minHeight: '100%',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.canvas,
  },
  menuHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  menuEyebrow: {
    color: colors.plum,
    fontFamily: typography.bodyBoldFamily,
    fontSize: typography.eyebrow,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  menuTitle: {
    color: colors.brand,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
  },
  menuClose: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
  },
  menuLinks: { gap: spacing.xs },
  menuLink: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  menuLinkActive: { backgroundColor: colors.plumSoft },
  menuLinkText: {
    color: colors.brand,
    fontFamily: typography.bodyMediumFamily,
    fontSize: typography.body,
  },
  menuUtilities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
