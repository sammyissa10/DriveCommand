import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useThemeColors } from '../../../constants/tokens'

export default function SupportTicketScreen() {
  const c = useThemeColors()
  const router = useRouter()
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }}>
      <View className="flex-row items-center px-4 py-3">
        <Pressable onPress={() => router.back()} className="mr-3 p-1">
          <ArrowLeft color={c.textPrimary} size={22} />
        </Pressable>
        <Text className="text-xl font-bold" style={{ color: c.textPrimary }}>
          Support Ticket
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center" style={{ color: c.textTertiary }}>
          Support ticket submission coming soon.
        </Text>
      </View>
    </SafeAreaView>
  )
}
