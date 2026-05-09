import React from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  FileText,
  LifeBuoy,
  Navigation,
  Palette,
} from 'lucide-react-native'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { haptic } from '../../../lib/haptics'
import { useThemeColors } from '../../../constants/tokens'

type LucideIcon = React.ComponentType<{ color: string; size: number }>

interface MoreRow {
  label: string
  subtitle: string
  Icon: LucideIcon
  iconBg: string
  iconColor: string
  route: string
}

interface MoreSection {
  header: string
  rows: MoreRow[]
}

const SECTIONS: MoreSection[] = [
  {
    header: 'DRIVING',
    rows: [
      {
        label: 'Hours of Service',
        subtitle: 'HOS log & status',
        Icon: Clock,
        iconBg: 'rgba(14,165,233,0.15)',
        iconColor: '#0ea5e9',
        route: '/(driver)/hos',
      },
    ],
  },
  {
    header: 'DOCUMENTS',
    rows: [
      {
        label: 'My Documents',
        subtitle: 'Licenses & permits',
        Icon: FileText,
        iconBg: 'rgba(34,197,94,0.15)',
        iconColor: '#22c55e',
        route: '/(driver)/documents',
      },
    ],
  },
  {
    header: 'SAFETY',
    rows: [
      {
        label: 'Incidents',
        subtitle: 'Report a safety event',
        Icon: AlertTriangle,
        iconBg: 'rgba(239,68,68,0.15)',
        iconColor: '#ef4444',
        route: '/(driver)/incidents',
      },
    ],
  },
  {
    header: 'SUPPORT',
    rows: [
      {
        label: 'Support Ticket',
        subtitle: 'Report an issue or get help',
        Icon: LifeBuoy,
        iconBg: 'rgba(251,146,60,0.15)',
        iconColor: '#fb923c',
        route: '/(driver)/more/support-ticket',
      },
    ],
  },
  {
    header: 'SETTINGS',
    rows: [
      {
        label: 'Navigation App',
        subtitle: 'Choose turn-by-turn app',
        Icon: Navigation,
        iconBg: 'rgba(139,92,246,0.15)',
        iconColor: '#8b5cf6',
        route: '/(driver)/more/nav-settings',
      },
      {
        label: 'Appearance',
        subtitle: 'Light, dark, or system theme',
        Icon: Palette,
        iconBg: 'rgba(100,116,139,0.15)',
        iconColor: '#94a3b8',
        route: '/(driver)/more/appearance',
      },
    ],
  },
]

export default function DriverMoreScreen() {
  const c = useThemeColors()
  const router = useRouter()

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-5">
            <Text className="text-2xl font-extrabold" style={{ color: c.textPrimary }}>More</Text>
            <Text className="text-[13px] mt-0.5" style={{ color: c.textTertiary }}>Features & settings</Text>
          </View>

          {SECTIONS.map((section, sectionIndex) => (
            <View key={section.header} className={sectionIndex > 0 ? 'mt-6' : ''}>
              <Text
                className="text-[11px] font-semibold tracking-widest uppercase mb-2"
                style={{ color: c.textTertiary }}
              >
                {section.header}
              </Text>
              <View
                className="rounded-xl overflow-hidden"
                style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
              >
                {section.rows.map((row, rowIndex) => (
                  <View key={row.route}>
                    <Pressable
                      className="flex-row items-center px-3.5 py-3.5 active:opacity-75"
                      onPress={() => {
                        haptic.light()
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        router.push(row.route as any)
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-[10px] items-center justify-center mr-3.5 shrink-0"
                        style={{ backgroundColor: row.iconBg }}
                      >
                        <row.Icon color={row.iconColor} size={20} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[15px] font-semibold" style={{ color: c.textPrimary }}>{row.label}</Text>
                        <Text className="text-xs mt-0.5" style={{ color: c.textTertiary }}>{row.subtitle}</Text>
                      </View>
                      <ChevronRight color={c.textTertiary} size={18} />
                    </Pressable>
                    {rowIndex < section.rows.length - 1 && (
                      <View className="h-px ml-[68px]" style={{ backgroundColor: c.border }} />
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}

          <View className="h-8" />
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
