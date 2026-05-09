import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { MarkerView } from '@rnmapbox/maps'
import { Truck } from 'lucide-react-native'
import type { MapVehicle } from '@drivecommand/api-client'

// Status color map
const STATUS_COLORS: Record<MapVehicle['status'], string> = {
  MOVING: '#22c55e',  // green-500
  IDLE: '#f59e0b',    // amber-400
  OFFLINE: '#64748b', // slate-500
}

interface VehicleMarkerProps {
  vehicle: MapVehicle
  onPress: (vehicle: MapVehicle) => void
}

/**
 * Mapbox-compatible vehicle marker for the owner live map screen.
 * Replaces the previous react-native-maps Marker implementation.
 *
 * NOTE: MarkerView coordinate order is [longitude, latitude] (GeoJSON),
 * opposite of the old react-native-maps Marker which used { latitude, longitude }.
 */
export default function VehicleMarker({ vehicle, onPress }: VehicleMarkerProps) {
  const color = STATUS_COLORS[vehicle.status]

  return (
    <MarkerView coordinate={[vehicle.longitude, vehicle.latitude]}>
      <Pressable onPress={() => onPress(vehicle)}>
        <View style={styles.wrapper}>
          {/* Status-colored circle with truck icon */}
          <View style={[styles.circle, { backgroundColor: color, borderColor: color + '55' }]}>
            <Truck size={16} color="#ffffff" />
          </View>
          {/* Truck name label */}
          <View style={styles.labelContainer}>
            <Text style={styles.label} numberOfLines={1}>
              {vehicle.truckName.split(' · ')[1] ?? vehicle.truckName}
            </Text>
          </View>
        </View>
      </Pressable>
    </MarkerView>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  labelContainer: {
    marginTop: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    maxWidth: 90,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f1f5f9',
    textAlign: 'center',
  },
})
