import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, Pressable, FlatList,
  KeyboardAvoidingView, ActivityIndicator, StyleSheet, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { format } from 'date-fns'
import { api } from '../../lib/api'
import { useAuthStore } from '../../lib/store/auth'
import { getSocket } from '../../lib/socket'
import { Colors, keyboardBehavior, ripple, shadow, styles as shared } from '../../lib/platform'

export default function ChatScreen() {
  const { matchId }    = useLocalSearchParams<{ matchId: string }>()
  const { user, accessToken } = useAuthStore()
  const router         = useRouter()
  const insets         = useSafeAreaInsets()
  const flatListRef    = useRef<FlatList>(null)
  const [text, setText]     = useState('')
  const [theyTyping, setTheyTyping] = useState(false)
  const typingRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef    = useRef(false)
  const qc             = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['messages', matchId],
    queryFn: async () => {
      const [msgRes, matchRes] = await Promise.all([
        api.get(`/messages/${matchId}`),
        api.get('/matches').then(r => r.data.data.find((m: any) => m.id === matchId)),
      ])
      return { messages: msgRes.data.data, match: matchRes }
    },
  })

  const sendMutation = useMutation({
    mutationFn: async (content: string) =>
      (await api.post('/messages', { matchId, type: 'TEXT', content })).data.data,
    onSuccess: msg => {
      qc.setQueryData(['messages', matchId], (old: any) => ({
        ...old, messages: [...(old?.messages || []), msg],
      }))
      flatListRef.current?.scrollToEnd({ animated: true })
    },
  })

  useEffect(() => {
    if (!accessToken) return
    const socket = getSocket(accessToken)

    socket.on('message:new', msg => {
      if (msg.matchId !== matchId) return
      qc.setQueryData(['messages', matchId], (old: any) => ({
        ...old, messages: [...(old?.messages || []), msg],
      }))
      flatListRef.current?.scrollToEnd({ animated: true })
    })
    socket.on('typing:indicator', ({ matchId: mid, isTyping }) => {
      if (mid === matchId) setTheyTyping(isTyping)
    })

    return () => {
      socket.off('message:new')
      socket.off('typing:indicator')
    }
  }, [accessToken, matchId])

  const handleTyping = useCallback((t: string) => {
    setText(t)
    if (!accessToken) return
    const socket = getSocket(accessToken)
    if (!isTypingRef.current) {
      isTypingRef.current = true
      socket.emit('typing:start', { matchId })
    }
    if (typingRef.current) clearTimeout(typingRef.current)
    typingRef.current = setTimeout(() => {
      isTypingRef.current = false
      socket.emit('typing:stop', { matchId })
    }, 1500)
  }, [matchId, accessToken])

  const handleSend = () => {
    if (!text.trim()) return
    sendMutation.mutate(text.trim())
    setText('')
  }

  const handleCall = (type: 'VOICE' | 'VIDEO') => {
    const otherId = data?.match?.other?.id
    if (!otherId || !accessToken) return
    getSocket(accessToken).emit('call:initiate', { matchId, calleeId: otherId, type })
    router.push(`/call/${matchId}?type=${type}&calleeId=${otherId}`)
  }

  const other    = data?.match?.other
  const messages = data?.messages || []

  return (
    <KeyboardAvoidingView
      behavior={keyboardBehavior}
      style={styles.kav}
      // Android: keyboardVerticalOffset should be 0 with 'height' behavior
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header — uses insets.top, not hardcoded pt-14 */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          android_ripple={ripple(Colors.borderSubtle, true)}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>

        {other?.photo && (
          <Image
            source={{ uri: other.photo }}
            style={styles.avatar}
            contentFit="cover"
          />
        )}

        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{other?.displayName || 'Chat'}</Text>
          <Text style={[styles.headerStatus, { color: other?.isOnline ? Colors.success : Colors.textTertiary }]}>
            {other?.isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>

        <Pressable
          onPress={() => handleCall('VOICE')}
          style={styles.callBtn}
          android_ripple={ripple(Colors.borderSubtle, true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 18 }}>📞</Text>
        </Pressable>
        <Pressable
          onPress={() => handleCall('VIDEO')}
          style={styles.callBtn}
          android_ripple={ripple(Colors.borderSubtle, true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 18 }}>📹</Text>
        </Pressable>
      </View>

      {/* Messages */}
      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.gold500} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.messages, { paddingBottom: 8 }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const mine = item.senderId === user?.id
            return (
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <View style={[styles.bubbleInner, mine ? styles.bubbleInnerMine : styles.bubbleInnerTheirs]}>
                  <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                    {item.content}
                  </Text>
                </View>
                <Text style={[styles.bubbleMeta, mine ? styles.bubbleMetaMine : styles.bubbleMetaTheirs]}>
                  {format(new Date(item.createdAt), 'HH:mm')}
                  {mine && (item.isRead ? ' ✓✓' : ' ✓')}
                </Text>
              </View>
            )
          }}
        />
      )}

      {/* Typing indicator */}
      {theyTyping && (
        <View style={styles.typing}>
          <Text style={styles.typingText}>{other?.displayName} is typing…</Text>
        </View>
      )}

      {/* Input bar — paddingBottom uses safe area */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          value={text}
          onChangeText={handleTyping}
          multiline
          maxLength={1000}
          placeholder="Message…"
          placeholderTextColor={Colors.textTertiary}
          style={styles.textInput}
          // Android: remove default underline
          underlineColorAndroid="transparent"
        />
        <Pressable
          onPress={handleSend}
          disabled={!text.trim()}
          style={[styles.sendBtn, { backgroundColor: text.trim() ? Colors.gold500 : Colors.surfaceOverlay }]}
          android_ripple={ripple('rgba(0,0,0,0.15)', true)}
        >
          <Text style={{ color: text.trim() ? Colors.stone950 : Colors.textTertiary, fontSize: 18, fontWeight: '700' }}>
            ↑
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  kav: { flex: 1, backgroundColor: Colors.surfaceBase },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingBottom: 12,
    backgroundColor: Colors.surfaceRaised,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
    gap: 10,
  },
  back:       { color: Colors.gold500, fontFamily: 'monospace', fontSize: 18, lineHeight: 24 },
  avatar:     { width: 40, height: 40, borderRadius: 20 },
  headerInfo: { flex: 1 },
  headerName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  headerStatus: { fontSize: 11, fontFamily: 'monospace', marginTop: 1 },
  callBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.surfaceBase, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messages: { paddingHorizontal: 14, paddingTop: 12, gap: 6 },
  bubble: { maxWidth: '78%', gap: 3 },
  bubbleMine:   { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubbleInner:     { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleInnerMine: { backgroundColor: Colors.gold600, borderBottomRightRadius: 4 },
  bubbleInnerTheirs: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1, borderColor: Colors.borderSubtle,
    borderBottomLeftRadius: 4,
  },
  bubbleText:       { fontSize: 14, lineHeight: 20 },
  bubbleTextMine:   { color: Colors.stone950, fontWeight: '500' },
  bubbleTextTheirs: { color: Colors.textPrimary },
  bubbleMeta:     { fontFamily: 'monospace', fontSize: 10, color: Colors.textTertiary },
  bubbleMetaMine:   { textAlign: 'right' },
  bubbleMetaTheirs: { textAlign: 'left' },
  typing: { paddingHorizontal: 18, paddingVertical: 4 },
  typingText: { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 11 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: Colors.surfaceRaised,
    borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surfaceBase,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.borderDefault,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    color: Colors.textPrimary,
    fontSize: 14,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
})
