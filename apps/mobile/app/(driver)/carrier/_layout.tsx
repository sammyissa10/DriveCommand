import { Stack } from 'expo-router'
import { useThemeColors } from '../../../constants/tokens'

export default function CarrierLayout() {
  const c = useThemeColors()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    />
  )
}
