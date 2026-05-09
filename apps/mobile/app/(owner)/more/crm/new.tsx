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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi } from '@drivecommand/api-client'
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

export default function NewCustomerScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

  function goBack() {
    if (from === 'dashboard') router.replace('/(owner)/' as any)
    else router.back()
  }

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
      goBack()
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
        <Text className="text-lg font-bold flex-1" style={{ color: c.textPrimary }}>Add Customer</Text>
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
          <View
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: c.textSecondary }}>
              Customer Information
            </Text>

            <FormField label="Company Name" required>
              <TextInput
                style={inputStyle}
                placeholder="e.g. Acme Logistics"
                placeholderTextColor={c.textMuted}
                value={companyName}
                onChangeText={setCompanyName}
                autoCapitalize="words"
                editable={!isPending}
              />
            </FormField>

            <FormField label="Contact Name">
              <TextInput
                style={inputStyle}
                placeholder="e.g. Jane Doe"
                placeholderTextColor={c.textMuted}
                value={contactName}
                onChangeText={setContactName}
                autoCapitalize="words"
                editable={!isPending}
              />
            </FormField>
          </View>

          {/* Contact Details (optional) */}
          <View
            className="rounded-xl p-4 mb-6"
            style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: c.textSecondary }}>
              Contact Details <Text style={{ color: c.textTertiary }} className="normal-case tracking-normal">(optional)</Text>
            </Text>

            <FormField label="Email">
              <TextInput
                style={inputStyle}
                placeholder="contact@company.com"
                placeholderTextColor={c.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isPending}
              />
            </FormField>

            <FormField label="Phone">
              <TextInput
                style={inputStyle}
                placeholder="+1 (555) 000-0000"
                placeholderTextColor={c.textMuted}
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
            className="rounded-xl py-4 items-center"
            style={{ backgroundColor: isPending ? c.brandDark : c.brand, opacity: isPending ? 0.6 : 1 }}
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
