import React, { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MoveRight } from 'lucide-react-native'
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
    case 'PENDING':    return { label: 'Pending',   variant: 'muted' }
    case 'DISPATCHED': return { label: 'Accepted',  variant: 'info' }
    case 'PICKED_UP':
    case 'IN_TRANSIT': return { label: 'En Route',  variant: 'warning' }
    case 'DELIVERED':  return { label: 'Delivered', variant: 'success' }
    case 'INVOICED':   return { label: 'Invoiced',  variant: 'success' }
    case 'CANCELLED':  return { label: 'Cancelled', variant: 'danger' }
    default:           return { label: status,      variant: 'muted' }
  }
}

function extractCity(address: string): string {
  const parts = address.split(',').map(p => p.trim())
  if (parts.length >= 3) return parts[1]
  if (parts.length === 2) return parts[0]
  return address
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
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
  const from = extractCity(origin)
  const to = extractCity(destination)

  return (
    <View style={{
      borderRadius: 16,
      backgroundColor: '#162032',
      marginBottom: 12,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3,
      elevation: 3,
    }}>
      {isActive && (
        <View style={{
          position: 'absolute',
          left: 0,
          top: 10,
          bottom: 10,
          width: 3,
          borderRadius: 2,
          backgroundColor: '#38bdf8',
        }} />
      )}
      <Pressable
        onPress={() => { haptic.light(); onPress() }}
        android_ripple={{ color: 'rgba(14,165,233,0.08)', borderless: false }}
        style={({ pressed }) => ({ backgroundColor: pressed ? '#1a2d45' : 'transparent' })}
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 11, paddingBottom: 12 }}>
          {/* Header: load number + badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 14, letterSpacing: 0.3 }}>
              #{loadNumber}
            </Text>
            <Badge label={badge.label} variant={badge.variant} />
          </View>

          {/* Route: single inline line */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
              {from}
            </Text>
            <MoveRight color="#475569" size={14} />
            <Text style={{ color: '#94a3b8', fontWeight: '500', fontSize: 15, flex: 1 }} numberOfLines={1}>
              {to}
            </Text>
          </View>

          {/* Driver name */}
          {driverName && (
            <Text style={{ color: '#475569', fontSize: 12, fontWeight: '500', marginTop: 8 }} numberOfLines={1}>
              {toTitleCase(driverName)}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  )
})
