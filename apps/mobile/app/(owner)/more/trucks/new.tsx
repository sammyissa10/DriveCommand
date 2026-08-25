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

const currentYear = new Date().getFullYear()

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

export default function NewTruckScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

  function goBack() {
    if (from === 'dashboard') router.replace('/(owner)/' as any)
    else router.back()
  }

  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState(String(currentYear))
  const [vin, setVin] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [odometer, setOdometer] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [registrationExpiry, setRegistrationExpiry] = useState('')
  const [insuranceNumber, setInsuranceNumber] = useState('')
  const [insuranceExpiry, setInsuranceExpiry] = useState('')

  const { mutate: createTruck, isPending } = useMutation({
    mutationFn: () =>
      ownerApi.createTruck(token!, {
        make: make.trim(),
        model: model.trim(),
        year: parseInt(year, 10),
        vin: vin.trim().toUpperCase(),
        licensePlate: licensePlate.trim().toUpperCase(),
        odometer: parseInt(odometer.replace(/,/g, ''), 10),
        ...(registrationNumber ? { registrationNumber: registrationNumber.trim() } : {}),
        ...(registrationExpiry ? { registrationExpiry: registrationExpiry.trim() } : {}),
        ...(insuranceNumber ? { insuranceNumber: insuranceNumber.trim() } : {}),
        ...(insuranceExpiry ? { insuranceExpiry: insuranceExpiry.trim() } : {}),
      }),
    onSuccess: () => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['owner-trucks'] })
      // TKT-0076: the picker keeps a separate cache, so it needs its own nudge.
      queryClient.invalidateQueries({ queryKey: ['owner-truck-options'] })
      Toast.show({ type: 'success', text1: 'Truck added', text2: 'The truck has been added to your fleet.', visibilityTime: 3000 })
      goBack()
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Failed to add truck', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  function handleSubmit() {
    if (!make.trim() || !model.trim() || !year || !vin.trim() || !licensePlate.trim() || !odometer.trim()) {
      Toast.show({ type: 'error', text1: 'Missing fields', text2: 'Please fill in all required fields.', visibilityTime: 3000 })
      return
    }
    const vinStr = vin.trim().toUpperCase()
    if (vinStr.length !== 17 || /[IOQ]/.test(vinStr)) {
      Toast.show({ type: 'error', text1: 'Invalid VIN', text2: 'VIN must be 17 characters and cannot contain I, O, or Q.', visibilityTime: 4000 })
      return
    }
    const yearNum = parseInt(year, 10)
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear + 1) {
      Toast.show({ type: 'error', text1: 'Invalid year', text2: `Year must be between 1900 and ${currentYear + 1}.`, visibilityTime: 3000 })
      return
    }
    const odomNum = parseInt(odometer.replace(/,/g, ''), 10)
    if (isNaN(odomNum) || odomNum < 0) {
      Toast.show({ type: 'error', text1: 'Invalid odometer', text2: 'Enter a valid odometer reading.', visibilityTime: 3000 })
      return
    }
    createTruck()
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
          onPress={() => router.back()}
          className="mr-3"
          hitSlop={8}
          disabled={isPending}
        >
          <ChevronLeft color={c.textPrimary} size={24} />
        </Pressable>
        <Text className="text-lg font-bold flex-1" style={{ color: c.textPrimary }}>Add Truck</Text>
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
          {/* Vehicle Information */}
          <View
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: c.textSecondary }}>
              Vehicle Information
            </Text>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField label="Make" required>
                  <TextInput
                    style={inputStyle}
                    placeholder="e.g. Peterbilt"
                    placeholderTextColor={c.textMuted}
                    value={make}
                    onChangeText={setMake}
                    autoCapitalize="words"
                    editable={!isPending}
                  />
                </FormField>
              </View>
              <View className="flex-1">
                <FormField label="Model" required>
                  <TextInput
                    style={inputStyle}
                    placeholder="e.g. 579"
                    placeholderTextColor={c.textMuted}
                    value={model}
                    onChangeText={setModel}
                    autoCapitalize="words"
                    editable={!isPending}
                  />
                </FormField>
              </View>
            </View>

            <FormField label="Year" required>
              <TextInput
                style={inputStyle}
                placeholder={String(currentYear)}
                placeholderTextColor={c.textMuted}
                value={year}
                onChangeText={setYear}
                keyboardType="numeric"
                maxLength={4}
                editable={!isPending}
              />
            </FormField>

            <FormField label="VIN" required hint="17 characters — no I, O, or Q">
              <TextInput
                style={inputStyle}
                placeholder="1HGBH41JXMN109186"
                placeholderTextColor={c.textMuted}
                value={vin}
                onChangeText={(t) => setVin(t.toUpperCase())}
                autoCapitalize="characters"
                maxLength={17}
                editable={!isPending}
              />
            </FormField>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField label="License Plate" required>
                  <TextInput
                    style={inputStyle}
                    placeholder="TX-9034"
                    placeholderTextColor={c.textMuted}
                    value={licensePlate}
                    onChangeText={(t) => setLicensePlate(t.toUpperCase())}
                    autoCapitalize="characters"
                    editable={!isPending}
                  />
                </FormField>
              </View>
              <View className="flex-1">
                <FormField label="Odometer (mi)" required>
                  <TextInput
                    style={inputStyle}
                    placeholder="125000"
                    placeholderTextColor={c.textMuted}
                    value={odometer}
                    onChangeText={setOdometer}
                    keyboardType="numeric"
                    editable={!isPending}
                  />
                </FormField>
              </View>
            </View>
          </View>

          {/* Documents (optional) */}
          <View
            className="rounded-xl p-4 mb-6"
            style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: c.textSecondary }}>
              Documents <Text style={{ color: c.textTertiary }} className="normal-case tracking-normal">(optional)</Text>
            </Text>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField label="Registration #">
                  <TextInput
                    style={inputStyle}
                    placeholder="REG-12345"
                    placeholderTextColor={c.textMuted}
                    value={registrationNumber}
                    onChangeText={setRegistrationNumber}
                    editable={!isPending}
                  />
                </FormField>
              </View>
              <View className="flex-1">
                <FormField label="Reg. Expiry" hint="YYYY-MM-DD">
                  <TextInput
                    style={inputStyle}
                    placeholder="2026-12-31"
                    placeholderTextColor={c.textMuted}
                    value={registrationExpiry}
                    onChangeText={setRegistrationExpiry}
                    keyboardType="numbers-and-punctuation"
                    editable={!isPending}
                  />
                </FormField>
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField label="Insurance #">
                  <TextInput
                    style={inputStyle}
                    placeholder="INS-67890"
                    placeholderTextColor={c.textMuted}
                    value={insuranceNumber}
                    onChangeText={setInsuranceNumber}
                    editable={!isPending}
                  />
                </FormField>
              </View>
              <View className="flex-1">
                <FormField label="Ins. Expiry" hint="YYYY-MM-DD">
                  <TextInput
                    style={inputStyle}
                    placeholder="2026-12-31"
                    placeholderTextColor={c.textMuted}
                    value={insuranceExpiry}
                    onChangeText={setInsuranceExpiry}
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
              <Text className="text-white font-semibold text-base">Add Truck</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
