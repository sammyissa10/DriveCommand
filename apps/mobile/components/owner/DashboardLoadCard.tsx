import React, { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Badge } from '../ui/Badge'
import { haptic } from '../../lib/haptics'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

interface DashboardLoadCardProps {
  id: string
  loadNumber: string
  status: string
  origin: string
  destination: string
  driverName: string | null
  onPress: () => void
}

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':    return { label: 'Pending',    variant: 'muted' }
    case 'DISPATCHED': return { label: 'Accepted',   variant: 'info' }
    case 'PICKED_UP':
    case 'IN_TRANSIT': return { label: 'En Route',   variant: 'warning' }
    case 'DELIVERED':  return { label: 'Delivered',  variant: 'success' }
    case 'INVOICED':   return { label: 'Invoiced',   variant: 'success' }
    case 'CANCELLED':  return { label: 'Cancelled',  variant: 'danger' }
    default:           return { label: status,       variant: 'muted' }
  }
}

// Strip state abbreviation / zip for cleaner display
function formatCity(address: string): string {
  const parts = address.split(',')
  if (parts.length >= 2) {
    return parts.slice(0, 2).join(',').trim()
  }
  return address
}

export const DashboardLoadCard = memo(function DashboardLoadCard({
  loadNumber,
  status,
  origin,
  destination,
  driverName,
  onPress,
}: DashboardLoadCardProps) {
  const badge = getStatusBadge(status)
  const isActive = status === 'IN_TRANSIT' || status === 'PICKED_UP' || status === 'DISPATCHED'

  return (
    <Pressable
      onPress={() => { haptic.light(); onPress() }}
      android_ripple={{ color: 'rgba(14,165,233,0.08)', borderless: false }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? '#263348' : '#1e293b',
        borderWidth: 1,
        borderColor: isActive ? '#0ea5e933' : '#334155',
        borderRadius: 16,
        padding: 14,
        minHeight: 88,
      })}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 14, letterSpacing: 0.3 }}>
          #{loadNumber}
        </Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      {/* Vertical stepper */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {/* Line + dots column */}
        <View style={{ alignItems: 'center', width: 12, paddingTop: 3 }}>
          {/* Origin dot */}
          <View style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: '#0ea5e9',
            borderWidth: 2, borderColor: '#38bdf8',
          }} />
          {/* Dashed connecting line */}
          <View style={{ flex: 1, width: 1.5, marginVertical: 3 }}>
            {[0,1,2,3,4].map(i => (
              <View key={i} style={{
                height: 4, width: 1.5,
                backgroundColor: '#475569',
                marginBottom: 3,
                alignSelf: 'center',
              }} />
            ))}
          </View>
          {/* Destination dot */}
          <View style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: '#334155',
            borderWidth: 2, borderColor: '#64748b',
          }} />
        </View>

        {/* Address text column */}
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13, lineHeight: 18 }} numberOfLines={1}>
            {formatCity(origin)}
          </Text>
          <View style={{ height: 8 }} />
          <Text style={{ color: '#94a3b8', fontWeight: '500', fontSize: 13, lineHeight: 18 }} numberOfLines={1}>
            {formatCity(destination)}
          </Text>
        </View>
      </View>

      {/* Driver footer */}
      {driverName && (
        <Text style={{ color: '#475569', fontSize: 11, marginTop: 10, fontWeight: '500' }}>
          {driverName}
        </Text>
      )}
    </Pressable>
  )
})
