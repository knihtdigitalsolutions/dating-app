import { useState, useCallback, useRef } from 'react'
import {
  View, Text, Pressable, ActivityIndicator, Alert,
  StyleSheet, Animated, PanResponder,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { api } from '../../lib/api'
import { Colors, shadow, ripple, hapticMedium, hapticLight, a11yButton } from '../../lib/platform'
import type { ProfileCard } from '@dating/types'

const SWIPE_THRESHOLD = 100

function ProfileSwipeCard({
  profile, onSwipe, isTop,
}: {
  profile: ProfileCard
  onSwipe: (action: 'LIKE' | 'PASS' | 'SUPER_LIKE') => void
  isTop: boolean
}) {
  const position = useRef(new Animated.ValueXY()).current
  const [photoIndex, setPhotoIndex] = useState(0)

  const rotate = position.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-14deg', '0deg', '14deg'],
    extrapolate: 'clamp',
  })

  const likeOpacity = position.x.interpolate({
    inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp',
  })

  const nopeOpacity = position.x.interpolate({
    inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp',
  })

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTop,
      onMoveShouldSetPanResponder: () => isTop,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy * 0.25 })
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          Animated.spring(position, { toValue: { x: 600, y: 0 }, useNativeDriver: true }).start(() => onSwipe('LIKE'))
          hapticMedium()
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          Animated.spring(position, { toValue: { x: -600, y: 0 }, useNativeDriver: true }).start(() => onSwipe('PASS'))
          hapticLight()
        } else {
          Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start()
        }
      },
    })
  ).current

  const photo = profile.photos[photoIndex]

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject, styles.card,
        { zIndex: isTop ? 10 : 1, transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] },
      ]}
      {...panResponder.panHandlers}
    >
      <Image
        source={{ uri: photo?.url || 'https://picsum.photos/400/600' }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
      />
      <View style={styles.photoDots}>
        {profile.photos.map((_, i) => (
          <Pressable key={i} onPress={() => setPhotoIndex(i)}
            style={[styles.photoDot, { opacity: i === photoIndex ? 1 : 0.45 }]} />
        ))}
      </View>
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.88)']} style={styles.gradient} />
      <Animated.View style={[styles.badge, styles.badgeLike, { opacity: likeOpacity }]}>
        <Text style={[styles.badgeText, { color: Colors.success }]}>LIKE</Text>
      </Animated.View>
      <Animated.View style={[styles.badge, styles.badgeNope, { opacity: nopeOpacity }]}>
        <Text style={[styles.badgeText, { color: Colors.gold400 }]}>NOPE</Text>
      </Animated.View>
      <View style={styles.cardInfo}>
        {profile.isOnline && (
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Online now</Text>
          </View>
        )}
        <Text style={styles.cardName}>{profile.displayName}, {profile.age}</Text>
        {profile.locationName && <Text style={styles.cardLocation}>📍 {profile.locationName}</Text>}
        {profile.bio && <Text style={styles.cardBio} numberOfLines={2}>{profile.bio}</Text>}
        <View style={styles.tagRow}>
          {profile.interests.slice(0, 3).map(interest => (
            <View key={interest} style={styles.tag}><Text style={styles.tagText}>{interest}</Text></View>
          ))}
        </View>
      </View>
    </Animated.View>
  )
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const [currentIndex, setCurrentIndex] = useState(0)

  const { data: profiles, isLoading } = useQuery<ProfileCard[]>({
    queryKey: ['discover'],
    queryFn: async () => (await api.get('/matches/discover')).data.data,
  })

  const swipeMutation = useMutation({
    mutationFn: async ({ swipedId, action }: { swipedId: string; action: string }) =>
      (await api.post('/matches/swipe', { swipedId, action })).data.data,
    onSuccess: data => {
      if (data.isMatch) {
        Alert.alert("It's a Match! 💘", 'You both liked each other!', [
          { text: 'Send a message', onPress: () => {} },
          { text: 'Keep swiping', style: 'cancel' },
        ])
        hapticMedium()
      }
    },
  })

  const handleSwipe = useCallback((action: 'LIKE' | 'PASS' | 'SUPER_LIKE') => {
    if (!profiles?.[currentIndex]) return
    swipeMutation.mutate({ swipedId: profiles[currentIndex].userId, action })
    setCurrentIndex(i => i + 1)
  }, [profiles, currentIndex])

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.gold500} size="large" /></View>
  }

  const remaining = profiles ? profiles.length - currentIndex : 0

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dating App</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn} android_ripple={ripple(Colors.borderSubtle, true)}>
            <Text style={styles.iconBtnIcon}>⚡</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} android_ripple={ripple(Colors.borderSubtle, true)}>
            <Text style={styles.iconBtnIcon}>🔍</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.cardArea}>
        {remaining === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>✨</Text>
            <Text style={styles.emptyTitle}>You've seen everyone!</Text>
            <Text style={styles.emptySubtitle}>Check back later, or expand your preferences.</Text>
            <Pressable
              onPress={() => { setCurrentIndex(0); qc.invalidateQueries({ queryKey: ['discover'] }) }}
              style={[styles.refreshBtn, shadow.gold]}
            >
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </Pressable>
          </View>
        ) : (
          profiles?.slice(currentIndex, currentIndex + 3).reverse().map((profile, idx) => (
            <ProfileSwipeCard
              key={profile.id}
              profile={profile}
              isTop={idx === (Math.min(3, remaining) - 1)}
              onSwipe={handleSwipe}
            />
          ))
        )}
      </View>

      {remaining > 0 && (
        <View style={styles.actions}>
          <Pressable onPress={() => handleSwipe('PASS')} style={[styles.actionBtn, styles.actionBtnPass, shadow.md]}
            android_ripple={ripple(Colors.borderSubtle, true)} {...a11yButton('Pass')}>
            <Text style={styles.actionBtnIcon}>✕</Text>
          </Pressable>
          <Pressable onPress={() => handleSwipe('SUPER_LIKE')} style={[styles.actionBtn, styles.actionBtnStar, shadow.sm]}
            android_ripple={ripple(Colors.borderSubtle, true)} {...a11yButton('Super Like')}>
            <Text style={styles.actionBtnIcon}>⭐</Text>
          </Pressable>
          <Pressable onPress={() => handleSwipe('LIKE')} style={[styles.actionBtn, styles.actionBtnLike, shadow.goldLg]}
            android_ripple={ripple('rgba(0,0,0,0.15)', true)} {...a11yButton('Like')}>
            <Text style={styles.actionBtnIcon}>♥</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: Colors.surfaceBase },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceBase },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle:   { color: Colors.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: 'center', justifyContent: 'center' },
  iconBtnIcon:   { fontSize: 17 },
  cardArea:      { flex: 1, paddingHorizontal: 12, position: 'relative' },
  card:          { borderRadius: 24, overflow: 'hidden' },
  photoDots:     { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', gap: 4 },
  photoDot:      { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'white' },
  gradient:      { position: 'absolute', bottom: 0, left: 0, right: 0, height: 280 },
  badge:         { position: 'absolute', top: 56, borderWidth: 2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  badgeLike:     { left: 20, borderColor: Colors.success },
  badgeNope:     { right: 20, borderColor: Colors.gold400 },
  badgeText:     { fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  cardInfo:      { position: 'absolute', bottom: 20, left: 20, right: 20 },
  onlineRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  onlineDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  onlineText:    { color: Colors.success, fontSize: 12, fontFamily: 'monospace' },
  cardName:      { color: 'white', fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  cardLocation:  { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },
  cardBio:       { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 6, lineHeight: 18 },
  tagRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag:           { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  tagText:       { color: 'white', fontSize: 11, fontFamily: 'monospace' },
  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle:    { color: Colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  refreshBtn:    { backgroundColor: Colors.gold500, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12, marginTop: 20 },
  refreshBtnText:{ color: Colors.stone950, fontWeight: '700', fontSize: 15 },
  actions:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24, paddingVertical: 20 },
  actionBtn:     { alignItems: 'center', justifyContent: 'center', borderRadius: 99 },
  actionBtnPass: { width: 60, height: 60, backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.borderDefault },
  actionBtnStar: { width: 52, height: 52, backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: 'rgba(232,180,34,0.2)' },
  actionBtnLike: { width: 64, height: 64, backgroundColor: Colors.gold500 },
  actionBtnIcon: { fontSize: 22 },
})
