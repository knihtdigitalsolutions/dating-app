import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../../lib/api'
import { Colors, ripple, styles as shared } from '../../lib/platform'

export default function MatchesScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()

  const { data: matches, isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => (await api.get('/matches')).data.data,
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.gold500} />
      </View>
    )
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Matches</Text>
        <Text style={styles.count}>{matches?.length || 0} CONNECTIONS</Text>
      </View>

      <FlatList
        data={matches}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>💘</Text>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptySubtitle}>Keep swiping! Your next match is out there.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/chat/${item.id}`)}
            android_ripple={ripple(Colors.borderSubtle)}
            style={[shared.card, styles.row]}
          >
            {/* Avatar */}
            <View style={styles.avatarWrap}>
              <Image
                source={{ uri: item.other.photo || 'https://placekitten.com/100/100' }}
                style={styles.avatar}
                contentFit="cover"
              />
              {item.other.isOnline && <View style={styles.onlineDot} />}
            </View>

            {/* Info */}
            <View style={styles.info}>
              <View style={styles.infoTop}>
                <Text style={styles.name}>{item.other.displayName}</Text>
                {item.lastMessage && (
                  <Text style={styles.time}>
                    {formatDistanceToNow(new Date(item.lastMessage.createdAt))}
                  </Text>
                )}
              </View>

              {item.compatibilityScore && (
                <Text style={styles.score}>
                  ✦ {Math.round(item.compatibilityScore * 100)}% match
                </Text>
              )}

              {item.lastMessage ? (
                <Text
                  style={[
                    styles.preview,
                    !item.lastMessage.isRead && !item.lastMessage.isMine && styles.previewUnread,
                  ]}
                  numberOfLines={1}
                >
                  {item.lastMessage.isMine ? 'You: ' : ''}
                  {item.lastMessage.type === 'TEXT'
                    ? item.lastMessage.content
                    : `📎 ${item.lastMessage.type.toLowerCase()}`}
                </Text>
              ) : (
                <Text style={styles.sayHello}>Say hello! 👋</Text>
              )}
            </View>

            {/* Unread dot */}
            {item.lastMessage && !item.lastMessage.isRead && !item.lastMessage.isMine && (
              <View style={styles.unreadDot} />
            )}
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfaceBase },
  center: { flex: 1, backgroundColor: Colors.surfaceBase, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 14, paddingBottom: 10 },
  title:  { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  count:  { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 10, letterSpacing: 3, marginTop: 2 },
  list:   { paddingHorizontal: 14, gap: 6, paddingBottom: 20 },
  row:    { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar:     { width: 58, height: 58, borderRadius: 29 },
  onlineDot:  {
    position: 'absolute', bottom: 1, right: 1,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.success,
    borderWidth: 2, borderColor: Colors.surfaceRaised,
  },
  info:    { flex: 1, gap: 3 },
  infoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name:    { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  time:    { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 11 },
  score:   { color: Colors.gold500, fontFamily: 'monospace', fontSize: 11 },
  preview: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  previewUnread: { color: Colors.textPrimary, fontWeight: '600' },
  sayHello: { color: Colors.gold500, fontSize: 13 },
  unreadDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.gold500, flexShrink: 0,
  },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyTitle:    { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: Colors.textSecondary, textAlign: 'center', fontSize: 14, lineHeight: 20 },
})
