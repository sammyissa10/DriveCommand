import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import Toast from 'react-native-toast-message'
import { carrierDriverApi } from '@drivecommand/api-client'
import { useThemeColors } from '@/constants/tokens'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPENSE_TYPES: { value: string; label: string }[] = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'tolls', label: 'Tolls' },
  { value: 'scales', label: 'Scales' },
  { value: 'lumper', label: 'Lumper' },
  { value: 'parking', label: 'Parking' },
  { value: 'maintenance_emergency', label: 'Emergency Maint.' },
  { value: 'driver_advance', label: 'Driver Advance' },
  { value: 'other', label: 'Other' },
]

const PAID_BY_OPTIONS: { value: string; label: string }[] = [
  { value: 'driver_cash', label: 'Driver Cash' },
  { value: 'company_card', label: 'Company Card' },
  { value: 'fuel_card', label: 'Fuel Card' },
  { value: 'driver_advance', label: 'Driver Advance' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExpenseLogFormProps {
  dispatchId: string
  stopId?: string
  token: string
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpenseLogForm({ dispatchId, stopId, token, onSuccess }: ExpenseLogFormProps) {
  const c = useThemeColors()

  const [expenseType, setExpenseType] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isReimbursable = paidBy === 'driver_cash'
  const isDisabled = !expenseType || !amount || !paidBy || submitting

  function handleSelectExpenseType(value: string) {
    Haptics.selectionAsync()
    setExpenseType(value)
  }

  function handleSelectPaidBy(value: string) {
    Haptics.selectionAsync()
    setPaidBy(value)
  }

  function handleAmountBlur() {
    const parsed = parseFloat(amount)
    if (isNaN(parsed)) {
      setAmount('')
    } else {
      setAmount(parsed.toFixed(2))
    }
  }

  async function handleSubmit() {
    if (isDisabled) return
    setSubmitting(true)
    try {
      await carrierDriverApi.logExpense(token, dispatchId, {
        expenseType,
        amount: parseFloat(amount),
        paidBy,
        reimbursable: isReimbursable,
        notes: notes.trim() || undefined,
        stopId: stopId || undefined,
      })
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setExpenseType('')
      setAmount('')
      setPaidBy('')
      setNotes('')
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to log expense.'
      Toast.show({ type: 'error', text1: 'Error', text2: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.formContainer}>
      {/* Expense Type */}
      <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>Expense Type</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {EXPENSE_TYPES.map((opt) => {
          const selected = expenseType === opt.value
          return (
            <Pressable
              key={opt.value}
              onPress={() => handleSelectExpenseType(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                selected
                  ? { backgroundColor: c.brand }
                  : { backgroundColor: c.surfaceCard, borderColor: c.border },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? '#ffffff' : c.textSecondary },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Amount */}
      <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>Amount</Text>
      <View
        style={[
          styles.amountRow,
          { backgroundColor: c.surfaceCard, borderColor: c.border },
        ]}
      >
        <Text style={[styles.amountPrefix, { color: c.textTertiary }]}>$</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          onBlur={handleAmountBlur}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={c.textTertiary}
          style={[styles.amountInput, { color: c.textPrimary }]}
          accessibilityLabel="Expense amount"
        />
      </View>

      {/* Paid By */}
      <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>Paid By</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {PAID_BY_OPTIONS.map((opt) => {
          const selected = paidBy === opt.value
          return (
            <Pressable
              key={opt.value}
              onPress={() => handleSelectPaidBy(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                selected
                  ? { backgroundColor: c.brand }
                  : { backgroundColor: c.surfaceCard, borderColor: c.border },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? '#ffffff' : c.textSecondary },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Reimbursable badge */}
      {paidBy ? (
        <View style={styles.reimbursableRow}>
          <View
            style={[
              styles.reimbursableBadge,
              {
                backgroundColor: isReimbursable ? c.successBg : c.mutedBg,
              },
            ]}
          >
            <Text
              style={[
                styles.reimbursableText,
                { color: isReimbursable ? c.success : c.textTertiary },
              ]}
            >
              {isReimbursable ? 'Reimbursable' : 'Non-reimbursable'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Notes */}
      <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>Notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Add notes (optional)"
        placeholderTextColor={c.textTertiary}
        multiline
        numberOfLines={3}
        style={[
          styles.notesInput,
          {
            color: c.textPrimary,
            backgroundColor: c.surfaceCard,
            borderColor: c.border,
          },
        ]}
        accessibilityLabel="Expense notes"
      />

      {/* Submit */}
      <Pressable
        onPress={handleSubmit}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel="Log expense"
        style={[
          styles.submitButton,
          { backgroundColor: isDisabled ? c.mutedBg : c.brand },
        ]}
      >
        <Text
          style={[
            styles.submitButtonText,
            { color: isDisabled ? c.textTertiary : '#ffffff' },
          ]}
        >
          {submitting ? 'Logging...' : 'Log Expense'}
        </Text>
      </Pressable>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  formContainer: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  amountPrefix: {
    fontSize: 16,
    fontWeight: '600',
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    padding: 0,
  },
  reimbursableRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  reimbursableBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  reimbursableText: {
    fontSize: 12,
    fontWeight: '600',
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
})
