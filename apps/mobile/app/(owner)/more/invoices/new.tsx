import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronDown } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi, type CustomerOption } from '@drivecommand/api-client'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import { haptic } from '../../../../lib/haptics'
import { useThemeColors } from '../../../../constants/tokens'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  const c = useThemeColors()
  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: c.textSecondary }}>
        {label}{required && <Text className="text-red-400"> *</Text>}
      </Text>
      {children}
      {hint && <Text className="text-xs mt-1" style={{ color: c.textTertiary }}>{hint}</Text>}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function NewInvoiceScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

  function goBack() {
    if (from === 'dashboard') router.replace('/(owner)/' as any)
    else router.back()
  }

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [customerSheetVisible, setCustomerSheetVisible] = useState(false)

  const { data: customers } = useQuery<CustomerOption[]>({
    queryKey: ['owner-customers'],
    queryFn: () => ownerApi.getCustomers(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const { mutate: createInvoice, isPending } = useMutation({
    mutationFn: () =>
      ownerApi.createInvoice(token!, {
        ...(selectedCustomer ? { customerId: selectedCustomer.id } : {}),
        description: description.trim(),
        amount: parseFloat(amount),
        ...(dueDate.trim() ? { dueDate: dueDate.trim() } : {}),
      }),
    onSuccess: (data) => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['owner-invoices'] })
      Toast.show({ type: 'success', text1: 'Invoice created', text2: `Invoice #${data.invoice.invoiceNumber} created as draft.`, visibilityTime: 3000 })
      goBack()
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Failed to create invoice', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  function handleSubmit() {
    if (!description.trim()) {
      Toast.show({ type: 'error', text1: 'Missing fields', text2: 'Description is required.', visibilityTime: 3000 })
      return
    }
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Enter a valid amount greater than 0.', visibilityTime: 3000 })
      return
    }
    createInvoice()
  }

  const inputStyle = {
    backgroundColor: c.surfaceInput,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  } as const

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3.5"
        style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => goBack()}
          className="mr-3"
          hitSlop={8}
          disabled={isPending}
        >
          <ChevronLeft color={c.textPrimary} size={24} />
        </Pressable>
        <Text className="text-lg font-bold flex-1" style={{ color: c.textPrimary }}>New Invoice</Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Invoice Details */}
          <View
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: c.textSecondary }}>
              Invoice Details
            </Text>

            <FormField label="Customer">
              <Pressable
                onPress={() => setCustomerSheetVisible(true)}
                disabled={isPending}
                className="rounded-xl px-4 py-3 flex-row items-center justify-between active:opacity-75"
                style={{ backgroundColor: c.surfaceInput, borderWidth: 1, borderColor: c.border }}
              >
                <Text style={{ color: selectedCustomer ? c.textPrimary : c.textMuted, fontSize: 14 }}>
                  {selectedCustomer ? selectedCustomer.name : 'Select customer (optional)'}
                </Text>
                <ChevronDown color={c.textTertiary} size={16} />
              </Pressable>
            </FormField>

            <FormField label="Description" required>
              <TextInput
                style={inputStyle}
                placeholder="e.g. Freight delivery — Dallas to Houston"
                placeholderTextColor={c.textMuted}
                value={description}
                onChangeText={setDescription}
                autoCapitalize="sentences"
                editable={!isPending}
                multiline={false}
              />
            </FormField>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField label="Amount ($)" required>
                  <TextInput
                    style={inputStyle}
                    placeholder="0.00"
                    placeholderTextColor={c.textMuted}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    editable={!isPending}
                  />
                </FormField>
              </View>
              <View className="flex-1">
                <FormField label="Due Date" hint="YYYY-MM-DD">
                  <TextInput
                    style={inputStyle}
                    placeholder="2026-04-30"
                    placeholderTextColor={c.textMuted}
                    value={dueDate}
                    onChangeText={setDueDate}
                    keyboardType="numbers-and-punctuation"
                    editable={!isPending}
                  />
                </FormField>
              </View>
            </View>
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={isPending}
            className="rounded-xl py-4 items-center"
            style={{ backgroundColor: isPending ? c.brandDark : c.brand, opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Create Invoice</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Customer picker sheet */}
      <BottomSheet
        visible={customerSheetVisible}
        onClose={() => setCustomerSheetVisible(false)}
        title="Select Customer"
        snapPoint="60%"
      >
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
          {/* No customer option */}
          <Pressable
            onPress={() => {
              setSelectedCustomer(null)
              setCustomerSheetVisible(false)
            }}
            style={{
              paddingVertical: 14,
              paddingHorizontal: 4,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: c.textSecondary, fontSize: 15 }}>No customer</Text>
            {selectedCustomer === null && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.brand }} />
            )}
          </Pressable>

          {(customers ?? []).map((cust) => (
            <Pressable
              key={cust.id}
              onPress={() => {
                haptic.light()
                setSelectedCustomer(cust)
                setCustomerSheetVisible(false)
              }}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 4,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ color: c.textPrimary, fontSize: 15 }}>{cust.name}</Text>
              {selectedCustomer?.id === cust.id && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.brand }} />
              )}
            </Pressable>
          ))}

          {(customers ?? []).length === 0 && (
            <Text style={{ color: c.textTertiary, fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>
              No customers found
            </Text>
          )}
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  )
}
