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
  ChevronRight,
  MessageSquare,
  FileText,
  Users,
  DollarSign,
  Sparkles,
  Truck,
  ShieldCheck,
  Shield,
  CreditCard,
} from 'lucide-react-native'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { haptic } from '../../../lib/haptics'

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
    header: 'COMMUNICATIONS',
    rows: [
      {
        label: 'Messages',
        subtitle: 'Fleet messaging',
        Icon: MessageSquare,
        iconBg: 'rgba(14,165,233,0.15)',
        iconColor: '#0ea5e9',
        route: '/(owner)/more/fleet',
      },
    ],
  },
  {
    header: 'FLEET',
    rows: [
      {
        label: 'Trucks',
        subtitle: 'Vehicle management',
        Icon: Truck,
        iconBg: 'rgba(249,115,22,0.15)',
        iconColor: '#f97316',
        route: '/(owner)/more/trucks',
      },
      {
        label: 'Compliance',
        subtitle: 'Docs & expiry',
        Icon: ShieldCheck,
        iconBg: 'rgba(6,182,212,0.15)',
        iconColor: '#06b6d4',
        route: '/(owner)/more/compliance',
      },
    ],
  },
  {
    header: 'BUSINESS',
    rows: [
      {
        label: 'Invoices',
        subtitle: 'Billing & payments',
        Icon: FileText,
        iconBg: 'rgba(34,197,94,0.15)',
        iconColor: '#22c55e',
        route: '/(owner)/more/invoices',
      },
      {
        label: 'CRM',
        subtitle: 'Customer management',
        Icon: Users,
        iconBg: 'rgba(139,92,246,0.15)',
        iconColor: '#8b5cf6',
        route: '/(owner)/more/crm',
      },
      {
        label: 'Payroll',
        subtitle: 'Driver pay',
        Icon: DollarSign,
        iconBg: 'rgba(245,158,11,0.15)',
        iconColor: '#f59e0b',
        route: '/(owner)/more/payroll',
      },
      {
        label: 'AI Documents',
        subtitle: 'Smart doc reading',
        Icon: Sparkles,
        iconBg: 'rgba(236,72,153,0.15)',
        iconColor: '#ec4899',
        route: '/(owner)/more/ai-documents',
      },
    ],
  },
  {
    header: 'SETTINGS',
    rows: [
      {
        label: 'Team Permissions',
        subtitle: 'Roles & access',
        Icon: Shield,
        iconBg: 'rgba(100,116,139,0.15)',
        iconColor: '#94a3b8',
        route: '/(owner)/more/settings/team',
      },
      {
        label: 'Account & Subscription',
        subtitle: 'Plan & billing',
        Icon: CreditCard,
        iconBg: 'rgba(167,139,250,0.15)',
        iconColor: '#a78bfa',
        route: '/(owner)/more/settings/account',
      },
    ],
  },
]

export default function MoreScreen() {
  const router = useRouter()

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-5">
            <Text className="text-2xl font-extrabold text-slate-100">More</Text>
            <Text className="text-[13px] text-slate-500 mt-0.5">Features & settings</Text>
          </View>

          {SECTIONS.map((section, sectionIndex) => (
            <View key={section.header} className={sectionIndex > 0 ? 'mt-6' : ''}>
              <Text className="text-[11px] font-semibold text-slate-500 tracking-widest uppercase mb-2">
                {section.header}
              </Text>
              <View className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
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
                        <Text className="text-[15px] font-semibold text-slate-100">{row.label}</Text>
                        <Text className="text-xs text-slate-500 mt-0.5">{row.subtitle}</Text>
                      </View>
                      <ChevronRight color="#475569" size={18} />
                    </Pressable>
                    {rowIndex < section.rows.length - 1 && (
                      <View className="h-px bg-slate-700 ml-[68px]" />
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
