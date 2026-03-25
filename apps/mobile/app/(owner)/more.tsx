import React from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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
        route: '/(owner)/fleet',
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
        route: '/(owner)/trucks',
      },
      {
        label: 'Compliance',
        subtitle: 'Docs & expiry',
        Icon: ShieldCheck,
        iconBg: 'rgba(6,182,212,0.15)',
        iconColor: '#06b6d4',
        route: '/(owner)/compliance',
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
        route: '/(owner)/invoices',
      },
      {
        label: 'CRM',
        subtitle: 'Customer management',
        Icon: Users,
        iconBg: 'rgba(139,92,246,0.15)',
        iconColor: '#8b5cf6',
        route: '/(owner)/crm',
      },
      {
        label: 'Payroll',
        subtitle: 'Driver pay',
        Icon: DollarSign,
        iconBg: 'rgba(245,158,11,0.15)',
        iconColor: '#f59e0b',
        route: '/(owner)/payroll',
      },
      {
        label: 'AI Documents',
        subtitle: 'Smart doc reading',
        Icon: Sparkles,
        iconBg: 'rgba(236,72,153,0.15)',
        iconColor: '#ec4899',
        route: '/(owner)/ai-documents',
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
        route: '/(owner)/settings/team',
      },
      {
        label: 'Account & Subscription',
        subtitle: 'Plan & billing',
        Icon: CreditCard,
        iconBg: 'rgba(167,139,250,0.15)',
        iconColor: '#a78bfa',
        route: '/(owner)/settings/account',
      },
    ],
  },
]

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
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>More</Text>
            <Text style={styles.pageSubtitle}>Features & settings</Text>
          </View>

          {SECTIONS.map((section, sectionIndex) => (
            <View key={section.header} style={sectionIndex > 0 ? styles.sectionGap : undefined}>
              <Text style={styles.sectionHeader}>{section.header}</Text>
              <View style={styles.card}>
                {section.rows.map((row, rowIndex) => (
                  <View key={row.route}>
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => {
                        haptic.light()
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        router.push(row.route as any)
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.iconWrap, { backgroundColor: row.iconBg }]}>
                        <row.Icon color={row.iconColor} size={20} />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>{row.label}</Text>
                        <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                      </View>
                      <ChevronRight color="#475569" size={18} />
                    </TouchableOpacity>
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
    paddingTop: 20,
  },
  pageHeader: {
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f1f5f9',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  sectionGap: {
    marginTop: 24,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
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
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
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
