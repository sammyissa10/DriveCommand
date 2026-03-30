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
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronDown } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi, type CustomerOption } from '@drivecommand/api-client'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import { haptic } from '../../../../lib/haptics'

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
  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
        {label}{required && <Text className="text-red-400"> *</Text>}
      </Text>
      {children}
      {hint && <Text className="text-xs text-slate-500 mt-1">{hint}</Text>}
    </View>
  )
}

const inputClass = 'bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm'

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function NewInvoiceScreen() {
  const router = useRouter()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

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
      router.back()
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

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3.5 border-b border-slate-700">
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          className="mr-3"
          hitSlop={8}
          disabled={isPending}
        >
          <ChevronLeft color="#f1f5f9" size={24} />
        </Pressable>
        <Text className="text-lg font-bold text-slate-100 flex-1">New Invoice</Text>
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
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              Invoice Details
            </Text>

            <FormField label="Customer">
              <Pressable
                onPress={() => setCustomerSheetVisible(true)}
                disabled={isPending}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex-row items-center justify-between active:opacity-75"
              >
                <Text className={selectedCustomer ? 'text-white text-sm' : 'text-slate-500 text-sm'}>
                  {selectedCustomer ? selectedCustomer.name : 'Select customer (optional)'}
                </Text>
                <ChevronDown color="#475569" size={16} />
              </Pressable>
            </FormField>

            <FormField label="Description" required>
              <TextInput
                className={inputClass}
                placeholder="e.g. Freight delivery — Dallas to Houston"
                placeholderTextColor="#475569"
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
                    className={inputClass}
                    placeholder="0.00"
                    placeholderTextColor="#475569"
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
                    className={inputClass}
                    placeholder="2026-04-30"
                    placeholderTextColor="#475569"
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
            className={`rounded-xl py-4 items-center ${isPending ? 'bg-sky-800 opacity-60' : 'bg-sky-600 active:opacity-80'}`}
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
              borderBottomColor: '#1e293b',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: '#94a3b8', fontSize: 15 }}>No customer</Text>
            {selectedCustomer === null && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#0284c7' }} />
            )}
          </Pressable>

          {(customers ?? []).map((c) => (
            <Pressable
              key={c.id}
              onPress={() => {
                haptic.light()
                setSelectedCustomer(c)
                setCustomerSheetVisible(false)
              }}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 4,
                borderBottomWidth: 1,
                borderBottomColor: '#1e293b',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ color: '#f1f5f9', fontSize: 15 }}>{c.name}</Text>
              {selectedCustomer?.id === c.id && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#0284c7' }} />
              )}
            </Pressable>
          ))}

          {(customers ?? []).length === 0 && (
            <Text style={{ color: '#64748b', fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>
              No customers found
            </Text>
          )}
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  )
}
