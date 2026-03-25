import React from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
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
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'
import { haptic } from '../../lib/haptics'

type LucideIcon = React.ComponentType<{ color: string; size: number }>

interface MoreRow {
  label: string
  subtitle: string
  Icon: LucideIcon
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
        iconColor: '#0ea5e9',
        route: '/(owner)/fleet',
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
        iconColor: '#22c55e',
        route: '/(owner)/invoices',
      },
      {
        label: 'CRM',
        subtitle: 'Customer management',
        Icon: Users,
        iconColor: '#8b5cf6',
        route: '/(owner)/crm',
      },
      {
        label: 'Payroll',
        subtitle: 'Driver pay',
        Icon: DollarSign,
        iconColor: '#f59e0b',
        route: '/(owner)/payroll',
      },
      {
        label: 'AI Documents',
        subtitle: 'Smart doc reading',
        Icon: Sparkles,
        iconColor: '#ec4899',
        route: '/(owner)/ai-documents',
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
        iconColor: '#f97316',
        route: '/(owner)/trucks',
      },
      {
        label: 'Compliance',
        subtitle: 'Docs & expiry',
        Icon: ShieldCheck,
        iconColor: '#06b6d4',
        route: '/(owner)/compliance',
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
        iconColor: '#64748b',
        route: '/(owner)/settings/team',
      },
      {
        label: 'Account & Subscription',
        subtitle: 'Plan & billing',
        Icon: CreditCard,
        iconColor: '#a78bfa',
        route: '/(owner)/settings/account',
      },
    ],
  },
]

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export default function MoreScreen() {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Page header */}
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>More</Text>
            <Text style={styles.pageSubtitle}>Features &amp; settings</Text>
          </View>

          {SECTIONS.map((section, sectionIndex) => (
            <View key={section.header}>
              <Text
                style={[
                  styles.sectionHeader,
                  sectionIndex === 0 ? styles.sectionHeaderFirst : styles.sectionHeaderRest,
                ]}
              >
                {section.header}
              </Text>
              <View style={styles.card}>
                {section.rows.map((row, rowIndex) => (
                  <View key={row.route}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.row,
                        pressed && styles.rowPressed,
                      ]}
                      onPress={() => {
                        haptic.light()
                        router.push(row.route as any)
                      }}
                    >
                      {/* Left icon */}
                      <View
                        style={[
                          styles.iconWrap,
                          { backgroundColor: hexToRgba(row.iconColor, 0.15) },
                        ]}
                      >
                        <row.Icon color={row.iconColor} size={20} />
                      </View>

                      {/* Center text */}
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>{row.label}</Text>
                        <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                      </View>

                      {/* Right chevron */}
                      <ChevronRight color="#334155" size={18} />
                    </Pressable>

                    {/* Separator (not after last row) */}
                    {rowIndex < section.rows.length - 1 && (
                      <View style={styles.separator} />
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}

          <View style={styles.bottomPad} />
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  pageHeader: {
    paddingTop: 20,
    paddingBottom: 4,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionHeaderFirst: {
    marginTop: 16,
  },
  sectionHeaderRest: {
    marginTop: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowPressed: {
    backgroundColor: '#243447',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  separator: {
    height: 1,
    backgroundColor: '#334155',
    marginLeft: 68,
  },
  bottomPad: {
    height: 32,
  },
})
