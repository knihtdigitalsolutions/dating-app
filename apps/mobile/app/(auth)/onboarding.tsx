import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  Alert, ScrollView, KeyboardAvoidingView, StyleSheet, Platform
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'

import { api } from '../../lib/api'
import { Colors, keyboardBehavior, styles as shared } from '../../lib/platform'

// Enums directly accessible from your shared package
import { Gender } from '@dating/db'

export default function OnboardingScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Form State
  const [displayName, setDisplayName]   = useState('')
  const [bio, setBio]                   = useState('')
  const [birthDate, setBirthDate]       = useState('1998-04-12') // Simplification: Use a calendar picker in real UI
  const [gender, setGender]             = useState<Gender | null>(null)
  const [interestedIn, setInterestedIn] = useState<Gender[]>([])
  
  // Location and Upload States
  const [locationData, setLocationData] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [submitting, setSubmitting]     = useState(false)

  // Explicit type-safe photo payload structure matching our API expectation
  const [uploadedPhotos] = useState([
    {
      url: 'https://your-s3-bucket-name.s3.amazonaws.com/uploads/temporary-placeholder.jpg',
      storageKey: 'uploads/temporary-placeholder.jpg',
      order: 0,
      isMain: true
    }
  ])

  // Request native hardware location access
  const handleFetchLocation = async () => {
    setLoadingLocation(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need location access to find matches near you.')
        return
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      
      // Reverse geocode coordinates to read actual city string natively
      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      })

      const cityString = geocode ? `${geocode.city || geocode.subregion}, ${geocode.country}` : 'Unknown Location'
      
      setLocationData({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        name: cityString
      })
    } catch (err) {
      Alert.alert('Location Error', 'Could not accurately verify device coordinates.')
    } finally {
      setLoadingLocation(false)
    }
  }

  const toggleInterest = (selectedGender: Gender) => {
    if (interestedIn.includes(selectedGender)) {
      setInterestedIn(interestedIn.filter(g => g !== selectedGender))
    } else {
      setInterestedIn([...interestedIn, selectedGender])
    }
  }

  const handleCompleteOnboarding = async () => {
    if (!displayName || !gender || interestedIn.length === 0 || !locationData) {
      Alert.alert('Missing Info', 'Please fill out all fields and verify your location.')
      return
    }

    setSubmitting(true)
    try {
      // Hits the server handler we built in the previous step
      await api.post('/profile/onboarding', {
        displayName,
        bio,
        birthDate,
        gender,
        interestedIn,
        latitude: locationData.lat,
        longitude: locationData.lng,
        locationName: locationData.name,
        photos: uploadedPhotos // Appends verified S3 object strings 
      })

      // Route straight to discover screen once registration completes successfully
      router.replace('/(tabs)/discover')
    } catch (err: any) {
      Alert.alert('Onboarding Failed', err.response?.data?.error || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={styles.kav}>
      <ScrollView 
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Create your{'\n'}profile</Text>

        {/* Name Input */}
        <View style={styles.inputWrap}>
          <Text style={styles.inputLabel}>DISPLAY NAME</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            style={styles.textInput}
            placeholder="What should people call you?"
            placeholderTextColor={Colors.textTertiary}
          />
        </View>

        {/* Bio Input */}
        <View style={styles.inputWrap}>
          <Text style={styles.inputLabel}>BIO</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={3}
            style={[styles.textInput, { minHeight: 60 }]}
            placeholder="Tell us a bit about yourself..."
            placeholderTextColor={Colors.textTertiary}
          />
        </View>

        {/* Gender Selection */}
        <Text style={styles.sectionLabel}>I AM A</Text>
        <View style={styles.row}>
          {[Gender.MALE, Gender.FEMALE, Gender.NON_BINARY].map(g => (
            <Pressable 
              key={g} 
              onPress={() => setGender(g)}
              style={[styles.choiceBtn, gender === g && styles.choiceBtnActive]}
            >
              <Text style={[styles.choiceText, gender === g && styles.choiceTextActive]}>{g}</Text>
            </Pressable>
          ))}
        </View>

        {/* Interested In Selection */}
        <Text style={styles.sectionLabel}>INTERESTED IN MATCHING WITH</Text>
        <View style={styles.row}>
          {[Gender.MALE, Gender.FEMALE, Gender.NON_BINARY].map(g => {
            const isSelected = interestedIn.includes(g)
            return (
              <Pressable 
                key={g} 
                onPress={() => toggleInterest(g)}
                style={[styles.choiceBtn, isSelected && styles.choiceBtnActive]}
              >
                <Text style={[styles.choiceText, isSelected && styles.choiceTextActive]}>{g}</Text>
              </Pressable>
            )
          })}
        </View>

        {/* Geo-Location Verification Module */}
        <Text style={styles.sectionLabel}>LOCATION SECURITY</Text>
        <Pressable 
          onPress={handleFetchLocation}
          disabled={loadingLocation}
          style={[styles.locationBox, locationData && styles.locationBoxVerified]}
        >
          {loadingLocation ? (
            <ActivityIndicator color={Colors.gold500} />
          ) : (
            <Text style={styles.locationText}>
              {locationData ? `📍 Verified: ${locationData.name}` : 'Verify My Location'}
            </Text>
          )}
        </Pressable>

        {/* Complete Trigger Button */}
        <Pressable
          onPress={handleCompleteOnboarding}
          disabled={submitting}
          style={[shared.btnGold, styles.submitBtn, submitting && styles.btnDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.stone950} />
          ) : (
            <Text style={styles.submitBtnText}>Find Matches</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  kav: { flex: 1, backgroundColor: Colors.surfaceBase },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  title: {
    color: Colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 40,
    marginBottom: 24,
  },
  inputWrap: {
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 16,
  },
  inputLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 10,
  },
  textInput: {
    color: Colors.textPrimary,
    fontSize: 16,
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  choiceBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceOverlay,
    alignItems: 'center',
  },
  choiceBtnActive: {
    borderColor: Colors.borderGold,
    backgroundColor: 'rgba(232,180,34,0.08)',
  },
  choiceText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  choiceTextActive: {
    color: Colors.gold500,
  },
  locationBox: {
    backgroundColor: Colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  locationBoxVerified: {
    borderColor: '#10B981', // Emerald confirmation border
    backgroundColor: 'rgba(16,185,129,0.05)',
  },
  locationText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 'auto',
  },
  btnDisabled: { opacity: 0.5 },
  submitBtnText: {
    color: Colors.stone950,
    fontSize: 16,
    fontWeight: '700',
  }
})