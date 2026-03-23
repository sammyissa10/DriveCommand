import { useState, useEffect, useCallback } from 'react'
import * as Location from 'expo-location'
import * as Battery from 'expo-battery'
import { GPS_TASK_NAME } from '../lib/gps-task'
import type { HOSStatus } from '@drivecommand/types'

export type GPSStatus = 'active' | 'paused' | 'no-permission' | 'off'

export function useBackgroundGPS(hosStatus?: HOSStatus) {
  const [gpsStatus, setGPSStatus] = useState<GPSStatus>('off')

  const getInterval = useCallback(async (): Promise<number> => {
    // Active statuses get 30-second intervals; idle statuses get 5-minute intervals
    const isActive = hosStatus === 'DRIVING' || hosStatus === 'ON_DUTY'
    const baseInterval = isActive ? 30_000 : 300_000

    // Battery optimization: drop to 10-minute interval below 20%
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync()
      if (batteryLevel >= 0 && batteryLevel < 0.20) return 600_000
    } catch {
      // Battery API not available on all platforms — continue with base interval
    }

    return baseInterval
  }, [hosStatus])

  const startGPS = useCallback(async () => {
    const { status: fg } = await Location.requestForegroundPermissionsAsync()
    if (fg !== 'granted') {
      setGPSStatus('no-permission')
      return
    }

    const { status: bg } = await Location.requestBackgroundPermissionsAsync()
    if (bg !== 'granted') {
      setGPSStatus('no-permission')
      return
    }

    const interval = await getInterval()
    await Location.startLocationUpdatesAsync(GPS_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: interval,
      distanceInterval: 50, // meters — also trigger on significant movement
      foregroundService: {
        notificationTitle: 'DriveCommand',
        notificationBody: 'Tracking your location for delivery updates',
        notificationColor: '#0ea5e9',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    })
    setGPSStatus('active')
  }, [getInterval])

  const stopGPS = useCallback(async () => {
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME)
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(GPS_TASK_NAME)
      }
    } catch {
      // Ignore errors when stopping — task may already be stopped
    }
    setGPSStatus('off')
  }, [])

  // Start GPS when hook mounts; stop on unmount
  useEffect(() => {
    startGPS()
    return () => {
      stopGPS()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restart with updated interval when HOS status changes
  useEffect(() => {
    const update = async () => {
      try {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME)
        if (isRunning) {
          await stopGPS()
          await startGPS()
        }
      } catch {
        // Ignore errors during restart
      }
    }
    if (hosStatus) update()
  }, [hosStatus, startGPS, stopGPS])

  return { gpsStatus, startGPS, stopGPS }
}
