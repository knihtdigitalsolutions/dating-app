/**
 * Onboarding screen — runs after phone OTP verification, before the main app.
 * Steps: name → birthday → gender → looking for → bio → photos
 *
 * Route: /(auth)/onboarding
 * On complete: router.replace('/(tabs)/discover')
 */
import { useState, useRef } from 'react'
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, Animated, Platform, Alert,
  KeyboardAvoidingView, Image,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { Colors, shadow, inputProps, styles as shared } from '../../lib/platform'
import { api } from '../../lib/api'

// ── Types ─────────────────────────────────────────────────
type Gender  = 'man' | 'woman' | 'nonbinary' | 'other'
type Looking = 'men' | 'women' | 'everyone'

interface OnboardingData {
  displayName: string
  birthday:    string   // YYYY-MM-DD
  gender:      Gender | ''
  lookingFor:  Looking | ''
  bio:         string
  photos:      string[] // local URIs
}

const TOTAL_STEPS = 6

// ── Progress bar ──────────────────────────────────────────
function ProgressBar({ step }: { step: number }) {
  return (
    <View style={prog.row}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[prog.seg, i < step && prog.segActive, i === step - 1 && prog.segCurrent]}
        />
      ))}
    </View>
  )
}

const prog = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 4 },
  seg:        { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.surfaceSubtle },
  segActive:  { backgroundColor: Colors.gold600 },
  segCurrent: { backgroundColor: Colors.gold500 },
})

