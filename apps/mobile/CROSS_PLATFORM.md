# Mobile App — iOS & Android Compatibility Guide

## How this app handles cross-platform differences

Every meaningful platform difference is handled in `lib/platform.ts`. Screens never use `Platform.select()` directly — they import from platform.ts instead. This keeps the decision in one place and means changing platform behaviour only requires editing one file.

---

## Fonts

**Problem:** React Native doesn't auto-load custom fonts. Both iOS and Android need them loaded explicitly before rendering.

**Solution:** The root `_layout.tsx` uses `expo-font`'s `useFonts()` hook with all 7 font files. It holds the splash screen open using `expo-splash-screen` until fonts are loaded. If a font file is missing, the app falls back to system fonts and logs a warning — it does **not** crash.

Font files go in `assets/fonts/`. See `assets/fonts/README.md` for download links.

---

## Splash Screen

**Problem:** Without splash screen management, users see a white or black flash while fonts and auth state load.

**Solution:** `SplashScreen.preventAutoHideAsync()` is called before any component renders (at module level in `_layout.tsx`). `SplashScreen.hideAsync()` is called via the root View's `onLayout` callback only after fonts are loaded. This ensures zero flash on both platforms.

---

## Status Bar & Edge-to-Edge

**iOS:** The status bar is automatically transparent and overlays content. `useSafeAreaInsets().top` gives the correct inset.

**Android:** Before API 30, Android had a coloured status bar. We set `translucent={true}` and `backgroundColor="transparent"` on `<StatusBar>` to enable edge-to-edge (content renders behind the status bar). The `edgeToEdgeEnabled: true` in `app.json` enables this for API 29+. All screens use `useSafeAreaInsets().top` as top padding.

---

## Safe Area Insets

Every screen uses `useSafeAreaInsets()` from `react-native-safe-area-context`. Never hardcode status bar height.

```tsx
const insets = useSafeAreaInsets()

// Correct
<View style={{ paddingTop: insets.top + 16 }}>

// Wrong — hardcoded values break on many devices
<View style={{ paddingTop: 60 }}>
```

The custom tab bar uses `insets.bottom` for its padding, so it correctly clears:
- iPhone Home Indicator (~34px)
- Android gesture navigation bar (~24px)
- Android with hardware buttons (~0px)

---

## Shadows

iOS and Android handle depth completely differently:

```tsx
// iOS only — Android ignores these
shadowColor, shadowOffset, shadowOpacity, shadowRadius

// Android only — iOS ignores this
elevation
```

**Solution:** `platform.ts` exports a `shadow` object with Platform.select values:

```tsx
import { shadow } from '../../lib/platform'

<View style={[styles.card, shadow.md]} />
<View style={[styles.logo, shadow.gold]} />
```

Note: Android `elevation` cannot be a colour (only available from API 28 with some ROM support). Gold-coloured shadows are iOS-only.

---

## Touch Feedback

**iOS:** Uses opacity (`activeOpacity` on TouchableOpacity, or the default Pressable opacity)
**Android:** Uses ripple effect (Material Design)

**Solution:** Always provide `android_ripple` to `<Pressable>`. iOS silently ignores it.

```tsx
import { ripple } from '../../lib/platform'

<Pressable
  onPress={handlePress}
  android_ripple={ripple(Colors.borderSubtle, true)}  // borderless ripple
>
```

The `ripple()` helper always returns a valid object. On iOS, React Native ignores the `android_ripple` prop entirely.

---

## Keyboard Behaviour

**Problem:** `KeyboardAvoidingView` behaves differently per platform.

- `behavior="padding"` — works correctly on iOS. On Android it causes layout jumps.
- `behavior="height"` — works correctly on Android. On iOS it doesn't push content up properly.

**Solution:** `keyboardBehavior` from `platform.ts`:

```tsx
import { keyboardBehavior } from '../../lib/platform'

<KeyboardAvoidingView behavior={keyboardBehavior}>
```

All chat/form screens use this.

---

## Text Input

Several Android-specific issues:

1. **Blue underline:** Android adds a blue underline to all TextInputs. Removed with `underlineColorAndroid="transparent"`.
2. **Internal padding:** Android has extra internal top/bottom padding. Normalized in `styles.input` in platform.ts.
3. **Cursor color:** Set to gold on Android via `cursorColor`.

**Solution:** Use `styles.input` from platform.ts for all text inputs, plus set `underlineColorAndroid="transparent"` inline on the component (StyleSheet props don't fully remove it on all Android versions).

---

## OTP / SMS Autofill

Both platforms support automatic SMS code detection:

```tsx
// iOS — triggers the "Verification Code" suggestion on the keyboard
textContentType="oneTimeCode"

// Android — triggers autofill from SMS inbox  
autoComplete="sms-otp"
```

The `otpInputProps` helper in platform.ts provides both at once.

---

## Haptics

Haptics behave differently across platforms:

- **iOS physical device:** Full haptic feedback engine (Taptic Engine)
- **iOS Simulator:** Haptics silently fail
- **Android API 26+:** `performHapticFeedback()` via Expo Haptics
- **Android emulator:** Haptics silently fail
- **Android API < 26:** Falls back to `Vibration.vibrate()`
- **Web:** Not supported

**Solution:** All haptic calls go through the safe wrappers in platform.ts (`hapticLight`, `hapticMedium`, `hapticHeavy`, `hapticSuccess`, `hapticWarning`, `hapticError`). These wrap everything in try/catch and fall back to Vibration on Android. Screens never import `expo-haptics` directly.

---

## Navigation Animations

- **iOS:** `'default'` — uses the native UINavigationController slide + swipe-back gesture
- **Android:** `'slide_from_right'` — Material Design standard push animation

Set in the root `_layout.tsx` Stack screenOptions via `Platform.OS`.

Full-screen modal (`call/[matchId]`) uses `presentation: 'fullScreenModal'` which correctly covers the tab bar on both platforms.

---

## Permissions

### iOS
Permissions are prompted at runtime when first needed. All `NSxxxUsageDescription` strings are set in `app.json` `ios.infoPlist`. Without these strings, Apple rejects the app at review.

### Android
Permissions are declared in `app.json` `android.permissions`. Dangerous permissions (CAMERA, LOCATION, etc.) are prompted at runtime via `expo-camera`, `expo-location`, etc. From Android 13+, media permissions (`READ_MEDIA_IMAGES`) replace `READ_EXTERNAL_STORAGE`.

---

## Gestures (Swipe Cards)

The swipe card on the Discover screen uses:
- `react-native-gesture-handler` — required on both platforms
- `react-native-reanimated` — required on both platforms
- `GestureHandlerRootView` in root layout — **required on Android**; without it, gestures silently fail

---

## Notifications

Push notifications are configured in `app.json`. The notification icon (`notification-icon.png`) must be a **white icon on transparent background** for Android (Google requirement). On iOS, any icon works.

---

## Deep Links

Configured in `app.json` with `intentFilters` for Android (replaces AndroidManifest intent-filter) and the `scheme: "dating"` for both platforms.

---

## Build Commands

```bash
# Development build (iOS Simulator)
eas build --profile development --platform ios

# Development build (Android APK for device)
eas build --profile development --platform android

# Preview build (internal testing)
eas build --profile preview --platform all

# Production build
eas build --profile production --platform all

# Submit to stores
eas submit --profile production --platform all
```
