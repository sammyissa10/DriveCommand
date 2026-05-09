import React from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Sun, Moon, Smartphone, Check } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { haptic } from '../../../../lib/haptics'
import { saveAppearance, getSavedAppearance, type AppearanceMode } from '../../../../lib/appearance'
import { useThemeColors, radii } from '../../../../constants/tokens'

const OPTIONS: { mode: AppearanceMode; label: string; subtitle: string; Icon: React.ComponentType<{ color: string; size: number }> }[] = [
  { mode: 'light',  label: 'Light',  subtitle: 'Always use light mode',            Icon: Sun },
  { mode: 'dark',   label: 'Dark',   subtitle: 'Always use dark mode',             Icon: Moon },
  { mode: 'system', label: 'System', subtitle: "Follow your device's appearance", Icon: Smartphone },
]

export default function AppearanceScreen() {
  const router = useRouter()
  const { setColorScheme } = useColorScheme()
  const c = useThemeColors()

  // Read current saved preference to show initial selection
  const [selected, setSelected] = React.useState<AppearanceMode>(getSavedAppearance)

  function handleSelect(mode: AppearanceMode) {
    haptic.light()
    setSelected(mode)
    saveAppearance(mode)
    setColorScheme(mode)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <Pressable onPress={() => router.back()} style={{ marginRight: 12 }} hitSlop={8}>
            <ChevronLeft color={c.textPrimary} size={24} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '700', color: c.textPrimary }}>Appearance</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Options card */}
          <View
            style={{
              backgroundColor: c.surfaceCard,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: c.border,
              overflow: 'hidden',
            }}
          >
            {OPTIONS.map((option, index) => {
              const isSelected = selected === option.mode
              return (
                <View key={option.mode}>
                  <Pressable
                    onPress={() => handleSelect(option.mode)}
                    android_ripple={{ color: 'rgba(14,165,233,0.1)', borderless: false }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      backgroundColor: isSelected ? 'rgba(14,165,233,0.06)' : 'transparent',
                    }}
                  >
                    {/* Icon */}
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        backgroundColor: isSelected ? 'rgba(14,165,233,0.15)' : c.surfaceElevated,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 14,
                        borderWidth: isSelected ? 1 : 0,
                        borderColor: isSelected ? '#0ea5e9' : 'transparent',
                      }}
                    >
                      <option.Icon
                        color={isSelected ? '#0ea5e9' : c.textSecondary}
                        size={20}
                      />
                    </View>

                    {/* Label + subtitle */}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? '#0ea5e9' : c.textPrimary,
                        }}
                      >
                        {option.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                        {option.subtitle}
                      </Text>
                    </View>

                    {/* Checkmark */}
                    {isSelected ? (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: '#0ea5e9',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check color="#fff" size={13} strokeWidth={3} />
                      </View>
                    ) : (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 1.5,
                          borderColor: c.border,
                        }}
                      />
                    )}
                  </Pressable>

                  {index < OPTIONS.length - 1 && (
                    <View style={{ height: 1, backgroundColor: c.border, marginLeft: 70 }} />
                  )}
                </View>
              )
            })}
          </View>

          {/* Footnote */}
          <Text
            style={{
              fontSize: 12,
              color: c.textTertiary,
              marginTop: 12,
              marginHorizontal: 4,
              lineHeight: 18,
            }}
          >
            System follows your device's appearance setting.
          </Text>
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
