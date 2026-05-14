import React, { useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { useAuthContext } from '../../../../../context/AuthContext'
import { useThemeColors } from '../../../../../constants/tokens'
import { AnimatedScreen } from '../../../../../components/ui/AnimatedScreen'
import { haptic } from '../../../../../lib/haptics'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'

const MIN_MESSAGE_LEN = 50

const ISSUE_CATEGORIES = [
  { value: 'WRONG_AMOUNT', label: 'Wrong amount' },
  { value: 'MISSING_PAY', label: 'Missing pay' },
  { value: 'WRONG_MILES', label: 'Wrong mileage' },
  { value: 'MISSING_RECEIPT', label: 'Missing receipt reimbursement' },
  { value: 'OTHER', label: 'Other' },
]

export default function DisputeScreen() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [issueCategory, setIssueCategory] = useState('')
  const [driverMessage, setDriverMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = issueCategory.length > 0 && driverMessage.length >= MIN_MESSAGE_LEN

  const handleSubmit = () => {
    if (!canSubmit) return
    haptic.medium()

    Alert.alert(
      'Submit dispute?',
      'This will pause payment and notify your dispatcher.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'destructive',
          onPress: doSubmit,
        },
      ],
    )
  }

  const doSubmit = async () => {
    setIsSubmitting(true)
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/driver-pay/me/settlements/${id}/dispute`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ issueCategory, driverMessage }),
        },
      )

      // TODO: trigger push notification to dispatcher (handled server-side in future task)

      if (!res.ok) {
        const data = await res.json()
        Alert.alert('Error', data.error ?? 'Failed to submit dispute.')
        return
      }

      Alert.alert(
        'Dispute submitted',
        'Sent to your dispatcher. Most disputes get a reply within 24 hours.',
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: c.background }}
      edges={['bottom', 'left', 'right']}
    >
      <AnimatedScreen>
        {/* Header */}
        <View className="flex-row items-center px-4 pt-4 pb-3 gap-3">
          <Pressable
            onPress={() => { haptic.light(); router.back() }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={24} color={c.textPrimary} />
          </Pressable>
          <Text className="text-lg font-semibold" style={{ color: c.textPrimary }}>
            Dispute Settlement
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Issue category picker */}
          <View className="gap-2">
            <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
              Issue category
            </Text>
            <View className="gap-2">
              {ISSUE_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.value}
                  onPress={() => { haptic.light(); setIssueCategory(cat.value) }}
                  className="flex-row items-center px-4 py-3 rounded-xl border"
                  style={{
                    backgroundColor: issueCategory === cat.value ? `${c.brand}20` : c.surfaceCard,
                    borderColor: issueCategory === cat.value ? c.brand : c.border,
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: issueCategory === cat.value }}
                >
                  <View
                    className="w-4 h-4 rounded-full border mr-3 items-center justify-center"
                    style={{
                      borderColor: issueCategory === cat.value ? c.brand : c.border,
                      backgroundColor: issueCategory === cat.value ? c.brand : 'transparent',
                    }}
                  />
                  <Text className="text-sm" style={{ color: c.textPrimary }}>
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Message */}
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
                Describe the issue
              </Text>
              <Text
                className="text-xs"
                style={{
                  color: driverMessage.length >= MIN_MESSAGE_LEN ? c.success : c.textSecondary,
                }}
              >
                {driverMessage.length}/{MIN_MESSAGE_LEN} min
              </Text>
            </View>
            <TextInput
              multiline
              numberOfLines={6}
              placeholder="Explain what you believe is incorrect and provide any relevant details…"
              placeholderTextColor={c.textTertiary}
              value={driverMessage}
              onChangeText={setDriverMessage}
              maxLength={2000}
              style={{
                backgroundColor: c.surfaceCard,
                color: c.textPrimary,
                borderColor: c.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                minHeight: 120,
                textAlignVertical: 'top',
              }}
            />
            {driverMessage.length > 0 && driverMessage.length < MIN_MESSAGE_LEN && (
              <Text className="text-xs" style={{ color: c.warning }}>
                {MIN_MESSAGE_LEN - driverMessage.length} more characters needed
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Submit button */}
        <View className="px-4 pb-6 pt-2">
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="items-center justify-center py-4 rounded-2xl"
            style={{
              backgroundColor: canSubmit && !isSubmitting ? c.brand : c.surfaceCard,
              opacity: canSubmit && !isSubmitting ? 1 : 0.5,
            }}
            accessibilityLabel="Submit dispute"
            accessibilityRole="button"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text
                className="text-base font-semibold"
                style={{ color: canSubmit ? '#ffffff' : c.textSecondary }}
              >
                Submit dispute
              </Text>
            )}
          </Pressable>
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
