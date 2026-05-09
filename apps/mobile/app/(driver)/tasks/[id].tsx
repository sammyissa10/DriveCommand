import { useLocalSearchParams } from 'expo-router'
import { TaskActionScreen } from '../../../components/driver/workflows/TaskActionDispatcher'

export default function TaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <TaskActionScreen stepInstanceId={id ?? ''} />
}
