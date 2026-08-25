import { Stack } from 'expo-router'
import { useThemeColors } from '../../../constants/tokens'

/**
 * The inspection group's own Stack.
 *
 * It exists so the checklist and the blocked screen are siblings that can
 * `replace` each other without the driver being able to swipe back into a
 * half-finished walkaround from the blocked screen.
 */
export default function InspectionLayout() {
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
