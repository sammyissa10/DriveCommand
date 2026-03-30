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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi } from '@drivecommand/api-client'
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

export default function NewCustomerScreen() {
  const router = useRouter()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const { mutate: createCustomer, isPending } = useMutation({
    mutationFn: () =>
      ownerApi.createCustomer(token!, {
        companyName: companyName.trim(),
        ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      }),
    onSuccess: () => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['owner-crm'] })
      Toast.show({ type: 'success', text1: 'Customer added', text2: `${companyName.trim()} has been added.`, visibilityTime: 3000 })
      router.back()
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Failed to add customer', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  function handleSubmit() {
    if (!companyName.trim()) {
      Toast.show({ type: 'error', text1: 'Missing fields', text2: 'Company name is required.', visibilityTime: 3000 })
      return
    }
    createCustomer()
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
        <Text className="text-lg font-bold text-slate-100 flex-1">Add Customer</Text>
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
          {/* Customer Information */}
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              Customer Information
            </Text>

            <FormField label="Company Name" required>
              <TextInput
                className={inputClass}
                placeholder="e.g. Acme Logistics"
                placeholderTextColor="#475569"
                value={companyName}
                onChangeText={setCompanyName}
                autoCapitalize="words"
                editable={!isPending}
              />
            </FormField>

            <FormField label="Contact Name">
              <TextInput
                className={inputClass}
                placeholder="e.g. Jane Doe"
                placeholderTextColor="#475569"
                value={contactName}
                onChangeText={setContactName}
                autoCapitalize="words"
                editable={!isPending}
              />
            </FormField>
          </View>

          {/* Contact Details (optional) */}
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              Contact Details <Text className="text-slate-600 normal-case tracking-normal">(optional)</Text>
            </Text>

            <FormField label="Email">
              <TextInput
                className={inputClass}
                placeholder="contact@company.com"
                placeholderTextColor="#475569"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isPending}
              />
            </FormField>

            <FormField label="Phone">
              <TextInput
                className={inputClass}
                placeholder="+1 (555) 000-0000"
                placeholderTextColor="#475569"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                editable={!isPending}
              />
            </FormField>
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
              <Text className="text-white font-semibold text-base">Add Customer</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
