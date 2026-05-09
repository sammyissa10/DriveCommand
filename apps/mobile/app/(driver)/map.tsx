import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Mapbox, {
  MapView,
  Camera,
  UserLocation,
  UserTrackingMode,
  UserLocationRenderMode,
  ShapeSource,
  LineLayer,
  MarkerView,
} from '@rnmapbox/maps'
import * as Location from 'expo-location'
import { useQuery } from '@tanstack/react-query'
import { Navigation } from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { driverApi } from '@drivecommand/api-client'
import { useDriverDirections } from '../../hooks/useDriverDirections'
import { useThemeColors } from '../../constants/tokens'
import { openNavigation } from '../../lib/navigation'

export default function MapScreen() {
  const { token } = useAuthContext()
  const c = useThemeColors()
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'pending'>('pending')

  // Request foreground location permission on mount
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      setLocationPermission(status === 'granted' ? 'granted' : 'denied')
    })
  }, [])

  // Fetch driver dashboard — contains activeLoad summary
  const { data: dashboard } = useQuery({
    queryKey: ['driver-dashboard'],
    queryFn: () => driverApi.getDashboard(token!),
    enabled: !!token,
    staleTime: 30_000,
  })
  const activeLoad = dashboard?.activeLoad ?? null

  // Fetch full load detail — contains stops with lat/lng
  const { data: loadDetail } = useQuery({
    queryKey: ['driver-load', activeLoad?.id],
    queryFn: () => driverApi.getLoad(token!, activeLoad!.id),
    enabled: !!token && !!activeLoad?.id,
    staleTime: 30_000,
  })
  const detailStops = loadDetail?.stops ?? []

  // Fetch OSRM directions for the active load
  const { polyline, distanceMiles, durationSeconds } = useDriverDirections({
    token,
    stops: detailStops,
    enabled: !!activeLoad,
  })

  // Find the first stop that has not been departed
  const nextUnvisitedIndex = detailStops.findIndex(s => s.status !== 'DEPARTED')
  const nextStop = nextUnvisitedIndex >= 0 ? detailStops[nextUnvisitedIndex] : null

  // Build GeoJSON feature for polyline
  const routeShape = useMemo((): GeoJSON.Feature<GeoJSON.LineString> | null => {
    if (!polyline || polyline.length < 2) return null
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: polyline },
      properties: {},
    }
  }, [polyline])

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL="mapbox://styles/mapbox/standard"
      >
        <Camera followUserLocation followUserMode={UserTrackingMode.Follow} />
        <UserLocation visible renderMode={UserLocationRenderMode.Native} />

        {/* Route polyline — only when active load has coordinates */}
        {routeShape && (
          <ShapeSource id="route-line" shape={routeShape}>
            <LineLayer
              id="route-line-layer"
              style={{
                lineColor: '#0ea5e9',
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}

        {/* Stop markers — numbered circles */}
        {detailStops.map((stop, i) => {
          if (stop.lat == null || stop.lng == null) return null
          const isNext = i === nextUnvisitedIndex
          const isDeparted = stop.status === 'DEPARTED'
          return (
            <MarkerView
              key={stop.id}
              coordinate={[Number(stop.lng), Number(stop.lat)]}
            >
              <View style={[
                styles.marker,
                isNext && styles.markerNext,
                isDeparted && styles.markerDone,
              ]}>
                <Text style={styles.markerLabel}>{stop.position}</Text>
              </View>
            </MarkerView>
          )
        })}
      </MapView>

      {/* Location permission denied message */}
      {locationPermission === 'denied' && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Location access denied. Enable in Settings to see your position.
          </Text>
        </View>
      )}

      {/* Status chip — top center — only when no active load */}
      {!activeLoad && (
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>No active load</Text>
        </View>
      )}

      {/* Info panel — floating bottom sheet */}
      <View style={[styles.infoPanel, { backgroundColor: c.surfaceCard }]}>
        {activeLoad && nextStop ? (
          <>
            <Text style={[styles.infoPanelLabel, { color: c.textTertiary }]}>Next Stop</Text>
            <Text style={[styles.infoPanelAddress, { color: c.textPrimary }]} numberOfLines={2}>
              {nextStop.address}
            </Text>
            <View style={styles.infoRow}>
              {distanceMiles != null && (
                <Text style={[styles.infoStat, { color: c.textSecondary }]}>
                  {distanceMiles.toFixed(1)} mi
                </Text>
              )}
              {durationSeconds != null && (
                <Text style={[styles.infoStat, { color: c.textSecondary }]}>
                  ~{Math.round(durationSeconds / 60)} min
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text style={[styles.infoPanelPlaceholder, { color: c.textTertiary }]}>
            {activeLoad ? 'All stops completed' : 'Start a load to see route info'}
          </Text>
        )}

        {/* Start Navigation CTA */}
        <Pressable
          style={[styles.navButton, (!activeLoad || !nextStop) && styles.navButtonDisabled]}
          disabled={!activeLoad || !nextStop}
          onPress={() => {
            if (!nextStop) return
            openNavigation(
              nextStop.lat != null && nextStop.lng != null
                ? { lat: Number(nextStop.lat), lng: Number(nextStop.lng), address: nextStop.address }
                : { address: nextStop.address }
            )
          }}
        >
          <Navigation color="#ffffff" size={18} />
          <Text style={styles.navButtonText}>Start Navigation</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Stop markers
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerNext: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0ea5e9',
  },
  markerDone: {
    backgroundColor: '#22c55e',
    opacity: 0.7,
  },
  markerLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Status chip
  statusChip: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusChipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Location permission banner
  permissionBanner: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(239,68,68,0.9)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  permissionText: {
    color: '#ffffff',
    fontSize: 13,
    textAlign: 'center',
  },

  // Info panel
  infoPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
  },
  infoPanelLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoPanelAddress: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  infoPanelPlaceholder: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    paddingVertical: 8,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  infoStat: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Navigation button
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginTop: 12,
  },
  navButtonDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  navButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
})
