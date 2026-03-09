import { Platform } from 'react-native'
import { Tabs } from 'expo-router'
import { View, Text, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Colors, ripple } from '../../lib/platform'

const TABS = [
  { name: 'discover', symbol: '✦', label: 'Discover' },
  { name: 'matches',  symbol: '◈', label: 'Matches'  },
  { name: 'chat',     symbol: '◎', label: 'Messages' },
  { name: 'profile',  symbol: '○', label: 'Profile'  },
]

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  // useSafeAreaInsets returns the correct bottom inset for the device:
  // - iPhone with home indicator: ~34px
  // - iPhone without: ~0px
  // - Android with gesture nav: ~16-24px
  // - Android with buttons: ~0px
  const insets = useSafeAreaInsets()

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: Colors.surfaceRaised,
        borderTopWidth: 1,
        borderTopColor: Colors.borderSubtle,
        // Bottom padding = safe area inset + our own padding
        paddingBottom: insets.bottom + 8,
        paddingTop: 10,
        // Lift tabs above Android gesture bar on edge-to-edge
        ...(Platform.OS === 'android' && { elevation: 8 }),
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find(t => t.name === route.name)
        const focused = state.index === index

        return (
          <Pressable
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            android_ripple={ripple(Colors.borderSubtle, false)}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            style={{
              flex: 1,
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 4,
            }}
          >
            {/* Active indicator dot above icon */}
            <View style={{ height: 3, width: 3, borderRadius: 2, marginBottom: 2,
              backgroundColor: focused ? Colors.gold500 : 'transparent' }} />

            <Text style={{ fontSize: 16, lineHeight: 20 }}>{tab?.symbol}</Text>

            <Text style={{
              fontSize: 10,
              letterSpacing: 0.4,
              fontFamily: 'monospace',
              color: focused ? Colors.gold500 : Colors.textTertiary,
            }}>
              {tab?.label?.toUpperCase()}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="matches" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}
