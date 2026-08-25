import { useLocalSearchParams } from 'expo-router'
import { InspectionBlockedScreen } from '../../../components/driver/workflows/InspectionBlockedScreen'

export default function InspectionBlockedRoute() {
  const { dispatchId } = useLocalSearchParams<{ dispatchId: string }>()
  return <InspectionBlockedScreen dispatchId={dispatchId ?? ''} />
}
