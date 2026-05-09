import React, { useState, useEffect } from 'react'
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
import Toast from 'react-native-toast-message'
import { useMutation } from '@tanstack/react-query'
import { ownerApi, type CreateScheduledServicePayload } from '@drivecommand/api-client'
import { BottomSheet } from '../ui/BottomSheet'
import { MaintenanceServicePicker } from './MaintenanceServicePicker'
import { haptic } from '../../lib/haptics'
import { useThemeColors } from '../../constants/tokens'

interface ScheduleServiceSheetProps {
  visible: boolean
  onClose: () => void
  truckId: string
  token: string
  onSuccess: () => void
}

export function ScheduleServiceSheet({
  visible,
  onClose,
  truckId,
  token,
  onSuccess,
}: ScheduleServiceSheetProps) {
  const c = useThemeColors()
  const [serviceType, setServiceType] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueMileage, setDueMileage] = useState('')
  const [notes, setNotes] = useState('')
  const [pickerVisible, setPickerVisible] = useState(false)

  useEffect(() => {
    if (visible) {
      setServiceType('')
      setDueDate('')
      setDueMileage('')
      setNotes('')
    }
  }, [visible])

  const { mutate, isPending } = useMutation({
    mutationFn: (payload: CreateScheduledServicePayload) =>
      ownerApi.createScheduledService(token, truckId, payload),
    onSuccess: () => {
      haptic.success()
      Toast.show({ type: 'success', text1: 'Service scheduled', text2: 'Scheduled service saved successfully.', visibilityTime: 3000 })
      onSuccess()
      onClose()
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Failed to schedule', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  function handleSubmit() {
    if (!serviceType) {
      Toast.show({ type: 'error', text1: 'Service type required', text2: 'Please select a service type.', visibilityTime: 3000 })
      return
    }
    if (!dueDate.trim() && !dueMileage.trim()) {
      Toast.show({ type: 'error', text1: 'Due trigger required', text2: 'Enter a due date, mileage, or both.', visibilityTime: 3000 })
      return
    }

    const payload: CreateScheduledServicePayload = { serviceType }
    if (dueDate.trim()) payload.dueDate = dueDate.trim()
    if (dueMileage.trim()) {
      const miles = parseInt(dueMileage, 10)
      if (!isNaN(miles) && miles > 0) payload.dueMileage = miles
    }
    if (notes.trim()) payload.notes = notes.trim()

    mutate(payload)
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

  const labelStyle = {
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  }

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Schedule Service" snapPoint="80%">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {/* Service Type */}
            <View className="mb-4">
              <Text style={labelStyle}>Service Type</Text>
              <Pressable
                onPress={() => { haptic.light(); setPickerVisible(true) }}
                style={[inputStyle, { justifyContent: 'center' }]}
                disabled={isPending}
              >
                <Text style={{ color: serviceType ? c.textPrimary : c.textMuted, fontSize: 14 }}>
                  {serviceType || 'Select service type'}
                </Text>
              </Pressable>
            </View>

            {/* Due Date + Due Mileage row */}
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Text style={labelStyle}>Due Date (optional if mileage set)</Text>
                <TextInput
                  style={inputStyle}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={c.textMuted}
                  value={dueDate}
                  onChangeText={setDueDate}
                  keyboardType="numeric"
                  editable={!isPending}
                />
              </View>
              <View className="flex-1">
                <Text style={labelStyle}>Due at Mileage (optional if date set)</Text>
                <TextInput
                  style={inputStyle}
                  placeholder="e.g. 150000"
                  placeholderTextColor={c.textMuted}
                  value={dueMileage}
                  onChangeText={setDueMileage}
                  keyboardType="numeric"
                  editable={!isPending}
                />
              </View>
            </View>

            {/* Notes */}
            <View className="mb-6">
              <Text style={labelStyle}>Notes</Text>
              <TextInput
                style={[inputStyle, { minHeight: 72, textAlignVertical: 'top' }]}
                placeholder="Additional notes..."
                placeholderTextColor={c.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!isPending}
              />
            </View>

            {/* Submit button */}
            <Pressable
              onPress={handleSubmit}
              disabled={isPending}
              className="rounded-xl py-4 items-center"
              style={{ backgroundColor: isPending ? c.brandDark : c.brand, opacity: isPending ? 0.7 : 1 }}
            >
              {isPending
                ? <ActivityIndicator size="small" color="white" />
                : <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Schedule Service</Text>
              }
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </BottomSheet>

      <MaintenanceServicePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={setServiceType}
        selectedType={serviceType}
      />
    </>
  )
}