// ── Chip selector ─────────────────────────────────────────
function ChipGroup<T extends string>({
  options, value, onChange, multi = false,
}: {
  options: { value: T; label: string; icon?: string }[]
  value: T | T[] | ''
  onChange: (v: T) => void
  multi?: boolean
}) {
  const isSelected = (v: T) =>
    multi ? (value as T[]).includes(v) : value === v

  return (
    <View style={chip.row}>
      {options.map(o => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[chip.chip, isSelected(o.value) && chip.chipActive]}
        >
          {o.icon && <Text style={chip.icon}>{o.icon}</Text>}
          <Text style={[chip.label, isSelected(o.value) && chip.labelActive]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const chip = StyleSheet.create({
  row:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 100, backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.borderDefault },
  chipActive: { backgroundColor: 'rgba(232,180,34,0.12)', borderColor: Colors.borderGold },
  icon:       { fontSize: 16 },
  label:      { color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },
  labelActive:{ color: Colors.gold400 },
})

// ── Photo tile ────────────────────────────────────────────
function PhotoTile({ uri, onPress, onRemove, isPrimary }: {
  uri?: string; onPress: () => void; onRemove?: () => void; isPrimary?: boolean
}) {
  return (
    <Pressable onPress={onPress} style={[tile.wrap, isPrimary && tile.primary]}>
      {uri ? (
        <>
          <Image source={{ uri }} style={tile.img} />
          {onRemove && (
            <Pressable onPress={onRemove} style={tile.removeBtn}>
              <Text style={tile.removeIcon}>✕</Text>
            </Pressable>
          )}
          {isPrimary && (
            <View style={tile.badge}>
              <Text style={tile.badgeText}>Main</Text>
            </View>
          )}
        </>
      ) : (
        <View style={tile.empty}>
          <Text style={tile.plus}>+</Text>
        </View>
      )}
    </Pressable>
  )
}

const tile = StyleSheet.create({
  wrap:       { width: '31%', aspectRatio: 0.75, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.borderDefault, backgroundColor: Colors.surfaceRaised },
  primary:    { borderColor: Colors.borderGold, borderWidth: 2 },
  img:        { width: '100%', height: '100%' },
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plus:       { fontSize: 28, color: Colors.textTertiary, fontWeight: '300' },
  removeBtn:  { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  removeIcon: { color: 'white', fontSize: 11, fontWeight: '700' },
  badge:      { position: 'absolute', bottom: 6, left: 6, backgroundColor: Colors.gold500, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:  { color: Colors.stone950, fontSize: 10, fontWeight: '700' },
})

// ── Main screen ───────────────────────────────────────────
export default function OnboardingScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const slideAnim = useRef(new Animated.Value(0)).current

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<OnboardingData>({
    displayName: '',
    birthday:    '',
    gender:      '',
    lookingFor:  '',
    bio:         '',
    photos:      [],
  })

  // Date parts
  const [day,   setDay]   = useState('')
  const [month, setMonth] = useState('')
  const [year,  setYear]  = useState('')

  const animateNext = (dir: 1 | -1) => {
    slideAnim.setValue(dir * 40)
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start()
  }

  const goNext = () => {
    animateNext(1)
    setStep(s => s + 1)
  }

  const goBack = () => {
    if (step === 1) return
    animateNext(-1)
    setStep(s => s - 1)
  }

  const canContinue = (): boolean => {
    if (step === 1) return data.displayName.trim().length >= 2
    if (step === 2) return day.length > 0 && month.length > 0 && year.length === 4
    if (step === 3) return data.gender !== ''
    if (step === 4) return data.lookingFor !== ''
    if (step === 5) return data.bio.trim().length >= 20
    if (step === 6) return data.photos.length >= 2
    return false
  }

  const pickPhoto = async () => {
    if (data.photos.length >= 6) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [3, 4], quality: 0.85,
    })
    if (!result.canceled && result.assets[0]) {
      setData(d => ({ ...d, photos: [...d.photos, result.assets[0].uri] }))
    }
  }

  const removePhoto = (index: number) => {
    setData(d => ({ ...d, photos: d.photos.filter((_, i) => i !== index) }))
  }

  const submit = async () => {
    setSaving(true)
    try {
      const birthday = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
      await api.post('/profiles/onboarding', {
        displayName: data.displayName.trim(),
        birthday,
        gender:     data.gender,
        lookingFor: data.lookingFor,
        bio:        data.bio.trim(),
        // photos are uploaded separately via the media service
      })
      router.replace('/(tabs)/discover')
    } catch {
      Alert.alert('Something went wrong', 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const stepContent = () => {
    switch (step) {

      // ── Step 1: Name ───────────────────────────────────
      case 1: return (
        <>
          <Text style={s.stepTitle}>What's your name?</Text>
          <Text style={s.stepSub}>This is how you'll appear to others.</Text>
          <TextInput
            style={[shared.input, s.nameInput]}
            value={data.displayName}
            onChangeText={v => setData(d => ({ ...d, displayName: v }))}
            placeholder="Your first name"
            placeholderTextColor={Colors.textTertiary}
            autoFocus
            maxLength={32}
            autoCapitalize="words"
            {...inputProps}
          />
          <Text style={s.hint}>This cannot be changed later.</Text>
        </>
      )

      // ── Step 2: Birthday ───────────────────────────────
      case 2: return (
        <>
          <Text style={s.stepTitle}>Your birthday</Text>
          <Text style={s.stepSub}>You must be 18+ to use Dating App.</Text>
          <View style={s.dateRow}>
            <TextInput
              style={[shared.input, s.dateDay]}
              value={day} onChangeText={setDay}
              placeholder="DD" placeholderTextColor={Colors.textTertiary}
              keyboardType="number-pad" maxLength={2}
              {...inputProps}
            />
            <TextInput
              style={[shared.input, s.dateMonth]}
              value={month} onChangeText={setMonth}
              placeholder="MM" placeholderTextColor={Colors.textTertiary}
              keyboardType="number-pad" maxLength={2}
              {...inputProps}
            />
            <TextInput
              style={[shared.input, s.dateYear]}
              value={year} onChangeText={setYear}
              placeholder="YYYY" placeholderTextColor={Colors.textTertiary}
              keyboardType="number-pad" maxLength={4}
              {...inputProps}
            />
          </View>
          <Text style={s.hint}>Your age is shown publicly. Your full birthday is private.</Text>
        </>
      )

      // ── Step 3: Gender ─────────────────────────────────
      case 3: return (
        <>
          <Text style={s.stepTitle}>How do you identify?</Text>
          <Text style={s.stepSub}>Choose what feels right.</Text>
          <ChipGroup
            options={[
              { value: 'man',       label: 'Man',        icon: '👨' },
              { value: 'woman',     label: 'Woman',      icon: '👩' },
              { value: 'nonbinary', label: 'Non-binary', icon: '🌈' },
              { value: 'other',     label: 'Other',      icon: '✨' },
            ]}
            value={data.gender}
            onChange={v => setData(d => ({ ...d, gender: v as Gender }))}
          />
          <Text style={s.hint}>Visible on your profile. You can change this later.</Text>
        </>
      )

      // ── Step 4: Looking for ────────────────────────────
      case 4: return (
        <>
          <Text style={s.stepTitle}>Who are you looking for?</Text>
          <Text style={s.stepSub}>We'll use this to show you relevant profiles.</Text>
          <ChipGroup
            options={[
              { value: 'women',    label: 'Women',   icon: '👩' },
              { value: 'men',      label: 'Men',     icon: '👨' },
              { value: 'everyone', label: 'Everyone',icon: '🌍' },
            ]}
            value={data.lookingFor}
            onChange={v => setData(d => ({ ...d, lookingFor: v as Looking }))}
          />
        </>
      )

      // ── Step 5: Bio ────────────────────────────────────
      case 5: return (
        <>
          <Text style={s.stepTitle}>About you</Text>
          <Text style={s.stepSub}>Write something that shows your personality.</Text>
          <TextInput
            style={[shared.input, s.bioInput]}
            value={data.bio}
            onChangeText={v => setData(d => ({ ...d, bio: v }))}
            placeholder="I love hiking, trying new restaurants, and long conversations over coffee..."
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={300}
            textAlignVertical="top"
            {...inputProps}
          />
          <Text style={[s.hint, { textAlign: 'right' }]}>{data.bio.length} / 300</Text>
        </>
      )

      // ── Step 6: Photos ─────────────────────────────────
      case 6: return (
        <>
          <Text style={s.stepTitle}>Add your photos</Text>
          <Text style={s.stepSub}>Add at least 2 photos. The first is your main photo.</Text>
          <View style={s.photoGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <PhotoTile
                key={i}
                uri={data.photos[i]}
                isPrimary={i === 0}
                onPress={data.photos[i] ? () => {} : pickPhoto}
                onRemove={data.photos[i] ? () => removePhoto(i) : undefined}
              />
            ))}
          </View>
          <Text style={s.hint}>
            Clear, well-lit photos get 3× more matches. No sunglasses on your main photo!
          </Text>
        </>
      )
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.surfaceBase }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={goBack} style={s.backBtn} hitSlop={12}>
          {step > 1
            ? <Text style={s.backIcon}>←</Text>
            : <Text style={s.backIcon} />
          }
        </Pressable>
        <ProgressBar step={step} />
        <Text style={s.stepCount}>{step}/{TOTAL_STEPS}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
          {stepContent()}
        </Animated.View>
      </ScrollView>

      {/* Footer CTA */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step < TOTAL_STEPS ? (
          <Pressable
            onPress={canContinue() ? goNext : undefined}
            style={[shared.btnGold, s.ctaBtn, !canContinue() && s.ctaBtnDisabled]}
          >
            <Text style={s.ctaBtnText}>Continue</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={canContinue() && !saving ? submit : undefined}
            style={[shared.btnGold, s.ctaBtn, shadow.goldLg, (!canContinue() || saving) && s.ctaBtnDisabled]}
          >
            <Text style={s.ctaBtnText}>{saving ? 'Saving...' : 'Start Discovering  ◆'}</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  backBtn:   { width: 32 },
  backIcon:  { color: Colors.textSecondary, fontSize: 20 },
  stepCount: { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 11, width: 32, textAlign: 'right' },

  body:      { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },

  stepTitle: { color: Colors.textPrimary, fontSize: 32, fontWeight: '800', letterSpacing: -0.8, marginBottom: 8 },
  stepSub:   { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 32 },
  hint:      { color: Colors.textTertiary, fontFamily: 'monospace', fontSize: 11, lineHeight: 17, marginTop: 12 },

  nameInput: { fontSize: 22, fontWeight: '600', paddingVertical: 18, marginBottom: 0 },

  dateRow:   { flexDirection: 'row', gap: 10 },
  dateDay:   { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '600', paddingVertical: 16 },
  dateMonth: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '600', paddingVertical: 16 },
  dateYear:  { flex: 2, textAlign: 'center', fontSize: 18, fontWeight: '600', paddingVertical: 16 },

  bioInput:  { height: 160, paddingTop: 14, fontSize: 15, lineHeight: 22 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  footer:    { paddingHorizontal: 24, paddingTop: 12 },
  ctaBtn:    { width: '100%', borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  ctaBtnDisabled: { opacity: 0.38 },
  ctaBtnText:{ color: Colors.stone950, fontWeight: '700', fontSize: 16 },
})
