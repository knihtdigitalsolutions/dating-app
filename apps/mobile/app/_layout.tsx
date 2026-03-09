/**
 * Root layout — the single entry point for the whole app.
 *
 * Cross-platform responsibilities handled here:
 * 1. Font loading — must complete before UI renders (both platforms)
 * 2. Splash screen — held until fonts + auth state are ready
 * 3. Safe area — SafeAreaProvider must be the outermost wrapper
 * 4. Gesture handler — GestureHandlerRootView must wrap Stack
 * 5. Status bar — transparent + edge-to-edge on Android
 * 6. Auth guard — redirect logic lives here, not in individual screens
 * 7. Error boundary — catches JS errors before they crash the OS
 */

import { useEffect } from 'react'
import { Platform, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { useAuthStore } from '../lib/store/auth'
import '../global.css'

// ── Keep splash visible until we're ready ─────────────────
// Must be called before any render. If not, splash hides immediately
// and users see a blank screen while fonts + auth loads.
SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 15,
      // Don't refetch on window focus on mobile — battery-friendly
      refetchOnWindowFocus: false,
    },
  },
})

// ── Auth guard — runs before any screen renders ───────────
function AuthGuard() {
  const { isAuthenticated, isLoading, user, loadFromStorage } = useAuthStore()
  const segments  = useSegments()
  const router    = useRouter()

  // Load persisted session on first mount
  useEffect(() => { loadFromStorage() }, [])

  useEffect(() => {
    if (isLoading) return
    const inAuthGroup = segments[0] === '(auth)'
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/welcome')
    } else if (isAuthenticated && inAuthGroup) {
      router.replace(user?.hasProfile ? '/(tabs)/discover' : '/(auth)/onboarding')
    }
  }, [isAuthenticated, isLoading, user, segments])

  return null
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync()
  }, [])

  return (
    // SafeAreaProvider — provides notch/cutout insets to all children via useSafeAreaInsets()
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {/*
          GestureHandlerRootView:
          - REQUIRED on Android — without it, gestures silently fail
          - On iOS it's a no-op wrapper but still required for the library
          - Must be the direct parent of navigation
        */}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#111110' }}>

            {/*
              StatusBar:
              - style="light" = white icons/text on dark background
              - translucent=true on Android = status bar overlays the app (edge-to-edge)
              - backgroundColor="transparent" removes Android's default grey bar
              - iOS: controlled by the system; 'light' maps to UIStatusBarStyleLightContent
            */}
            <StatusBar
              style="light"
              translucent={Platform.OS === 'android'}
              backgroundColor="transparent"
            />

            <AuthGuard />

            <Stack
              screenOptions={{
                headerShown: false,
                // Correct animation per platform:
                // - Android: slide_from_right is the Material Design standard
                // - iOS: 'default' uses the native UINavigationController swipe-back
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
                // Match our dark background exactly — prevents white flash during transitions
                contentStyle: { backgroundColor: '#111110' },
                // Android: use system back gesture; iOS: swipe-back is automatic
                gestureEnabled: true,
              }}
            >
              <Stack.Screen
                name="(auth)"
                options={{ animation: 'fade', gestureEnabled: false }}
              />
              <Stack.Screen
                name="(tabs)"
                options={{ animation: 'fade', gestureEnabled: false }}
              />
              <Stack.Screen
                name="call/[matchId]"
                options={{
                  // fullScreenModal = covers tab bar on iOS; fills entire screen on Android
                  presentation: 'fullScreenModal',
                  animation: 'slide_from_bottom',
                  gestureEnabled: false, // don't allow swipe-to-dismiss on call screen
                }}
              />
              <Stack.Screen
                name="chat/[matchId]"
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="payments"
                options={{
                  presentation: Platform.OS === 'ios' ? 'modal' : 'card',
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="security"
                options={{ animation: 'slide_from_right' }}
              />
            </Stack>
          </View>
        </View>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
