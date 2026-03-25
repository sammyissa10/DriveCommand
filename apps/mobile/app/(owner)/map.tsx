import React, { useRef, useState, useEffect } from 'react'
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, RefreshCw } from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { ownerApi, type MapVehicle } from '@drivecommand/api-client'
import VehicleMarker from '../../components/owner/VehicleMarker'
import VehicleDetailSheet from '../../components/owner/VehicleDetailSheet'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const US_REGION = {
  latitude: 39.8,
  longitude: -98.5,
  latitudeDelta: 30,
  longitudeDelta: 30,
}

/**
 * Dark map style for Google Maps (Android).
 * iOS uses Apple Maps which does not accept custom JSON styles.
 */
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
]

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OwnerMapScreen() {
  const { token } = useAuthContext()
  const queryClient = useQueryClient()
  const mapRef = useRef<MapView>(null)

  const [selectedVehicle, setSelectedVehicle] = useState<MapVehicle | null>(null)
  const [hasFitted, setHasFitted] = useState(false)

  const {
    data,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['map-vehicles'],
    queryFn: () => ownerApi.getMapVehicles(token!),
    enabled: !!token,
    refetchInterval: 60_000,
  })

  const vehicles = data?.vehicles ?? []

  // Fit map to all vehicle positions on initial data load
  useEffect(() => {
    if (!hasFitted && vehicles.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(
        vehicles.map((v) => ({ latitude: v.latitude, longitude: v.longitude })),
        {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        }
      )
      setHasFitted(true)
    }
  }, [vehicles, hasFitted])

  const handleMarkerPress = (vehicle: MapVehicle) => {
    setSelectedVehicle(vehicle)
  }

  const handleSheetClose = () => {
    setSelectedVehicle(null)
  }

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['map-vehicles'] })
  }

  return (
    <View style={styles.root}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={US_REGION}
        showsUserLocation={false}
        showsMyLocationButton={false}
        customMapStyle={Platform.OS === 'android' ? darkMapStyle : undefined}
      >
        {vehicles.map((vehicle) => (
          <VehicleMarker
            key={vehicle.truckId}
            vehicle={vehicle}
            onPress={handleMarkerPress}
          />
        ))}
      </MapView>

      {/* Safe-area overlay — header + refresh button */}
      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        {/* Header pill */}
        <View style={styles.header}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.title}>Live Map</Text>
            {vehicles.length > 0 && (
              <Text style={styles.subtitle}>
                {vehicles.length} {vehicles.length === 1 ? 'truck' : 'trucks'}
              </Text>
            )}
          </View>

          {/* Manual refresh button */}
          <TouchableOpacity
            style={[styles.refreshButton, isFetching && styles.refreshButtonActive]}
            onPress={handleManualRefresh}
            disabled={isFetching}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <RefreshCw
              size={18}
              color={isFetching ? '#38bdf8' : '#94a3b8'}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Loading overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Loading fleet positions...</Text>
        </View>
      )}

      {/* Error overlay */}
      {isError && !isLoading && (
        <View style={styles.errorOverlay} pointerEvents="none">
          <Text style={styles.errorText}>Failed to load fleet positions</Text>
        </View>
      )}

      {/* Empty state — no vehicles */}
      {!isLoading && !isError && vehicles.length === 0 && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <MapPin color="#64748b" size={40} />
          <Text style={styles.emptyTitle}>No vehicle positions available</Text>
          <Text style={styles.emptySubtitle}>
            Trucks with GPS pings will appear here
          </Text>
        </View>
      )}

      {/* Vehicle detail bottom sheet */}
      <VehicleDetailSheet
        vehicle={selectedVehicle}
        visible={selectedVehicle !== null}
        onClose={handleSheetClose}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    // iOS blur-like shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  headerTextBlock: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  refreshButtonActive: {
    backgroundColor: '#0f172a',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
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
})
