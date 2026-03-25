import React from 'react'
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native'
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../../context/AuthContext'
import { ownerApi, type FleetPosition } from '@drivecommand/api-client'
import { MapPin } from 'lucide-react-native'

/** Format a timestamp as a relative "X min ago" string */
function timeAgo(timestamp: string | Date): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffMs = now - then

  if (diffMs < 60_000) return 'just now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

/** Compute a bounding region that fits all markers */
function fitRegion(positions: FleetPosition[]) {
  if (positions.length === 0) return null

  const lats = positions.map((p) => p.latitude)
  const lngs = positions.map((p) => p.longitude)

  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latDelta = Math.max((maxLat - minLat) * 1.4, 0.5)
  const lngDelta = Math.max((maxLng - minLng) * 1.4, 0.5)

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  }
}

const US_REGION = {
  latitude: 39.8,
  longitude: -98.5,
  latitudeDelta: 30,
  longitudeDelta: 30,
}

export default function OwnerMapScreen() {
  const { token } = useAuthContext()

  const { data: positions, isLoading, isError } = useQuery({
    queryKey: ['fleet-positions'],
    queryFn: () => ownerApi.getFleetPositions(token!),
    enabled: !!token,
    refetchInterval: 30_000,
  })

  const region = positions && positions.length > 0 ? fitRegion(positions) : null

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Live Map</Text>
        {positions && positions.length > 0 && (
          <Text style={styles.subtitle}>
            {positions.length} active {positions.length === 1 ? 'truck' : 'trucks'}
          </Text>
        )}
      </View>

      {/* Map or loading/error states */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Loading fleet positions...</Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load fleet positions</Text>
        </View>
      ) : (
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={region ?? US_REGION}
            region={region ?? undefined}
            showsUserLocation={false}
            showsMyLocationButton={false}
          >
            {(positions ?? []).map((pos: FleetPosition) => (
              <Marker
                key={pos.truckId}
                coordinate={{ latitude: pos.latitude, longitude: pos.longitude }}
                pinColor="#38bdf8"
              >
                <Callout tooltip={false}>
                  <View style={styles.callout}>
                    <Text style={styles.calloutPlate}>{pos.truck.licensePlate}</Text>
                    <Text style={styles.calloutLine}>
                      {pos.truck.make} {pos.truck.model}
                    </Text>
                    <Text style={styles.calloutLine}>
                      Driver: {pos.driverName ?? 'No driver'}
                    </Text>
                    <Text style={styles.calloutLine}>
                      Load: {pos.loadNumber ?? 'No active load'}
                    </Text>
                    <Text style={styles.calloutTime}>{timeAgo(pos.timestamp)}</Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>

          {(!positions || positions.length === 0) && (
            <View style={styles.emptyOverlay} pointerEvents="none">
              <MapPin color="#64748b" size={40} />
              <Text style={styles.emptyTitle}>No active vehicles</Text>
              <Text style={styles.emptySubtitle}>
                Trucks with GPS pings will appear here
              </Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyOverlay: {
    position: 'absolute',
    inset: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  callout: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
    minWidth: 160,
    maxWidth: 220,
    borderWidth: 1,
    borderColor: '#334155',
  },
  calloutPlate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  calloutLine: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 2,
  },
  calloutTime: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
})
