import React, { useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '@/context/AuthContext'
import { carrierDriverApi, type CarrierExpenseSummary } from '@drivecommand/api-client'
import { AnimatedScreen } from '@/components/ui/AnimatedScreen'
import { ExpenseLogForm } from '@/components/carrier/ExpenseLogForm'
import { useThemeColors } from '@/constants/tokens'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatExpenseLabel(expenseType: string): string {
  return expenseType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPaidByLabel(paidBy: string): string {
  return paidBy
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatExpenseDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatAmount(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ExpensesScreen() {
  const c = useThemeColors()
  const { id, stopId } = useLocalSearchParams<{ id: string; stopId?: string }>()
  const { token } = useAuthContext()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scrollRef = useRef<ScrollView>(null)

  const {
    data: dispatch,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['carrier-dispatch', id],
    queryFn: () => carrierDriverApi.getDispatchDetail(token!, id),
    enabled: !!token && !!id,
  })

  const expenses: CarrierExpenseSummary[] = dispatch?.expenses ?? []

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['carrier-dispatch', id] })
  }

  function handleFormSuccess() {
    queryClient.invalidateQueries({ queryKey: ['carrier-dispatch', id] })
    scrollRef.current?.scrollTo({ y: 400, animated: true })
  }

  const dispatchNumber = dispatch?.dispatchNumber ?? `DSP-${id?.slice(0, 8).toUpperCase()}`

  return (
    <AnimatedScreen>
      <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={22} color={c.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Log Expense</Text>
            <Text style={[styles.headerSubtitle, { color: c.textSecondary }]}>
              {dispatchNumber}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={c.brand}
            />
          }
        >
          {/* Form section */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: c.surfaceCard, borderColor: c.border },
            ]}
          >
            <ExpenseLogForm
              dispatchId={id}
              stopId={stopId}
              token={token!}
              onSuccess={handleFormSuccess}
            />
          </View>

          {/* Expenses list section */}
          <View style={styles.listHeader}>
            <Text style={[styles.listTitle, { color: c.textSecondary }]}>Expenses</Text>
            <View style={[styles.countBadge, { backgroundColor: c.mutedBg }]}>
              <Text style={[styles.countText, { color: c.textTertiary }]}>
                {expenses.length}
              </Text>
            </View>
          </View>

          {expenses.length === 0 ? (
            <View
              style={[
                styles.emptyState,
                { backgroundColor: c.surfaceCard, borderColor: c.border },
              ]}
            >
              <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                No expenses logged yet.
              </Text>
            </View>
          ) : (
            <View style={styles.expenseList}>
              {expenses.map((exp) => (
                <View
                  key={exp.id}
                  style={[
                    styles.expenseCard,
                    { backgroundColor: c.surfaceCard, borderColor: c.border },
                  ]}
                >
                  {/* Top row: type badge + amount */}
                  <View style={styles.expenseTopRow}>
                    <View
                      style={[styles.typeBadge, { backgroundColor: c.mutedBg }]}
                    >
                      <Text style={[styles.typeBadgeText, { color: c.textSecondary }]}>
                        {formatExpenseLabel(exp.expenseType)}
                      </Text>
                    </View>
                    <Text style={[styles.amountText, { color: c.textPrimary }]}>
                      {formatAmount(exp.amount)}
                    </Text>
                  </View>

                  {/* Bottom row: paidBy + reimbursable + date */}
                  <View style={styles.expenseBottomRow}>
                    <View style={styles.badgesRow}>
                      <View
                        style={[styles.paidByBadge, { backgroundColor: c.mutedBg }]}
                      >
                        <Text style={[styles.paidByText, { color: c.textTertiary }]}>
                          {formatPaidByLabel(exp.paidBy)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.reimbursableBadge,
                          {
                            backgroundColor: exp.reimbursable
                              ? c.successBg
                              : c.mutedBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.reimbursableText,
                            { color: exp.reimbursable ? c.success : c.textTertiary },
                          ]}
                        >
                          {exp.reimbursable ? 'Reimbursable' : 'Non-reimbursable'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.dateText, { color: c.textTertiary }]}>
                      {formatExpenseDate(exp.createdAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </AnimatedScreen>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  listTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  expenseList: {
    gap: 8,
  },
  expenseCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  expenseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
  },
  expenseBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  paidByBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  paidByText: {
    fontSize: 11,
    fontWeight: '500',
  },
  reimbursableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  reimbursableText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 11,
  },
})
