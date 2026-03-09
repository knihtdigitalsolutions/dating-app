/**
 * lib/platform.ts — Cross-platform helpers
 *
 * React Native has many APIs that behave differently on iOS and Android.
 * This file is the single source of truth for ALL platform differences.
 * Screens import from here instead of sprinkling Platform.select() everywhere.
 *
 * Categories covered:
 * - Design tokens (colours, fonts, radius)
 * - Shadows (iOS shadow* props vs Android elevation)
 * - Ripple (Android-only touch feedback)
 * - Keyboard behaviour
 * - Hit slop (accessible tap targets)
 * - Text input quirks
 * - Haptics (safe wrapper — not available everywhere)
 * - Accessibility helpers
 * - Shared StyleSheet patterns
 */

import { Platform, StyleSheet, Vibration } from 'react-native'
import * as Haptics from 'expo-haptics'

// ─────────────────────────────────────────────────────────
// PLATFORM BOOLEANS
// ─────────────────────────────────────────────────────────

export const isIOS     = Platform.OS === 'ios'
export const isAndroid = Platform.OS === 'android'
export const isWeb     = Platform.OS === 'web'

// Android API level — useful for edge cases
export const ANDROID_VERSION = Platform.OS === 'android'
  ? (Platform.Version as number)
  : 0

// Android 12+ (API 31) supports monochromatic adaptive icons and predictive back
export const IS_ANDROID_12_PLUS = ANDROID_VERSION >= 31
// Android 13+ (API 33) allows per-app notification permission
export const IS_ANDROID_13_PLUS = ANDROID_VERSION >= 33

// ─────────────────────────────────────────────────────────
// DESIGN TOKENS — mirrors web globals.css @theme
// ─────────────────────────────────────────────────────────

export const Colors = {
  // ── Gold ──────────────────────────────────────────────
  gold50:  '#fffdf0',
  gold100: '#fef9d3',
  gold200: '#fdf0a0',
  gold300: '#fce26a',
  gold400: '#f9ce3a',
  gold500: '#e8b422',   // ← primary accent
  gold600: '#c99510',
  gold700: '#a57509',
  gold800: '#7e580a',
  gold900: '#5c3f0b',
  gold950: '#341f04',

  // ── Stone / warm gray ─────────────────────────────────
  stone50:  '#fafaf9',
  stone100: '#f5f5f4',
  stone200: '#e7e5e4',
  stone300: '#d6d3d1',
  stone400: '#a8a29e',
  stone500: '#78716c',
  stone600: '#57534e',
  stone700: '#44403c',
  stone800: '#292524',
  stone900: '#1c1917',
  stone950: '#0c0a09',

  // ── App surfaces ───────────────────────────────────────
  surfaceBase:    '#111110',
  surfaceRaised:  '#1a1917',
  surfaceOverlay: '#242220',
  surfaceSubtle:  '#2e2c29',

  // ── Text ──────────────────────────────────────────────
  textPrimary:   '#f5f5f4',
  textSecondary: '#a8a29e',
  textTertiary:  '#57534e',

  // ── Status ────────────────────────────────────────────
  success: '#4ade80',
  warning: '#fbbf24',
  danger:  '#f87171',
  info:    '#60a5fa',

  // ── Borders ───────────────────────────────────────────
  borderSubtle:  'rgba(255,255,255,0.06)',
  borderDefault: 'rgba(255,255,255,0.10)',
  borderStrong:  'rgba(255,255,255,0.18)',
  borderGold:    'rgba(232,180,34,0.30)',
} as const

// ─────────────────────────────────────────────────────────
// FONTS
// ─────────────────────────────────────────────────────────

// On Android, font family names must exactly match the filename
// (without extension) as registered in app.json expo-font config.
// On iOS, use the PostScript name from the font file.
// We use the same filename convention on both, so these are identical —
// but we keep Platform.select for future divergence.
export const Fonts = {
  sans:        Platform.select({ ios: 'Geist-Regular',           android: 'Geist-Regular',          default: 'System' })!,
  sansMedium:  Platform.select({ ios: 'Geist-Medium',            android: 'Geist-Medium',           default: 'System' })!,
  sansSemi:    Platform.select({ ios: 'Geist-SemiBold',          android: 'Geist-SemiBold',         default: 'System' })!,
  sansBold:    Platform.select({ ios: 'Geist-Bold',              android: 'Geist-Bold',             default: 'System' })!,
  display:     Platform.select({ ios: 'PlayfairDisplay-Bold',    android: 'PlayfairDisplay-Bold',   default: 'serif'   })!,
  mono:        Platform.select({ ios: 'GeistMono-Regular',       android: 'GeistMono-Regular',      default: 'monospace' })!,
} as const

