import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { MarkerView } from '@rnmapbox/maps'

interface VehicleMarkerProps {
  coordinate: { latitude: number; longitude: number }
  label?: string
  color?: string
}

/**
 * Mapbox-compatible vehicle marker for the driver map screen.
 * Renders a colored circle with an optional text label centered inside.
 *
 * NOTE: MarkerView coordinate order is [longitude, latitude] (GeoJSON),
 * opposite of react-native-maps which uses { latitude, longitude }.
 */
export function VehicleMarker({ coordinate, label, color = '#0ea5e9' }: VehicleMarkerProps) {
  return (
    <MarkerView coordinate={[coordinate.longitude, coordinate.latitude]}>
      <View style={[styles.circle, { backgroundColor: color }]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </MarkerView>
  )
}

const styles = StyleSheet.create({
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  label: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
})
