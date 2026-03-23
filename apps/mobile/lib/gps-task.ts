import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'
import { apiClient } from '@drivecommand/api-client'
import { sessionStorage, kvStorage } from './storage'

export const GPS_TASK_NAME = 'DRIVECOMMAND_GPS_BACKGROUND'

TaskManager.defineTask(GPS_TASK_NAME, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
  if (error) {
    console.error('GPS task error:', error)
    return
  }

  const { locations } = data
  if (!locations || locations.length === 0) return

  const session = sessionStorage.get()
  if (!session) return

  const location = locations[locations.length - 1]
  const trackingToken = kvStorage.getString('gps_tracking_token') ?? ''

  try {
    await apiClient.reportGPS(session.token, {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      speed: location.coords.speed ?? undefined,
      heading: location.coords.heading ?? undefined,
      altitude: location.coords.altitude ?? undefined,
      trackingToken,
    })
  } catch {
    // GPS reports are best-effort — don't crash the background task on failure
  }
})
