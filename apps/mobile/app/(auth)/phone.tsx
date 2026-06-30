import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  Alert, ScrollView, KeyboardAvoidingView, StyleSheet, Platform,
  Animated,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { api } from '../../lib/api'
import { useAuthStore } from '../../lib/store/auth'
import { Colors, Fonts, keyboardBehavior, shadow, styles as shared } from '../../lib/platform'

const COUNTRIES = [
  { code: '+256', flag: '🇺🇬', name: 'UG', pattern: /^\+256\d{9}$/ },
  { code: '+254', flag: '🇰🇪', name: 'KE', pattern: /^\+254\d{9}$/ },
  { code: '+255', flag: '🇹🇿', name: 'TZ', pattern: /^\+255\d{9}$/ },
]

export default function PhoneScreen() {
  const [step, setStep]         = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone]       = useState('+256')
  const [otp, setOtp]           = useState('')
  const [loading, setLoading]   = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [focused, setFocused]   = useState<string | null>(null)

  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { setTokens, setUser } = useAuthStore()

  const activeCountry = COUNTRIES.find(c => phone.startsWith(c.code)) || COUNTRIES[0]

  const startCountdown = () => {
    setCountdown(120)
    const timer = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(timer); return 0 } return c - 1 })
    }, 1000)
  }

  const requestOtp = async () => {
    const valid = COUNTRIES.some(c => c.pattern.test(phone))
    if (!valid) {
      Alert.alert(
        'Invalid number',
        'Enter a valid Uganda (+256), Kenya (+254), or Tanzania (+255) number.',
        [{ text: 'OK' }]
      )
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/otp/request', { phone })
      setStep('otp')
      startCountdown()
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to send code. Try again.')
      console.error('OTP request failed', err)
    } finally {
      setLoading(false)
    }
  }

  // Inside your Expo verification trigger method:
  const verifyOtp = async (codeToVerify?: string) => {
    const finalOtp = codeToVerify || otp
    if (finalOtp.length !== 6) return
    
    setLoading(true)
    try {
      const res = await api.post('/auth/otp/verify', { 
        phone, 
        code: finalOtp,
        // Provide security context data natively
        platform: Platform.OS, // 'ios' | 'android'
        deviceName: Platform.select({ ios: 'iPhone', android: 'Android Device' }),
        deviceFingerprint: 'unique-hardware-hash-or-token' // Use expo-application parameters if necessary
      })
      
      const { tokens, user } = res.data.data
      await setTokens(tokens.accessToken, tokens.refreshToken)
      setUser(user)
      router.replace(user.hasProfile ? '/(tabs)/discover' : '/(auth)/onboarding')
    } catch (err: any) {
      Alert.alert('Wrong code', 'Incorrect OTP. Try again.')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  return (
    // KeyboardAvoidingView with platform-correct behavior
    <KeyboardAvoidingView
      behavior={keyboardBehavior}
      style={styles.kav}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable
          onPress={() => step === 'otp' ? setStep('phone') : router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.back}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        {step === 'phone' ? (
          <Animated.View>
            <Text style={styles.title}>What's your{'\n'}number?</Text>
            <Text style={styles.subtitle}>
              We'll send a verification code via SMS.
            </Text>

            {/* Country selector */}
            <View style={styles.countryRow}>
              {COUNTRIES.map(c => (
                <Pressable
                  key={c.code}
                  onPress={() => setPhone(c.code)}
                  style={[
                    styles.countryBtn,
                    phone.startsWith(c.code) && styles.countryBtnActive,
                  ]}
                >
                  <Text style={styles.countryFlag}>{c.flag}</Text>
                  <Text style={[
                    styles.countryCode,
                    { color: phone.startsWith(c.code) ? Colors.gold500 : Colors.textTertiary },
                  ]}>
                    {c.code}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Phone input */}
            <View style={[
              styles.inputWrap,
              focused === 'phone' && styles.inputFocused,
            ]}>
              <Text style={styles.inputLabel}>PHONE NUMBER</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                style={styles.phoneInput}
                placeholderTextColor={Colors.textTertiary}
                placeholder={`${activeCountry.code} 700 000 000`}
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                returnKeyType="done"
                onSubmitEditing={requestOtp}
                autoFocus
                // Android: no underline
                underlineColorAndroid="transparent"
              />
            </View>

            <Pressable
              onPress={requestOtp}
              disabled={loading}
              style={[shared.btnGold, styles.btn]}
            >
              {loading
                ? <ActivityIndicator color={Colors.stone950} />
                : <Text style={styles.btnText}>Send Code</Text>
              }
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View>
            <Text style={styles.title}>Check your{'\n'}SMS</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to{' '}
              <Text style={{ color: Colors.textPrimary, fontWeight: '600' }}>{phone}</Text>
            </Text>

            {/* OTP input */}
            <View style={[
              styles.inputWrap,
              focused === 'otp' && styles.inputFocused,
            ]}>
              <Text style={styles.inputLabel}>VERIFICATION CODE</Text>
              <TextInput
                value={otp}
                onChangeText={t => {
                  const v = t.replace(/\D/g, '').slice(0, 6)
                  setOtp(v)
                  if (v.length === 6) setTimeout(verifyOtp, 80)
                }}
                keyboardType="number-pad"
                maxLength={6}
                style={styles.otpInput}
                placeholderTextColor={Colors.textTertiary}
                placeholder="· · · · · ·"
                onFocus={() => setFocused('otp')}
                onBlur={() => setFocused(null)}
                returnKeyType="done"
                autoFocus
                underlineColorAndroid="transparent"
                // On Android, this improves autofill from SMS
                textContentType="oneTimeCode"
                autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
              />
            </View>

            <Pressable
              onPress={() => verifyOtp()}
              disabled={loading || otp.length < 6}
              style={[
                shared.btnGold,
                styles.btn,
                otp.length < 6 && styles.btnDisabled,
              ]}
            >
              {loading
                ? <ActivityIndicator color={Colors.stone950} />
                : <Text style={styles.btnText}>Verify & Continue</Text>
              }
            </Pressable>

            <Pressable
              onPress={countdown === 0 ? requestOtp : undefined}
              disabled={countdown > 0}
              hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
              style={styles.resendBtn}
            >
              <Text style={[
                styles.resendText,
                { color: countdown > 0 ? Colors.textTertiary : Colors.gold500 },
              ]}>
                {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  kav: { flex: 1, backgroundColor: Colors.surfaceBase },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  back: { marginBottom: 32 },
  backText: { color: Colors.gold500, fontFamily: 'monospace', fontSize: 13 },
  title: {
    color: Colors.textPrimary,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 44,
    marginBottom: 10,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  countryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  countryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceOverlay,
  },
  countryBtnActive: {
    borderColor: Colors.borderGold,
    backgroundColor: 'rgba(232,180,34,0.08)',
  },
  countryFlag: { fontSize: 16 },
  countryCode: { fontFamily: 'monospace', fontSize: 12, fontWeight: '600' },
  inputWrap: {
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    marginBottom: 20,
  },
  inputFocused: {
    borderColor: 'rgba(232,180,34,0.5)',
  },
  inputLabel: {
    color: Colors.textTertiary,
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  phoneInput: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: 0.5,
    padding: 0,
  },
  otpInput: {
    color: Colors.textPrimary,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 12,
    fontFamily: 'monospace',
    padding: 0,
  },
  btn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 16,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    color: Colors.stone950,
    fontSize: 16,
    fontWeight: '700',
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  resendText: {
    fontFamily: 'monospace',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
