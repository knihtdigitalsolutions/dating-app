import { useState } from 'react'
import {
  View, Text, Pressable, ScrollView,
  ActivityIndicator, Alert, Linking, StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PLAN_PRICING, PLAN_FEATURES } from '@dating/types'
import { Colors, shadow, ripple, styles as shared } from '../lib/platform'

type Plan  = 'GOLD' | 'PLATINUM'
type Cycle = 'monthly' | 'quarterly' | 'annual'

const PLAN_ACCENT: Record<Plan, string> = {
  GOLD:     Colors.gold500,
  PLATINUM: Colors.stone300,
}

const CYCLES: { key: Cycle; label: string; save?: string }[] = [
  { key: 'monthly',   label: 'Monthly' },
  { key: 'quarterly', label: '3 Months', save: 'Save 14%' },
  { key: 'annual',    label: 'Annual',   save: 'Save 33%' },
]

export default function PaymentsScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const [plan, setPlan]   = useState<Plan>('GOLD')
  const [cycle, setCycle] = useState<Cycle>('monthly')

  const subscribeMutation = useMutation({
    mutationFn: async () =>
      (await api.post('/payments/subscribe', { plan, billingCycle: cycle })).data.data,
    onSuccess: data => {
      if (data.redirectUrl) {
        Linking.openURL(data.redirectUrl)
        Alert.alert(
          'Complete Payment',
          'Finish your payment in the browser, then return to Dating App.',
          [{ text: 'OK', onPress: () => router.back() }]
        )
      }
    },
    onError: (err: any) =>
      Alert.alert('Error', err.response?.data?.error || 'Payment failed. Try again.'),
  })

  const price    = PLAN_PRICING[plan][cycle]
  const features = PLAN_FEATURES[plan]
  const accent   = PLAN_ACCENT[plan]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.surfaceBase }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          android_ripple={ripple(Colors.borderSubtle, true)}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Upgrade</Text>
      </View>

      <View style={styles.body}>

        {/* Plan selector */}
        <View style={styles.planRow}>
          {(['GOLD', 'PLATINUM'] as Plan[]).map(p => {
            const active = plan === p
            const col    = PLAN_ACCENT[p]
            return (
              <Pressable
                key={p}
                onPress={() => setPlan(p)}
                android_ripple={ripple(col + '22', false)}
                style={[
                  styles.planCard,
                  {
                    borderColor: active ? col : Colors.borderSubtle,
                    backgroundColor: active ? col + '12' : Colors.surfaceRaised,
                  },
                  active && shadow.md,
                ]}
              >
                <Text style={{ fontSize: 26, marginBottom: 6 }}>
                  {p === 'GOLD' ? '🥇' : '💎'}
                </Text>
                <Text style={styles.planName}>{p}</Text>
                <Text style={[styles.planPrice, { color: col }]}>
                  From UGX {PLAN_PRICING[p].monthly.toLocaleString()}/mo
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Billing cycle */}
        <View style={styles.cycleRow}>
          {CYCLES.map(c => {
            const active = cycle === c.key
            return (
              <Pressable
                key={c.key}
                onPress={() => setCycle(c.key)}
                android_ripple={ripple(Colors.borderSubtle, false)}
                style={[
                  styles.cycleBtn,
                  {
                    borderColor: active ? Colors.gold500 : Colors.borderSubtle,
                    backgroundColor: active ? 'rgba(232,180,34,0.10)' : Colors.surfaceRaised,
                  },
                ]}
              >
                <Text style={[styles.cycleBtnLabel, { color: active ? Colors.gold500 : Colors.textPrimary }]}>
                  {c.label}
                </Text>
                {c.save && (
                  <Text style={styles.cycleSave}>{c.save}</Text>
                )}
              </Pressable>
            )
          })}
        </View>

        {/* Features */}
        <View style={[shared.card, styles.featuresCard]}>
          <Text style={styles.overline}>WHAT YOU GET</Text>
          {[
            { label: `${features.dailyLikes === -1 ? 'Unlimited' : features.dailyLikes} daily likes`, ok: true },
            { label: `${features.superLikes} Super Likes per day`,  ok: true },
            { label: 'See who liked you',    ok: features.seeWhoLikedYou },
            { label: 'Rewind last swipe',    ok: features.rewind },
            { label: 'Read receipts',        ok: features.readReceipts },
            { label: 'Video calls',          ok: features.videoCalls },
            { label: 'Voice calls',          ok: features.voiceCalls },
            { label: 'Passport mode',        ok: features.passportMode },
            { label: 'Incognito mode',       ok: features.incognitoMode },
          ].map(f => (
            <View key={f.label} style={styles.featureRow}>
              <Text style={{ color: f.ok ? Colors.success : Colors.textTertiary, fontSize: 14, width: 20 }}>
                {f.ok ? '✓' : '✕'}
              </Text>
              <Text style={{ color: f.ok ? Colors.textPrimary : Colors.textTertiary, fontSize: 14, flex: 1 }}>
                {f.label}
              </Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <Pressable
          onPress={() => subscribeMutation.mutate()}
          disabled={subscribeMutation.isPending}
          android_ripple={ripple('rgba(0,0,0,0.15)', false)}
          style={[styles.ctaBtn, shadow.goldLg]}
        >
          <LinearGradient
            colors={[accent, plan === 'GOLD' ? Colors.gold700 : Colors.stone500]}
            start={[0, 0]} end={[1, 0]}
            style={StyleSheet.absoluteFillObject}
          />
          {subscribeMutation.isPending ? (
            <ActivityIndicator color={Colors.stone950} />
          ) : (
            <Text style={styles.ctaBtnText}>
              Get {plan} — UGX {price.toLocaleString()}
            </Text>
          )}
        </Pressable>

        <Text style={styles.footerNote}>
          Pay via MTN Mobile Money, Airtel Money, or card.{'\n'}
          Secured by PesaPal · Cancel anytime
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8, gap: 14 },
  backText:    { color: Colors.gold500, fontFamily: 'monospace', fontSize: 13 },
  headerTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  body:        { paddingHorizontal: 14, gap: 12 },
  planRow:     { flexDirection: 'row', gap: 10 },
  planCard: {
    flex: 1, borderRadius: 16, borderWidth: 1,
    padding: 16,
  },
  planName:  { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  planPrice: { fontFamily: 'monospace', fontSize: 11, marginTop: 4 },
  cycleRow:  { flexDirection: 'row', gap: 8 },
  cycleBtn: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    paddingVertical: 11, alignItems: 'center',
  },
  cycleBtnLabel: { fontSize: 13, fontWeight: '600' },
  cycleSave:     { color: Colors.success, fontFamily: 'monospace', fontSize: 10, marginTop: 2 },
  featuresCard:  { padding: 18 },
  overline:      { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 12 },
  featureRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  ctaBtn: {
    borderRadius: 16, paddingVertical: 17,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  ctaBtnText: { color: Colors.stone950, fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
  footerNote: {
    color: Colors.textTertiary, textAlign: 'center',
    fontFamily: 'monospace', fontSize: 11, lineHeight: 18,
  },
})
