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

export default function NewTruckScreen() {
  const router = useRouter()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

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
      Toast.show({ type: 'success', text1: 'Truck added', text2: 'The truck has been added to your fleet.', visibilityTime: 3000 })
      router.back()
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
        <Text className="text-lg font-bold text-slate-100 flex-1">Add Truck</Text>
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
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              Vehicle Information
            </Text>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField label="Make" required>
                  <TextInput
                    className={inputClass}
                    placeholder="e.g. Peterbilt"
                    placeholderTextColor="#475569"
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
                    className={inputClass}
                    placeholder="e.g. 579"
                    placeholderTextColor="#475569"
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
                className={inputClass}
                placeholder={String(currentYear)}
                placeholderTextColor="#475569"
                value={year}
                onChangeText={setYear}
                keyboardType="numeric"
                maxLength={4}
                editable={!isPending}
              />
            </FormField>

            <FormField label="VIN" required hint="17 characters — no I, O, or Q">
              <TextInput
                className={inputClass}
                placeholder="1HGBH41JXMN109186"
                placeholderTextColor="#475569"
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
                    className={inputClass}
                    placeholder="TX-9034"
                    placeholderTextColor="#475569"
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
                    className={inputClass}
                    placeholder="125000"
                    placeholderTextColor="#475569"
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
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              Documents <Text className="text-slate-600 normal-case tracking-normal">(optional)</Text>
            </Text>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField label="Registration #">
                  <TextInput
                    className={inputClass}
                    placeholder="REG-12345"
                    placeholderTextColor="#475569"
                    value={registrationNumber}
                    onChangeText={setRegistrationNumber}
                    editable={!isPending}
                  />
                </FormField>
              </View>
              <View className="flex-1">
                <FormField label="Reg. Expiry" hint="YYYY-MM-DD">
                  <TextInput
                    className={inputClass}
                    placeholder="2026-12-31"
                    placeholderTextColor="#475569"
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
                    className={inputClass}
                    placeholder="INS-67890"
                    placeholderTextColor="#475569"
                    value={insuranceNumber}
                    onChangeText={setInsuranceNumber}
                    editable={!isPending}
                  />
                </FormField>
              </View>
              <View className="flex-1">
                <FormField label="Ins. Expiry" hint="YYYY-MM-DD">
                  <TextInput
                    className={inputClass}
                    placeholder="2026-12-31"
                    placeholderTextColor="#475569"
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
            className={`rounded-xl py-4 items-center ${isPending ? 'bg-sky-800 opacity-60' : 'bg-sky-600 active:opacity-80'}`}
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
