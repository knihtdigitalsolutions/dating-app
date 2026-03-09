import { useRef, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors, shadow, styles as shared } from '../../lib/platform'

export default function WelcomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Simple fade+slide in — no reanimated needed
  const logoAnim = useRef(new Animated.Value(0)).current
  const textAnim = useRef(new Animated.Value(0)).current
  const ctaAnim  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.stagger(120, [
      Animated.spring(logoAnim, { toValue: 1, useNativeDriver: true }),
      Animated.spring(textAnim, { toValue: 1, useNativeDriver: true }),
      Animated.spring(ctaAnim,  { toValue: 1, useNativeDriver: true }),
    ]).start()
  }, [])

  const slide = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  })

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <LinearGradient
        colors={['rgba(232,180,34,0.08)', 'transparent', 'rgba(44,40,37,0.25)']}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.hero, { paddingTop: insets.top + 48 }]}>

        <Animated.View style={[styles.logoWrap, slide(logoAnim)]}>
          <LinearGradient
            colors={[Colors.gold400, Colors.gold700]}
            style={styles.logoGrad}
            start={[0, 0]} end={[1, 1]}
          >
            <Text style={styles.logoSymbol}>◆</Text>
          </LinearGradient>
          <View style={styles.logoGlow} />
        </Animated.View>

        <Animated.View style={slide(textAnim)}>
          <Text style={styles.eyebrow}>✦ East Africa's Dating App</Text>
          <Text style={styles.headline}>Find Your{'\n'}Person.</Text>
          <Text style={styles.subline}>
            Real connections,{'\n'}close to home.
          </Text>
        </Animated.View>

      </View>

      <Animated.View style={[styles.cta, slide(ctaAnim)]}>
        <Pressable
          onPress={() => router.push('/(auth)/phone')}
          style={[shared.btnGold, styles.btnPrimary, shadow.goldLg]}
        >
          <Text style={styles.btnPrimaryText}>Get Started </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(auth)/phone')}
          style={[shared.btnGhost, styles.btnSecondary]}
        >
          <Text style={styles.btnSecondaryText}>Already have an account? Sign in</Text>
        </Pressable>

        <Text style={styles.legal}>
          By continuing you agree to our Terms of Service{'\n'}and Privacy Policy
        </Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.surfaceBase },
  hero:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logoWrap:      { alignItems: 'center', marginBottom: 36, position: 'relative' },
  logoGrad:      { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  logoSymbol:    { fontSize: 28, color: Colors.stone950, fontWeight: '800' },
  logoGlow:      { position: 'absolute', width: 72, height: 72, borderRadius: 20, backgroundColor: Colors.gold500, opacity: 0.15, transform: [{ scale: 1.4 }] },
  eyebrow:       { color: Colors.gold500, textAlign: 'center', fontFamily: 'monospace', fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 20 },
  headline:      { color: Colors.textPrimary, textAlign: 'center', fontSize: 56, fontWeight: '800', letterSpacing: -1.5, lineHeight: 62, marginBottom: 20 },
  subline:       { color: Colors.textSecondary, textAlign: 'center', fontSize: 17, lineHeight: 28 },
  cta:           { paddingHorizontal: 24, paddingBottom: 12, gap: 12 },
  btnPrimary:    { width: '100%', borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  btnPrimaryText:{ color: Colors.stone950, fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
  btnSecondary:  { width: '100%', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryText: { color: Colors.textSecondary, fontSize: 15 },
  legal:         { color: Colors.textTertiary, textAlign: 'center', fontFamily: 'monospace', fontSize: 11, lineHeight: 18, marginTop: 4 },
})
