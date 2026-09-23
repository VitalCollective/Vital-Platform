import { useEffect, useMemo, useReducer } from 'react';
import { Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/vital/button';
import { useLanguage } from '@/features/localization/language-context';
import { reportTechnicalError } from '@/lib/errors';
import { requireSupabase } from '@/lib/supabase';
import { colors, layout, radii, shadows, spacing, typography } from '@/theme/tokens';
import { createBillingApi } from './billing-api';
import { useBilling } from './billing-context';
import {
  EMPTY_MEMBERSHIP_WELCOME,
  membershipWelcomeReducer,
} from './membership-welcome-state';

export function MembershipWelcomeModal() {
  const router = useRouter();
  const billing = useBilling();
  const { t } = useLanguage();
  const api = useMemo(() => createBillingApi(requireSupabase()), []);
  const [state, dispatch] = useReducer(membershipWelcomeReducer, EMPTY_MEMBERSHIP_WELCOME);

  useEffect(() => {
    dispatch({ type: 'session', userId: billing.userId });
  }, [billing.userId]);

  useEffect(() => {
    const userId = billing.userId;
    if (!userId || billing.isResolving || !billing.hasAccess
      || state.userId !== userId || state.checked || state.checking) return;
    dispatch({ type: 'checking' });
    void api.claimWelcome(userId)
      .then((claimed) => dispatch({ type: 'resolved', userId, claimed }))
      .catch((cause) => {
        reportTechnicalError('Claim membership welcome', cause);
        dispatch({ type: 'resolved', userId, claimed: false });
      });
  }, [api, billing.hasAccess, billing.isResolving, billing.userId, state]);

  function dismiss() {
    dispatch({ type: 'dismissed' });
  }

  function sendFeedback() {
    dismiss();
    router.push({ pathname: '/you', params: { panel: 'feedback' } });
  }

  return <Modal
    visible={state.visible && billing.hasAccess}
    transparent
    animationType="fade"
    statusBarTranslucent
    onRequestClose={dismiss}>
    <SafeAreaView style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        <View accessibilityViewIsModal style={styles.card}>
          <Image
            accessibilityIgnoresInvertColors
            source={require('../../../assets/brand/vital-mark.png')}
            style={styles.mark}
          />
          <Text accessibilityRole="header" style={styles.title}>{t('Welcome to Vital Collective')}</Text>
          <Text style={styles.lead}>{t('Your membership is now active.')}</Text>
          <Text style={styles.body}>{t('We’re a family-run UK app, and we’re really pleased to have you with us.')}</Text>
          <Text style={styles.body}>{t('Everything in Vital is designed to help families find practical ideas, make time together and discover useful things to do in everyday life.')}</Text>
          <Text style={styles.body}>{t('We love hearing from members, so if you have feedback, suggestions or activity ideas, please tell us — it helps us shape Vital for real families.')}</Text>
          <Text style={styles.offer}>{t('Suggest an activity and, if we include it, we’ll give you a month free.')}</Text>
          <View style={styles.actions}>
            <Button label={t('Start exploring')} onPress={dismiss} />
            <Button label={t('Send feedback')} variant="secondary" onPress={sendFeedback} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(37, 54, 37, 0.48)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.canvas,
    ...shadows.card,
  },
  mark: {
    width: 62,
    height: 62,
    resizeMode: 'contain',
    alignSelf: 'center',
  },
  title: {
    color: colors.ink,
    fontFamily: typography.headingFamily,
    fontSize: typography.heading,
    lineHeight: 32,
    textAlign: 'center',
  },
  lead: {
    color: colors.plum,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.body,
    lineHeight: 24,
    textAlign: 'center',
  },
  body: {
    color: colors.inkMuted,
    fontFamily: typography.bodyFamily,
    fontSize: typography.body,
    lineHeight: 24,
  },
  offer: {
    color: colors.ink,
    fontFamily: typography.bodySemiboldFamily,
    fontSize: typography.small,
    lineHeight: 21,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.plumSoft,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
