import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { api } from '../../lib/api'
import { useAuthStore } from '../../lib/store/auth'
import { PLAN_FEATURES } from '@dating/types'
import { Colors, ripple, shadow, styles as shared } from '../../lib/platform'

export default function ProfileScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, logout } = useAuthStore()

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => (await api.get('/profiles/me')).data.data,
  })

  const plan     = user?.plan || 'FREE'
  const features = PLAN_FEATURES[plan as keyof typeof PLAN_FEATURES]
  const mainPhoto = profile?.photos?.find((p: any) => p.isMain) || profile?.photos?.[0]

  const handleLogout = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: logout },
      ]
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.surfaceBase }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero photo */}
      <View style={styles.hero}>
        {mainPhoto ? (
          <Image
            source={{ uri: mainPhoto.url }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.heroFallback]}>
            <Text style={{ fontSize: 64 }}>👤</Text>
          </View>
        )}

        {/* Status bar safe area padding */}
        <View style={{ height: insets.top }} />

        <LinearGradient
          colors={['transparent', Colors.surfaceBase]}
          style={styles.heroGradient}
        />

        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>
            {profile?.displayName || 'Your Name'}
            {profile?.age ? `, ${profile.age}` : ''}
          </Text>
          {profile?.locationName && (
            <Text style={styles.heroLocation}>📍 {profile.locationName}</Text>
          )}
        </View>
      </View>

      <View style={styles.body}>

        {/* Plan card */}
        <View style={[shared.cardGold, styles.planCard]}>
          <View>
            <Text style={styles.overline}>CURRENT PLAN</Text>
            <Text style={styles.planName}>
              {plan === 'FREE' ? '🆓 Free' : plan === 'GOLD' ? '🥇 Gold' : '💎 Platinum'}
            </Text>
          </View>
          {plan === 'FREE' && (
            <Pressable
              onPress={() => router.push('/payments')}
              style={[shared.btnGold, styles.upgradeBtn]}
              android_ripple={ripple('rgba(0,0,0,0.15)', false)}
            >
              <Text style={styles.upgradeBtnText}>Upgrade ◆</Text>
            </Pressable>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: 'Views',       value: profile?.profileViews   || 0, icon: '👁️' },
            { label: 'Likes',       value: profile?.likesReceived  || 0, icon: '💘' },
            { label: 'Super Likes', value: profile?.superLikesReceived || 0, icon: '⭐' },
          ].map(stat => (
            <View key={stat.label} style={[shared.card, styles.statCard]}>
              <Text style={{ fontSize: 22, marginBottom: 4 }}>{stat.icon}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Bio */}
        {profile?.bio && (
          <View style={[shared.card, styles.section]}>
            <Text style={styles.overline}>ABOUT</Text>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

        {/* Interests */}
        {profile?.interests?.length > 0 && (
          <View style={[shared.card, styles.section]}>
            <Text style={styles.overline}>INTERESTS</Text>
            <View style={styles.tagRow}>
              {profile.interests.map((interest: string) => (
                <View key={interest} style={styles.tag}>
                  <Text style={styles.tagText}>{interest}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Action list */}
        <View style={[shared.card, styles.actionList]}>
          {[
            { label: 'Edit Profile',         icon: '✏️',  onPress: () => router.push('/edit-profile') },
            { label: 'Settings',             icon: '⚙️',  onPress: () => router.push('/settings') },
            { label: 'Security & Activity',  icon: '🔐', onPress: () => router.push('/security') },
          ].map((item, i) => (
            <Pressable
              key={item.label}
              onPress={item.onPress}
              android_ripple={ripple(Colors.borderSubtle)}
              style={[
                styles.actionRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
              ]}
            >
              <Text style={styles.actionIcon}>{item.icon}</Text>
              <Text style={styles.actionLabel}>{item.label}</Text>
              <Text style={styles.actionChevron}>›</Text>
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable
          onPress={handleLogout}
          style={styles.signOutBtn}
          android_ripple={ripple('rgba(248,113,113,0.1)', false)}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  hero:         { height: 300, position: 'relative', justifyContent: 'flex-end' },
  heroFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceRaised },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 160 },
  heroInfo:     { paddingHorizontal: 20, paddingBottom: 16 },
  heroName:     { color: Colors.textPrimary, fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  heroLocation: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  body:         { paddingHorizontal: 14, gap: 10 },
  overline:     { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 8 },
  planCard:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  planName:     { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 4 },
  upgradeBtn:   { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  upgradeBtnText: { color: Colors.stone950, fontWeight: '700', fontSize: 13 },
  statsRow:     { flexDirection: 'row', gap: 8 },
  statCard:     { flex: 1, alignItems: 'center', padding: 14 },
  statValue:    { color: Colors.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  statLabel:    { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 3, textAlign: 'center' },
  section:      { padding: 16 },
  bioText:      { color: Colors.stone300, fontSize: 14, lineHeight: 22 },
  tagRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:          { backgroundColor: 'rgba(232,180,34,0.10)', borderRadius: 99, borderWidth: 1, borderColor: 'rgba(232,180,34,0.20)', paddingHorizontal: 12, paddingVertical: 5 },
  tagText:      { color: Colors.gold500, fontFamily: 'monospace', fontSize: 11 },
  actionList:   { overflow: 'hidden' },
  actionRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  actionIcon:   { fontSize: 18, width: 24, textAlign: 'center' },
  actionLabel:  { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  actionChevron: { color: Colors.textTertiary, fontSize: 18 },
  signOutBtn:   { paddingVertical: 16, alignItems: 'center' },
  signOutText:  { color: Colors.danger, fontSize: 15, fontWeight: '500' },
})
