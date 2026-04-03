import React from 'react'
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThemeColors } from '../../constants/tokens'

export default function MapScreen() {
  const c = useThemeColors()
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }}>
      <View className="flex-1 items-center justify-center">
        <Text style={{ color: c.textTertiary }}>Map loading...</Text>
      </View>
    </SafeAreaView>
  )
}
