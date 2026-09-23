import { StyleSheet, Text, View } from 'react-native';
import { FilterChip } from '@/components/vital/filter-chip';
import { colors, spacing, typography } from '@/theme/tokens';
import { useLanguage } from './language-context';
import type { AppLanguage } from './localization-model';

export function LanguageSelector({ compact = false, onChange }: {
  compact?: boolean;
  onChange?: (language: AppLanguage) => void | Promise<void>;
}) {
  const { language, setLanguage, t } = useLanguage();
  const choose = (next: AppLanguage) => { void setLanguage(next).then(() => onChange?.(next)); };
  return <View style={[styles.container, compact && styles.compact]} accessibilityLabel={t('Language')}>
    {!compact && <Text style={styles.label}>{t('Language')}</Text>}
    <View style={styles.row}>
      <FilterChip label="English" selected={language === 'en'} onPress={() => choose('en')} />
      <FilterChip label="Cymraeg" selected={language === 'cy'} onPress={() => choose('cy')} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs }, compact: { alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  label: { color: colors.ink, fontFamily: typography.bodySemiboldFamily, fontSize: typography.small },
});
