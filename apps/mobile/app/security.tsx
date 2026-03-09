import { useState } from 'react'
import {
  View, Text, ScrollView, Pressable, FlatList,
  Alert, ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'expo-router'
import { api } from '../lib/api'
import { Colors, ripple, styles as shared } from '../lib/platform'
// import { Colors, ripple, shadow, styles as shared } from '../../lib/platform'

// ── Severity colours ──────────────────────────────────────
const SEV: Record<string, string> = {
  INFO:     Colors.textTertiary,
  LOW:      Colors.success,
  MEDIUM:   Colors.gold500,
  HIGH:     Colors.gold300,
  CRITICAL: Colors.danger,
}

const EVENT_ICON: Record<string, string> = {
  LOGIN_SUCCESS:               '✅',
  LOGIN_FAILED:                '❌',
  LOGOUT:                      '👋',
  OTP_REQUESTED:               '📱',
  OTP_VERIFIED:                '✔️',
  OTP_FAILED:                  '🔢',
  TOKEN_REFRESHED:             '🔄',
  TOKEN_REVOKED:               '🚫',
  SESSION_CREATED:             '🔑',
  SESSION_REVOKED:             '🔐',
  CONCURRENT_SESSION_DETECTED: '⚠️',
  ACCOUNT_LOCKED:              '🔒',
  BRUTE_FORCE_ATTEMPT:         '💥',
  MULTIPLE_FAILED_OTPS:        '⚠️',
  SUSPICIOUS_ACTIVITY:         '🔎',
  RATE_LIMIT_HIT:              '⛔',
  PAYMENT_COMPLETED:           '✅',
  SUBSCRIPTION_ACTIVATED:      '⭐',
  PROFILE_UPDATED:             '✏️',
}

const EVENT_LABEL: Record<string, string> = {
  LOGIN_SUCCESS:               'Login successful',
  LOGIN_FAILED:                'Login failed',
  LOGOUT:                      'Logged out',
  OTP_REQUESTED:               'Verification code sent',
  OTP_VERIFIED:                'Code verified',
  OTP_FAILED:                  'Wrong code entered',
  TOKEN_REFRESHED:             'Session refreshed',
  TOKEN_REVOKED:               'Session revoked',
  SESSION_CREATED:             'New session created',
  SESSION_REVOKED:             'Session revoked',
  CONCURRENT_SESSION_DETECTED: 'New location login',
  ACCOUNT_LOCKED:              'Account temporarily locked',
  BRUTE_FORCE_ATTEMPT:         'Attack attempt detected',
  MULTIPLE_FAILED_OTPS:        'Multiple failed codes',
  SUSPICIOUS_ACTIVITY:         'Suspicious activity',
  RATE_LIMIT_HIT:              'Rate limit reached',
  PAYMENT_COMPLETED:           'Payment completed',
  SUBSCRIPTION_ACTIVATED:      'Subscription activated',
  PROFILE_UPDATED:             'Profile updated',
}

type Filter = 'ALL' | 'HIGH' | 'CRITICAL'

export default function SecurityScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const qc      = useQueryClient()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [page, setPage]     = useState(1)

  const { data: summary } = useQuery({
    queryKey: ['security', 'summary'],
    queryFn: async () => (await api.get('/security/activity/summary')).data.data,
  })

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['security', 'activity', filter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '30' })
      if (filter !== 'ALL') params.set('severity', filter)
      return (await api.get(`/security/activity?${params}`)).data.data
    },
  })

  const { data: sessions = [] } = useQuery({
    queryKey: ['security', 'sessions'],
    queryFn: async () => (await api.get('/security/sessions')).data.data,
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/security/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security', 'sessions'] }),
  })

  const revokeAllMutation = useMutation({
    mutationFn: () => api.delete('/security/sessions'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security', 'sessions'] })
    },
  })

  const confirmRevokeAll = () => {
    Alert.alert(
      'Revoke All Sessions',
      'This will log out all other devices. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke All', style: 'destructive', onPress: () => revokeAllMutation.mutate() },
      ]
    )
  }

  const events = data?.events || []

  const platformIcon = (p?: string) =>
    p === 'ios' ? '🍎' : p === 'android' ? '🤖' : '🌐'

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          android_ripple={ripple(Colors.borderSubtle, true)}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Security</Text>
          <Text style={styles.subtitle}>All account activity is logged</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.gold500}
            colors={[Colors.gold500]}
          />
        }
      >
        {/* Summary cards */}
        {summary && (
          <View style={styles.summaryRow}>
            {[
              { label: 'Logins',   value: summary.totalLogins,            color: Colors.success },
              { label: 'Failed',   value: summary.failedLogins,           color: summary.failedLogins  > 3 ? Colors.danger : Colors.gold500 },
              { label: 'Devices',  value: summary.activeSessions,         color: Colors.stone300 },
              { label: 'Alerts',   value: summary.recentHighRisk?.length || 0, color: summary.recentHighRisk?.length > 0 ? Colors.danger : Colors.success },
            ].map(s => (
              <View key={s.label} style={[shared.card, styles.summaryCard]}>
                <Text style={[styles.summaryValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.summaryLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Alerts */}
        {summary?.recentHighRisk?.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertTitle}>⚠ RECENT ALERTS</Text>
            {summary.recentHighRisk.slice(0, 3).map((e: any, i: number) => (
              <View key={i} style={[styles.alertRow, i > 0 && styles.alertRowBorder]}>
                <Text style={styles.alertEventText}>
                  {EVENT_ICON[e.eventType] || '🔔'} {EVENT_LABEL[e.eventType] || e.eventType}
                </Text>
                <Text style={styles.alertTime}>
                  {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Active sessions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.overline}>ACTIVE SESSIONS</Text>
          {sessions.length > 1 && (
            <Pressable onPress={confirmRevokeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.revokeAllText}>Revoke all others</Text>
            </Pressable>
          )}
        </View>

        {sessions.slice(0, 3).map((s: any, i: number) => (
          <View key={s.id} style={[shared.card, styles.sessionRow]}>
            <Text style={styles.sessionIcon}>{platformIcon(s.platform)}</Text>
            <View style={{ flex: 1 }}>
              <View style={styles.sessionNameRow}>
                <Text style={styles.sessionName}>{s.deviceName || 'Unknown device'}</Text>
                {i === 0 && (
                  <View style={styles.thisDeviceBadge}>
                    <Text style={styles.thisDeviceText}>THIS DEVICE</Text>
                  </View>
                )}
              </View>
              {s.ipAddress && (
                <Text style={styles.sessionMeta}>🌐 {s.ipAddress}</Text>
              )}
              <Text style={styles.sessionTime}>
                Active {formatDistanceToNow(new Date(s.lastActiveAt), { addSuffix: true })}
              </Text>
            </View>
            {i !== 0 && (
              <Pressable
                onPress={() => revokeMutation.mutate(s.id)}
                disabled={revokeMutation.isPending}
                style={styles.revokeBtn}
                android_ripple={ripple('rgba(248,113,113,0.1)', false)}
              >
                <Text style={styles.revokeBtnText}>Revoke</Text>
              </Pressable>
            )}
          </View>
        ))}

        {/* Activity log filter */}
        <Text style={[styles.overline, { marginTop: 8 }]}>ACTIVITY LOG</Text>
        <View style={styles.filterRow}>
          {(['ALL', 'HIGH', 'CRITICAL'] as Filter[]).map(f => {
            const active = filter === f
            const col    = f === 'ALL' ? Colors.gold500 : f === 'HIGH' ? Colors.gold300 : Colors.danger
            return (
              <Pressable
                key={f}
                onPress={() => { setFilter(f); setPage(1) }}
                android_ripple={ripple(col + '22', false)}
                style={[
                  styles.filterBtn,
                  {
                    borderColor: active ? col : Colors.borderSubtle,
                    backgroundColor: active ? col + '14' : Colors.surfaceRaised,
                  },
                ]}
              >
                <Text style={[styles.filterBtnText, { color: active ? col : Colors.textTertiary }]}>
                  {f}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Events */}
        {isLoading ? (
          <ActivityIndicator color={Colors.gold500} style={{ marginTop: 32 }} />
        ) : events.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🔍</Text>
            <Text style={styles.emptyText}>No events for this filter</Text>
          </View>
        ) : (
          events.map((event: any) => (
            <EventRow key={event.id} event={event} />
          ))
        )}

        {/* Load more */}
        {data && page < data.pages && (
          <Pressable
            onPress={() => setPage(p => p + 1)}
            style={styles.loadMoreBtn}
            android_ripple={ripple(Colors.borderSubtle, false)}
          >
            <Text style={styles.loadMoreText}>Load more</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  )
}

// ── Event row ────────────────────────────────────────────
function EventRow({ event }: { event: any }) {
  const [open, setOpen] = useState(false)
  const color = SEV[event.severity] || Colors.textTertiary

  return (
    <Pressable
      onPress={() => setOpen(o => !o)}
      android_ripple={ripple(Colors.borderSubtle, false)}
      style={[shared.card, styles.eventRow]}
    >
      <View style={styles.eventMain}>
        <View style={[styles.severityDot, { backgroundColor: color }]} />
        <Text style={styles.eventIcon}>{EVENT_ICON[event.eventType] || '📋'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.eventLabel}>
            {EVENT_LABEL[event.eventType] || event.eventType.replace(/_/g, ' ')}
          </Text>
          <View style={styles.eventMeta}>
            {event.ipAddress && (
              <Text style={styles.eventMetaText}>🌐 {event.ipAddress}</Text>
            )}
            {event.platform && (
              <Text style={styles.eventMetaText}>
                {event.platform === 'ios' ? '🍎' : event.platform === 'android' ? '🤖' : '🌐'} {event.platform}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.eventRight}>
          {event.riskScore > 0 && (
            <View style={[styles.riskBadge, { backgroundColor: color + '18' }]}>
              <Text style={[styles.riskText, { color }]}>R{event.riskScore}</Text>
            </View>
          )}
          <Text style={styles.eventTime}>
            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: false })} ago
          </Text>
        </View>
      </View>

      {open && (
        <View style={styles.eventDetail}>
          {event.description && (
            <Text style={styles.eventDesc}>{event.description}</Text>
          )}
          <View style={styles.eventDetailRow}>
            <DetailItem label="Severity"   value={event.severity} />
            <DetailItem label="Risk Score" value={`${event.riskScore}/100`} />
          </View>
        </View>
      )}
    </Pressable>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: Colors.surfaceBase },
  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  back:     { color: Colors.gold500, fontFamily: 'monospace', fontSize: 18, lineHeight: 24 },
  title:    { color: Colors.textPrimary, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 10, marginTop: 1 },
  scroll:   { paddingHorizontal: 14, gap: 8 },
  overline: { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase' },

  summaryRow:  { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, alignItems: 'center', padding: 12 },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 3 },

  alertBanner: {
    backgroundColor: 'rgba(248,113,113,0.07)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.22)',
    borderRadius: 14, padding: 14,
  },
  alertTitle:     { color: Colors.danger, fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  alertRow:       { paddingVertical: 7, gap: 2 },
  alertRowBorder: { borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  alertEventText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  alertTime:      { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 10 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  revokeAllText: { color: Colors.danger, fontFamily: 'monospace', fontSize: 11 },

  sessionRow:    { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  sessionIcon:   { fontSize: 24, width: 32, textAlign: 'center' },
  sessionNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionName:   { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  thisDeviceBadge: { backgroundColor: 'rgba(74,222,128,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  thisDeviceText: { color: Colors.success, fontFamily: 'monospace', fontSize: 8 },
  sessionMeta:   { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 11, marginTop: 2 },
  sessionTime:   { color: Colors.stone700, fontSize: 11, marginTop: 2 },
  revokeBtn:     { borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  revokeBtnText: { color: Colors.danger, fontFamily: 'monospace', fontSize: 11 },

  filterRow: { flexDirection: 'row', gap: 8 },
  filterBtn: { flex: 1, borderWidth: 1, borderRadius: 20, paddingVertical: 8, alignItems: 'center' },
  filterBtnText: { fontFamily: 'monospace', fontSize: 11, fontWeight: '600' },

  empty:     { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 12 },

  eventRow:  { marginBottom: 4, overflow: 'hidden' },
  eventMain: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  severityDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  eventIcon:   { fontSize: 16, width: 22, textAlign: 'center' },
  eventLabel:  { color: Colors.textPrimary, fontSize: 13, fontWeight: '500' },
  eventMeta:   { flexDirection: 'row', gap: 10, marginTop: 3 },
  eventMetaText: { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 10 },
  eventRight:  { alignItems: 'flex-end', gap: 5 },
  riskBadge:   { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  riskText:    { fontFamily: 'monospace', fontSize: 10, fontWeight: '700' },
  eventTime:   { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 10 },
  eventDetail: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, gap: 8 },
  eventDesc:   { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, paddingTop: 10 },
  eventDetailRow: { flexDirection: 'row', gap: 16 },
  detailLabel: { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
  detailValue: { color: Colors.stone300, fontFamily: 'monospace', fontSize: 12 },

  loadMoreBtn:  { borderWidth: 1, borderColor: Colors.borderSubtle, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  loadMoreText: { color: Colors.gold500, fontFamily: 'monospace', fontSize: 12 },
})
