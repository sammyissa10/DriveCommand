import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as Location from 'expo-location'
import Toast from 'react-native-toast-message'
import { haptic } from '../../../lib/haptics'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AlertOctagon, AlertTriangle, ChevronLeft, HelpCircle, ShieldAlert, Wrench } from 'lucide-react-native'
import { driverApi, type IncidentCategory, type IncidentSeverity } from '@drivecommand/api-client'
import { useAuthContext } from '../../../context/AuthContext'
import { SeverityToggle } from '../../../components/driver/SeverityToggle'
import { IncidentPhotoCapture } from '../../../components/driver/IncidentPhotoCapture'
import { uploadPhotoToS3 } from '../../../lib/upload'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { useThemeColors } from '../../../constants/tokens'

// ---------------------------------------------------------------------------
// Category data
// ---------------------------------------------------------------------------

interface CategoryOption {
  key: IncidentCategory
  label: string
  icon: React.ReactNode
}

const CATEGORIES: CategoryOption[] = [
  { key: 'ACCIDENT', label: 'Accident', icon: <AlertTriangle color="#f87171" size={20} /> },
  { key: 'VIOLATION', label: 'Violation', icon: <ShieldAlert color="#fb923c" size={20} /> },
  { key: 'MECHANICAL', label: 'Mechanical Issue', icon: <Wrench color="#fbbf24" size={20} /> },
  { key: 'HAZARD', label: 'Hazard', icon: <AlertOctagon color="#a78bfa" size={20} /> },
  { key: 'OTHER', label: 'Other', icon: <HelpCircle color="#94a3b8" size={20} /> },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewIncidentScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { token } = useAuthContext()

  // Form state
  const [category, setCategory] = useState<IncidentCategory | null>(null)
  const [severity, setSeverity] = useState<IncidentSeverity | null>(null)
  const [description, setDescription] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [locationStatus, setLocationStatus] = useState<'getting' | 'available' | 'unavailable'>('getting')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitLabel, setSubmitLabel] = useState('Submit Report')

  // Category picker modal
  const [categoryModalVisible, setCategoryModalVisible] = useState(false)

  // GPS location on mount
  const locationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchLocation() {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync()
        if (!granted || cancelled) {
          if (!cancelled) setLocationStatus('unavailable')
          return
        }

        locationTimeoutRef.current = setTimeout(() => {
          if (!cancelled) setLocationStatus('unavailable')
        }, 10000)

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })

        if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current)
        if (cancelled) return

        setLatitude(pos.coords.latitude)
        setLongitude(pos.coords.longitude)
        setLocationStatus('available')
      } catch {
        if (!cancelled) setLocationStatus('unavailable')
      }
    }

    fetchLocation()

    return () => {
      cancelled = true
      if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!category) newErrors.category = 'Select a category'
    if (!severity) newErrors.severity = 'Select severity level'
    if (!description || description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    if (!validate()) return
    if (!token) return

    setIsSubmitting(true)
    setSubmitLabel('Submitting...')

    try {
      let photoS3Key: string | null = null

      if (photoUri) {
        setSubmitLabel('Uploading photo...')
        photoS3Key = await uploadPhotoToS3(photoUri, token)
      }

      setSubmitLabel('Creating report...')
      await driverApi.createIncident(token, {
        category: category!,
        severity: severity!,
        description: description.trim(),
        latitude,
        longitude,
        photoS3Key,
      })

      await haptic.success()

      Toast.show({
        type: 'success',
        text1: 'Incident Reported',
        text2: 'Your report has been submitted successfully.',
      })

      router.back()
    } catch (err) {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Submission Failed',
        text2: err instanceof Error ? err.message : 'An unexpected error occurred',
      })
      setIsSubmitting(false)
      setSubmitLabel('Submit Report')
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const selectedCategory = CATEGORIES.find((cat) => cat.key === category)

  function locationText() {
    if (locationStatus === 'getting') return 'Getting location...'
    if (locationStatus === 'unavailable') return 'Location unavailable'
    if (latitude !== null && longitude !== null) {
      return `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`
    }
    return 'Location unavailable'
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View className="flex-row items-center mb-6">
            <Pressable
              onPress={() => router.back()}
              className="mr-3 p-2 active:opacity-60"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronLeft color={c.textSecondary} size={24} />
            </Pressable>
            <View>
              <Text className="text-2xl font-bold" style={{ color: c.textPrimary }}>Report Incident</Text>
              <Text className="text-sm mt-0.5" style={{ color: c.textSecondary }}>Submit a safety or compliance report</Text>
            </View>
          </View>

          {/* Category */}
          <View className="mb-5">
            <Text className="font-semibold text-sm mb-2" style={{ color: c.textSecondary }}>
              Category <Text className="text-red-400">*</Text>
            </Text>
            <Pressable
              onPress={() => setCategoryModalVisible(true)}
              className="flex-row items-center justify-between rounded-xl px-4 py-3.5 active:opacity-80"
              style={{
                backgroundColor: c.surfaceInput,
                borderWidth: 1,
                borderColor: errors.category ? '#ef4444' : c.border,
              }}
            >
              {selectedCategory ? (
                <View className="flex-row items-center gap-2">
                  {selectedCategory.icon}
                  <Text className="text-base" style={{ color: c.textPrimary }}>{selectedCategory.label}</Text>
                </View>
              ) : (
                <Text className="text-base" style={{ color: c.textMuted }}>Select a category...</Text>
              )}
              <ChevronLeft
                color={c.textTertiary}
                size={18}
                style={{ transform: [{ rotate: '-90deg' }] }}
              />
            </Pressable>
            {errors.category ? (
              <Text className="text-red-500 text-xs mt-1">{errors.category}</Text>
            ) : null}
          </View>

          {/* Severity */}
          <View className="mb-5">
            <Text className="font-semibold text-sm mb-2" style={{ color: c.textSecondary }}>
              Severity <Text className="text-red-400">*</Text>
            </Text>
            <SeverityToggle value={severity} onChange={setSeverity} />
            {errors.severity ? (
              <Text className="text-red-500 text-xs mt-1">{errors.severity}</Text>
            ) : null}
          </View>

          {/* Description */}
          <View className="mb-5">
            <Text className="font-semibold text-sm mb-2" style={{ color: c.textSecondary }}>
              Description <Text className="text-red-400">*</Text>
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              maxLength={500}
              placeholder="Describe the incident..."
              placeholderTextColor={c.textMuted}
              className="rounded-xl px-4 py-3 text-base"
              style={{
                minHeight: 100,
                textAlignVertical: 'top',
                backgroundColor: c.surfaceInput,
                borderWidth: 1,
                borderColor: errors.description ? '#ef4444' : c.border,
                color: c.textPrimary,
              }}
            />
            <View className="flex-row justify-between mt-1">
              <View>
                {errors.description ? (
                  <Text className="text-red-500 text-xs">{errors.description}</Text>
                ) : null}
              </View>
              <Text className="text-xs" style={{ color: c.textTertiary }}>{description.length}/500</Text>
            </View>
          </View>

          {/* Location */}
          <View className="mb-5">
            <Text className="font-semibold text-sm mb-2" style={{ color: c.textSecondary }}>Location</Text>
            <View
              className="rounded-xl px-4 py-3.5"
              style={{ backgroundColor: c.surfaceInput, borderWidth: 1, borderColor: c.border }}
            >
              <Text
                className="text-sm"
                style={{ color: locationStatus === 'available' ? c.textSecondary : c.textTertiary }}
              >
                {locationText()}
              </Text>
            </View>
          </View>

          {/* Photo */}
          <View className="mb-8">
            <Text className="font-semibold text-sm mb-2" style={{ color: c.textSecondary }}>Photo</Text>
            <IncidentPhotoCapture
              photoUri={photoUri}
              onPhotoSelected={setPhotoUri}
              onPhotoRemoved={() => setPhotoUri(null)}
            />
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            className="rounded-xl items-center justify-center py-4 active:opacity-80"
            style={{ backgroundColor: isSubmitting ? c.brandDark : c.brand }}
          >
            {isSubmitting ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color="#ffffff" size="small" />
                <Text className="font-bold text-base" style={{ color: '#ffffff' }}>{submitLabel}</Text>
              </View>
            ) : (
              <Text className="font-bold text-base" style={{ color: '#ffffff' }}>{submitLabel}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category Picker Modal */}
      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/60"
          onPress={() => setCategoryModalVisible(false)}
        />
        <View
          className="rounded-t-3xl px-6 pt-6 pb-10"
          style={{ backgroundColor: c.surfaceCard, borderTopWidth: 1, borderTopColor: c.border }}
        >
          {/* Handle */}
          <View className="self-center w-12 h-1 rounded-full mb-6" style={{ backgroundColor: c.border }} />

          <Text className="text-xl font-bold mb-4" style={{ color: c.textPrimary }}>Select Category</Text>

          <View className="gap-1">
            {CATEGORIES.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setCategory(opt.key)
                  setErrors((prev) => ({ ...prev, category: '' }))
                  setCategoryModalVisible(false)
                }}
                className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:opacity-80"
                style={category === opt.key ? { backgroundColor: c.surfaceElevated } : undefined}
              >
                {opt.icon}
                <Text
                  className="text-base font-medium"
                  style={{ color: category === opt.key ? c.textPrimary : c.textSecondary }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
