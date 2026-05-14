import React, { useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Download, AlertTriangle } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { useAuthContext } from '../../../../context/AuthContext'
import { useThemeColors } from '../../../../constants/tokens'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { haptic } from '../../../../lib/haptics'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayComponent {
  id: string
  componentType: string
  description: string | null
  grossAmount: string
  isTaxable: boolean
}

interface Assignment {
  id: string
  payStatus: string
  load: { id: string; referenceNumber: string | null } | null
  payComponents: PayComponent[]
}

interface Bonus {
  id: string
  bonusType: string
  amount: string
  description: string | null
  paidAt: string | null
  installmentNumber: number | null
  totalInstallments: number | null
}

interface Settlement {
  id: string
  status: string
  settlementReference: string | null
  periodStart: string
  periodEnd: string
  grossTaxable: string
  grossNonTaxable: string
  totalDeductions: string
  netPay: string
  pdfUrl: string | null
  finalizedAt: string | null
  paidAt: string | null
  assignments: Assignment[]
  bonuses: Bonus[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(val: string): string {
  const n = parseFloat(val)
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPeriod(start: string, end: string): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(new Date(start))} – ${fmt(new Date(end))}`
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    FINALIZED: 'Finalized',
    PAID: 'Paid',
    VOIDED: 'Voided',
    DISPUTED: 'Disputed',
  }
  return map[status] ?? status
}

function statusColor(status: string, c: ReturnType<typeof useThemeColors>): string {
  switch (status) {
    case 'PAID': return c.success
    case 'FINALIZED': return c.brand
    case 'DISPUTED': return c.warning
    case 'VOIDED': return c.textSecondary
    default: return c.textSecondary
  }
}

function typeLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SettlementDetailScreen() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey: ['driver-settlement', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/driver-pay/me/settlements/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<{ settlement: Settlement }>
    },
    enabled: !!token && !!id,
  })

  const settlement = data?.settlement

  const handleDownloadPdf = async () => {
    if (!settlement?.pdfUrl) return
    haptic.light()
    await WebBrowser.openBrowserAsync(settlement.pdfUrl)
  }

  const handleDisputePress = () => {
    haptic.medium()
    router.push(`/(driver)/pay/settlements/${id}/dispute` as never)
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: c.background }}>
        <ActivityIndicator color={c.brand} />
      </SafeAreaView>
    )
  }

  if (error || !settlement) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }}>
        <View className="flex-row items-center px-4 pt-4 pb-3 gap-3">
          <Pressable
            onPress={() => { haptic.light(); router.back() }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={24} color={c.textPrimary} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base text-center" style={{ color: c.textSecondary }}>
            Settlement not found.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  const totalEarnings = settlement.assignments
    .flatMap((a) => a.payComponents)
    .reduce((sum, c) => sum + parseFloat(c.grossAmount), 0)

  const totalBonuses = settlement.bonuses.reduce(
    (sum, b) => sum + parseFloat(b.amount),
    0,
  )

  const canDispute = settlement.status === 'FINALIZED'
  const disputeWindowPassed =
    settlement.status === 'PAID' || settlement.status === 'VOIDED'

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
          <Pressable
            onPress={() => { haptic.light(); router.back() }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={24} color={c.textPrimary} />
          </Pressable>

          {settlement.pdfUrl && (
            <Pressable
              onPress={handleDownloadPdf}
              className="flex-row items-center gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: c.surfaceCard }}
              accessibilityLabel="Download PDF"
              accessibilityRole="button"
            >
              <Download size={16} color={c.brand} />
              <Text className="text-sm font-medium" style={{ color: c.brand }}>
                PDF
              </Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40, gap: 16, paddingHorizontal: 16 }}
        >
          {/* Settlement header card */}
          <View className="rounded-2xl p-4 gap-3" style={{ backgroundColor: c.surfaceCard }}>
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold" style={{ color: c.textPrimary }}>
                {formatPeriod(settlement.periodStart, settlement.periodEnd)}
              </Text>
              <Text className="text-sm font-medium" style={{ color: statusColor(settlement.status, c) }}>
                {statusLabel(settlement.status)}
              </Text>
            </View>

            {settlement.settlementReference && (
              <Text className="text-xs" style={{ color: c.textSecondary }}>
                Ref: {settlement.settlementReference}
              </Text>
            )}

            {/* Net pay */}
            <View className="items-center py-3">
              <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: c.textSecondary }}>
                Net Pay
              </Text>
              <Text className="text-4xl font-bold" style={{ color: c.textPrimary }}>
                {formatMoney(settlement.netPay)}
              </Text>
            </View>

            {/* Summary row */}
            <View className="flex-row justify-between pt-2 border-t" style={{ borderColor: c.border }}>
              <View className="items-center">
                <Text className="text-xs" style={{ color: c.textSecondary }}>Gross Taxable</Text>
                <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
                  {formatMoney(settlement.grossTaxable)}
                </Text>
              </View>
              <View className="items-center">
                <Text className="text-xs" style={{ color: c.textSecondary }}>Non-Taxable</Text>
                <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
                  {formatMoney(settlement.grossNonTaxable)}
                </Text>
              </View>
              <View className="items-center">
                <Text className="text-xs" style={{ color: c.textSecondary }}>Deductions</Text>
                <Text className="text-sm font-medium" style={{ color: c.danger }}>
                  ({formatMoney(settlement.totalDeductions)})
                </Text>
              </View>
            </View>
          </View>

          {/* Earnings */}
          {settlement.assignments.length > 0 && (
            <View className="rounded-2xl p-4 gap-3" style={{ backgroundColor: c.surfaceCard }}>
              <Text className="text-sm font-semibold" style={{ color: c.textPrimary }}>
                Earnings — {formatMoney(totalEarnings.toFixed(2))}
              </Text>
              {settlement.assignments.map((a) => (
                <View key={a.id}>
                  <Text className="text-xs mb-2" style={{ color: c.textSecondary }}>
                    {a.load?.referenceNumber ?? 'Load'}
                  </Text>
                  {a.payComponents.map((comp) => (
                    <View key={comp.id} className="flex-row justify-between mb-1">
                      <Text className="text-sm" style={{ color: c.textSecondary }}>
                        {comp.description ?? typeLabel(comp.componentType)}
                      </Text>
                      <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
                        {formatMoney(comp.grossAmount)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Bonuses */}
          {settlement.bonuses.length > 0 && (
            <View className="rounded-2xl p-4 gap-3" style={{ backgroundColor: c.surfaceCard }}>
              <Text className="text-sm font-semibold" style={{ color: c.textPrimary }}>
                Bonuses — {formatMoney(totalBonuses.toFixed(2))}
              </Text>
              {settlement.bonuses.map((b) => (
                <View key={b.id} className="flex-row justify-between">
                  <View className="flex-1">
                    <Text className="text-sm" style={{ color: c.textSecondary }}>
                      {typeLabel(b.bonusType)}
                    </Text>
                    {b.installmentNumber && b.totalInstallments && (
                      <Text className="text-xs" style={{ color: c.textTertiary }}>
                        Installment {b.installmentNumber} of {b.totalInstallments}
                      </Text>
                    )}
                  </View>
                  <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
                    {formatMoney(b.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Dispute section */}
          {canDispute && (
            <View className="rounded-2xl p-4 gap-3" style={{ backgroundColor: c.surfaceCard }}>
              <View className="flex-row items-start gap-2">
                <AlertTriangle size={16} color={c.warning} style={{ marginTop: 2 }} />
                <Text className="flex-1 text-sm" style={{ color: c.textSecondary }}>
                  Believe something is incorrect? Disputes are reviewed within 24 hours.
                </Text>
              </View>
              <Pressable
                onPress={handleDisputePress}
                className="items-center justify-center py-3 rounded-xl border"
                style={{ borderColor: c.border }}
                accessibilityLabel="Dispute this settlement"
                accessibilityRole="button"
              >
                <Text className="text-sm font-medium" style={{ color: c.warning }}>
                  Dispute this settlement
                </Text>
              </Pressable>
            </View>
          )}

          {disputeWindowPassed && (
            <View className="rounded-2xl p-4" style={{ backgroundColor: c.surfaceCard }}>
              <Text className="text-sm" style={{ color: c.textSecondary }}>
                This settlement has been {settlement.status === 'PAID' ? 'paid' : 'voided'} and
                is no longer disputable. Contact your dispatcher if you have questions.
              </Text>
            </View>
          )}

          {settlement.status === 'DISPUTED' && (
            <View className="rounded-2xl p-4" style={{ backgroundColor: c.surfaceCard }}>
              <Text className="text-sm" style={{ color: c.warning }}>
                A dispute has been submitted. Your dispatcher will be in touch.
              </Text>
            </View>
          )}
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