// ─────────────────────────────────────────────────────────
// SHADOWS
// ─────────────────────────────────────────────────────────
//
// iOS:     shadowColor, shadowOffset, shadowOpacity, shadowRadius
// Android: elevation (single number, cannot be coloured until API 28)
//
// NOTE: For Android-coloured glows (e.g. gold shadow), we use a
// workaround View with a tinted background at very low opacity
// behind the element. Pure CSS doesn't support it below API 28.

export const shadow = {
  none: {},

  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.30,
      shadowRadius: 3,
    },
    android: { elevation: 2 },
    default: {},
  }),

  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.40,
      shadowRadius: 8,
    },
    android: { elevation: 5 },
    default: {},
  }),

  lg: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.50,
      shadowRadius: 16,
    },
    android: { elevation: 10 },
    default: {},
  }),

  gold: Platform.select({
    ios: {
      shadowColor: Colors.gold500,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
    },
    // Android elevation can't be gold-coloured. Use higher elevation
    // to compensate for the visual depth we lose without the tint.
    android: { elevation: 8 },
    default: {},
  }),

  goldLg: Platform.select({
    ios: {
      shadowColor: Colors.gold500,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.55,
      shadowRadius: 20,
    },
    android: { elevation: 12 },
    default: {},
  }),
} as const

// ─────────────────────────────────────────────────────────
// ANDROID RIPPLE
// ─────────────────────────────────────────────────────────
//
// Android: Pressable android_ripple shows a Material ink ripple on tap.
// iOS:     This prop is ignored — iOS uses opacity (activeOpacity).
// We always pass it; iOS silently ignores it.

export const ripple = (
  color = 'rgba(255,255,255,0.08)',
  borderless = false,
  radius?: number,
) => ({
  color,
  borderless,
  ...(radius ? { radius } : {}),
  // Ripple is only visually active on Android — on iOS this object is ignored
  foreground: false,
})

// ─────────────────────────────────────────────────────────
// KEYBOARD BEHAVIOUR
// ─────────────────────────────────────────────────────────
//
// KeyboardAvoidingView behaviour:
// - 'padding' (iOS): adds padding to push content above keyboard
// - 'height' (Android): reduces height of the view
// 'padding' on Android causes layout jumps. 'height' on iOS doesn't push correctly.

export const keyboardBehavior = Platform.select<'padding' | 'height' | 'position'>({
  ios:     'padding',
  android: 'height',
  default: 'padding',
})

// ─────────────────────────────────────────────────────────
// HIT SLOP — accessible touch targets
// ─────────────────────────────────────────────────────────
//
// WCAG 2.5.5 recommends minimum 44×44 dp touch targets.
// Many icon buttons are 24-32dp, so we add hit slop.

export const hitSlop = {
  xs: { top:  4, right:  4, bottom:  4, left:  4 },
  sm: { top:  8, right:  8, bottom:  8, left:  8 },
  md: { top: 12, right: 12, bottom: 12, left: 12 },
  lg: { top: 16, right: 16, bottom: 16, left: 16 },
} as const

// ─────────────────────────────────────────────────────────
// TEXT INPUT — cross-platform normalization
// ─────────────────────────────────────────────────────────
//
// Android adds a blue underline and default padding that we always want off.
// These props should go on every TextInput.

export const inputProps = {
  // Remove blue underline on Android
  underlineColorAndroid: 'transparent',
  // Remove default Android padding
  style: Platform.OS === 'android' ? { paddingVertical: 0 } : {},
  // Cursor colour (Android only, no-op on iOS)
  cursorColor: Colors.gold500,
  // Consistent selection highlight
  selectionColor: 'rgba(232,180,34,0.35)',
} as const

// OTP / SMS autofill — platform-specific props
export const otpInputProps = {
  keyboardType: 'number-pad' as const,
  maxLength: 6,
  textContentType: 'oneTimeCode' as const,            // iOS: triggers SMS autofill
  autoComplete: (Platform.OS === 'android'            // Android: triggers SMS autofill
    ? 'sms-otp'
    : 'one-time-code') as 'sms-otp' | 'one-time-code',
  underlineColorAndroid: 'transparent',
  returnKeyType: 'done' as const,
}

