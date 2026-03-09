import { useEffect, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet, Platform } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import { useAuthStore } from '../../lib/store/auth'
import { getSocket } from '../../lib/socket'
import { api } from '../../lib/api'
import { useQuery } from '@tanstack/react-query'
import { Colors, shadow, ripple, hapticMedium, hapticLight, hapticHeavy, a11yButton } from '../../lib/platform'

type CallStatus = 'ringing' | 'connecting' | 'active' | 'ended'

export default function CallScreen() {
  const {
    matchId, type, callId: incomingCallId, calleeId,
  } = useLocalSearchParams<{ matchId: string; type: 'VOICE' | 'VIDEO'; callId?: string; calleeId?: string }>()

  const router       = useRouter()
  const insets       = useSafeAreaInsets()
  const { accessToken } = useAuthStore()

  const [status, setStatus]       = useState<CallStatus>(incomingCallId ? 'ringing' : 'connecting')
  const [duration, setDuration]   = useState(0)
  const [isMuted, setIsMuted]     = useState(false)
  const [camOff, setCamOff]       = useState(false)
  const [callId, setCallId]       = useState(incomingCallId || null)

  const { data: profile } = useQuery({
    queryKey: ['profile', calleeId],
    queryFn: async () => (await api.get(`/profiles/${calleeId}`)).data.data,
    enabled: !!calleeId,
  })

  useEffect(() => {
    if (!accessToken) return
    const socket = getSocket(accessToken)

    socket.on('call:accepted', ({ callId: cid, roomToken }) => {
      setCallId(cid); setStatus('active')
      hapticMedium()
    })
    socket.on('call:declined', () => {
      setStatus('ended')
      Alert.alert('Call declined', '', [{ text: 'OK', onPress: () => router.back() }])
    })
    socket.on('call:ended', () => { setStatus('ended'); router.back() })

    return () => {
      socket.off('call:accepted')
      socket.off('call:declined')
      socket.off('call:ended')
    }
  }, [accessToken])

  useEffect(() => {
    if (status !== 'active') return
    const t = setInterval(() => setDuration(d => d + 1), 1000)
    return () => clearInterval(t)
  }, [status])

  const acceptCall = () => {
    if (!accessToken || !incomingCallId) return
    getSocket(accessToken).emit('call:accept', { callId: incomingCallId })
    setStatus('connecting')
    hapticMedium()
  }

  const endCall = () => {
    if (accessToken && callId) getSocket(accessToken).emit('call:end', { callId })
    hapticHeavy()
    router.back()
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const statusText =
    status === 'ringing' && incomingCallId ? `Incoming ${type?.toLowerCase()} call` :
    status === 'ringing'    ? 'Ringing…' :
    status === 'connecting' ? 'Connecting…' :
    status === 'active'     ? fmt(duration) : 'Call ended'

  return (
    <View style={styles.screen}>
      {/* Subtle atmospheric gradient */}
      <LinearGradient
        colors={['rgba(232,180,34,0.08)', Colors.surfaceBase, 'rgba(44,40,37,0.6)']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Top — status bar spacing */}
      <View style={{ height: insets.top + 16 }} />

      {/* Caller info */}
      <View style={styles.callerArea}>
        {/* Avatar */}
        <View style={[styles.avatarRing, shadow.goldLg]}>
          {profile?.photos?.[0]?.url ? (
            <Image
              source={{ uri: profile.photos[0].url }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={{ fontSize: 44 }}>👤</Text>
            </View>
          )}
        </View>

        <Text style={styles.name}>{profile?.displayName || 'Calling…'}</Text>
        <Text style={styles.status}>{statusText}</Text>

        {status === 'connecting' && (
          <ActivityIndicator color={Colors.gold500} style={{ marginTop: 12 }} />
        )}
      </View>

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
        {status === 'ringing' && incomingCallId ? (
          /* Incoming — decline / accept */
          <View style={styles.incomingRow}>
            <View style={styles.controlCol}>
              <Pressable
                onPress={endCall}
                style={[styles.bigBtn, { backgroundColor: Colors.danger }]}
                android_ripple={ripple('rgba(0,0,0,0.15)', true)}
              >
                <Text style={styles.bigBtnIcon}>📵</Text>
              </Pressable>
              <Text style={styles.btnLabel}>Decline</Text>
            </View>

            <View style={styles.controlCol}>
              <Pressable
                onPress={acceptCall}
                style={[styles.bigBtn, { backgroundColor: Colors.success }]}
                android_ripple={ripple('rgba(0,0,0,0.15)', true)}
              >
                <Text style={styles.bigBtnIcon}>{type === 'VIDEO' ? '📹' : '📞'}</Text>
              </Pressable>
              <Text style={styles.btnLabel}>Accept</Text>
            </View>
          </View>
        ) : (
          /* Active call controls */
          <View style={styles.activeRow}>
            <View style={styles.controlCol}>
              <Pressable
                onPress={() => { setIsMuted(m => !m); hapticLight() }}
                style={[styles.smallBtn, isMuted && styles.smallBtnActive]}
                android_ripple={ripple(Colors.borderSubtle, true)}
              >
                <Text style={styles.smallBtnIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
              </Pressable>
              <Text style={styles.btnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </View>

            {type === 'VIDEO' && (
              <View style={styles.controlCol}>
                <Pressable
                  onPress={() => { setCamOff(c => !c); hapticLight() }}
                  style={[styles.smallBtn, camOff && styles.smallBtnActive]}
                  android_ripple={ripple(Colors.borderSubtle, true)}
                >
                  <Text style={styles.smallBtnIcon}>{camOff ? '📷' : '📹'}</Text>
                </Pressable>
                <Text style={styles.btnLabel}>{camOff ? 'Camera off' : 'Camera'}</Text>
              </View>
            )}

            <View style={styles.controlCol}>
              <Pressable
                onPress={endCall}
                style={[styles.bigBtn, { backgroundColor: Colors.danger }]}
                android_ripple={ripple('rgba(0,0,0,0.15)', true)}
              >
                <Text style={styles.bigBtnIcon}>📵</Text>
              </Pressable>
              <Text style={styles.btnLabel}>End</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: Colors.surfaceBase },
  callerArea:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  avatarRing:  { width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: Colors.borderGold, overflow: 'hidden', marginBottom: 8 },
  avatar:      { width: '100%', height: '100%' },
  avatarFallback: { backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  name:        { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  status:      { color: Colors.textSecondary, fontFamily: 'monospace', fontSize: 13 },
  controls:    { paddingHorizontal: 32, paddingTop: 20 },
  incomingRow: { flexDirection: 'row', justifyContent: 'space-around' },
  activeRow:   { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  controlCol:  { alignItems: 'center', gap: 10 },
  bigBtn: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  bigBtnIcon:   { fontSize: 26 },
  smallBtn: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceOverlay,
    borderWidth: 1, borderColor: Colors.borderDefault,
  },
  smallBtnActive: { backgroundColor: 'rgba(248,113,113,0.15)', borderColor: 'rgba(248,113,113,0.4)' },
  smallBtnIcon: { fontSize: 22 },
  btnLabel:     { color: Colors.textSecondary, fontFamily: 'monospace', fontSize: 11 },
})
