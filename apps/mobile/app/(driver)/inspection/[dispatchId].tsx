import { useLocalSearchParams } from 'expo-router'
import { TripInspectionScreen } from '../../../components/driver/workflows/TripInspectionScreen'

export default function TripInspectionRoute() {
  const { dispatchId } = useLocalSearchParams<{ dispatchId: string }>()
  return <TripInspectionScreen dispatchId={dispatchId ?? ''} />
}