// ─────────────────────────────────────────────────────────
// HAPTICS — safe wrappers
// ─────────────────────────────────────────────────────────
//
// Haptics work on:
// - iOS: all physical devices (not simulator)
// - Android: most devices with Android 8+ (API 26) — falls back to Vibration
// - Android emulator: not supported — always wrap in try/catch
// - Web: not supported

export async function hapticLight() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  } catch {
    // Silently fail — haptics are an enhancement, not required
    if (isAndroid) {
      try { Vibration.vibrate(10) } catch {}
    }
  }
}

export async function hapticMedium() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  } catch {
    if (isAndroid) {
      try { Vibration.vibrate(30) } catch {}
    }
  }
}

export async function hapticHeavy() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
  } catch {
    if (isAndroid) {
      try { Vibration.vibrate(50) } catch {}
    }
  }
}

export async function hapticSuccess() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  } catch {
    if (isAndroid) {
      try { Vibration.vibrate([0, 30, 40, 30]) } catch {}
    }
  }
}

export async function hapticWarning() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  } catch {
    if (isAndroid) {
      try { Vibration.vibrate([0, 50, 30, 50]) } catch {}
    }
  }
}

export async function hapticError() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  } catch {
    if (isAndroid) {
      try { Vibration.vibrate([0, 40, 20, 40, 20, 40]) } catch {}
    }
  }
}

// ─────────────────────────────────────────────────────────
// ACCESSIBILITY HELPERS
// ─────────────────────────────────────────────────────────

/** Creates standard accessibility props for a button */
export const a11yButton = (label: string, hint?: string) => ({
  accessible: true,
  accessibilityRole: 'button' as const,
  accessibilityLabel: label,
  ...(hint ? { accessibilityHint: hint } : {}),
})

/** Creates accessibility props for an image */
export const a11yImage = (description: string) => ({
  accessible: true,
  accessibilityRole: 'image' as const,
  accessibilityLabel: description,
})

/** Creates accessibility props for a link */
export const a11yLink = (label: string) => ({
  accessible: true,
  accessibilityRole: 'link' as const,
  accessibilityLabel: label,
})

// ─────────────────────────────────────────────────────────
// STATUS BAR HEIGHT FALLBACK
// ─────────────────────────────────────────────────────────
//
// Only use as a fallback when useSafeAreaInsets() isn't available.
// Prefer useSafeAreaInsets().top in all components.

export const STATUS_BAR_HEIGHT = Platform.select({
  ios:     44,
  android: 24,
  default: 24,
})

// ─────────────────────────────────────────────────────────
// SHARED STYLESHEETS
// ─────────────────────────────────────────────────────────
//
// Common patterns used by multiple screens.
// Defined here once with correct cross-platform values.

export const styles = StyleSheet.create({

  // ── Surfaces ──────────────────────────────────────────
  card: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },

  cardGold: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    ...Platform.select({
      ios:     { shadowColor: Colors.gold500, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.30, shadowRadius: 10 },
      android: { elevation: 5 },
    }),
  },

  // ── Buttons ───────────────────────────────────────────
  btnGold: {
    backgroundColor: Colors.gold500,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    ...Platform.select({
      ios:     { shadowColor: Colors.gold500, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.40, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },

  btnGhost: {
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
  },

  btnGoldText: {
    color: Colors.stone950,
    fontSize: 15,
    fontFamily: Fonts.sansBold,
    letterSpacing: 0.2,
  },

  btnGhostText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: Fonts.sans,
  },

  // ── Inputs ────────────────────────────────────────────
  input: {
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    paddingHorizontal: 16,
    // Android adds extra internal padding — we normalize it
    paddingVertical: Platform.OS === 'android' ? 10 : 12,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: Fonts.sans,
    // Android underline removal must be in StyleSheet AND on the component
    ...Platform.select({ android: { paddingTop: 10, paddingBottom: 10 } }),
  },

  // ── Typography ────────────────────────────────────────
  overline: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: Colors.textTertiary,
  },

  heading1: {
    fontFamily: Fonts.sansBold,
    fontSize: 32,
    letterSpacing: -0.5,
    color: Colors.textPrimary,
    lineHeight: 38,
  },

  heading2: {
    fontFamily: Fonts.sansBold,
    fontSize: 24,
    letterSpacing: -0.3,
    color: Colors.textPrimary,
    lineHeight: 30,
  },

  bodyText: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  monoText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },

  // ── Layout ────────────────────────────────────────────
  separator: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
  },

  screen: {
    flex: 1,
    backgroundColor: Colors.surfaceBase,
  },

  center: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.surfaceBase,
  },

  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },

  // ── Badges ────────────────────────────────────────────
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },

  badgeText: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
})
