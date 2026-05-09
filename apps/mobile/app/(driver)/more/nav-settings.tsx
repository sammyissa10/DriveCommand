import React, { useState } from 'react'
import { View, Text, Pressable, ScrollView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Check, ArrowLeft } from 'lucide-react-native'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { haptic } from '../../../lib/haptics'
import { useThemeColors } from '../../../constants/tokens'
import {
  getNavPreference,
  setNavPreference,
  type NavAppPreference,
} from '../../../lib/navigation'

const IOS_OPTIONS: Array<{ value: NavAppPreference; label: string; subtitle: string }> = [
  { value: 'apple', label: 'Apple Maps', subtitle: 'Default iOS navigation' },
  { value: 'google', label: 'Google Maps', subtitle: 'Google turn-by-turn' },
  { value: 'waze', label: 'Waze', subtitle: 'Community-based routing' },
]

export default function NavSettingsScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const [selected, setSelected] = useState<NavAppPreference>(getNavPreference())

  function handleSelect(value: NavAppPreference) {
    haptic.light()
    setSelected(value)
    setNavPreference(value)
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header with back button */}
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => router.back()} className="mr-3 p-1">
            <ArrowLeft color={c.textPrimary} size={22} />
          </Pressable>
          <Text className="text-xl font-bold" style={{ color: c.textPrimary }}>
            Navigation App
          </Text>
        </View>

        <ScrollView className="flex-1 px-4">
          <Text className="text-sm mb-4 mt-1" style={{ color: c.textTertiary }}>
            Choose which app opens for turn-by-turn navigation when you start a load.
          </Text>

          {Platform.OS === 'android' ? (
            <View
              className="rounded-xl p-4"
              style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
            >
              <Text className="text-[15px] font-semibold" style={{ color: c.textPrimary }}>
                Google Maps
              </Text>
              <Text className="text-xs mt-1" style={{ color: c.textTertiary }}>
                Google Maps is used for navigation on Android.
              </Text>
            </View>
          ) : (
            <View
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
            >
              {IOS_OPTIONS.map((option, index) => (
                <View key={option.value}>
                  <Pressable
                    className="flex-row items-center px-4 py-4 active:opacity-75"
                    onPress={() => handleSelect(option.value)}
                  >
                    <View className="flex-1">
                      <Text className="text-[15px] font-semibold" style={{ color: c.textPrimary }}>
                        {option.label}
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: c.textTertiary }}>
                        {option.subtitle}
                      </Text>
                    </View>
                    {selected === option.value && (
                      <Check color="#0ea5e9" size={20} />
                    )}
                  </Pressable>
                  {index < IOS_OPTIONS.length - 1 && (
                    <View className="h-px ml-4" style={{ backgroundColor: c.border }} />
                  )}
                </View>
              ))}
            </View>
          )}

          <View className="h-8" />
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
