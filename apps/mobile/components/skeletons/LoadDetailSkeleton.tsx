import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the owner load detail screen:
 * - Header bar: back arrow + load number + badge
 * - Route info card: 4 label/value pairs in a 2-column grid
 * - Stops card: section header + 3 timeline rows
 * - Truck card: section header + 2 field skeletons
 */
export function LoadDetailSkeleton() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      {/* Header bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#1e293b',
          gap: 12,
        }}
      >
        <Skeleton width={28} height={28} borderRadius={6} />
        <Skeleton width={160} height={18} />
        <Skeleton width={64} height={22} borderRadius={10} style={{ marginLeft: 'auto' }} />
      </View>

      {/* Content */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
        {/* Route info card */}
        <View
          style={{
            backgroundColor: '#1e293b',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#334155',
            padding: 16,
            gap: 14,
          }}
        >
          {/* Card title */}
          <Skeleton width="35%" height={16} />
          {/* 4 pairs laid out in 2 columns, 2 rows */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="50%" height={11} />
              <Skeleton width="80%" height={14} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="50%" height={11} />
              <Skeleton width="80%" height={14} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="50%" height={11} />
              <Skeleton width="70%" height={14} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="50%" height={11} />
              <Skeleton width="70%" height={14} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="40%" height={11} />
              <Skeleton width="60%" height={14} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="40%" height={11} />
              <Skeleton width="55%" height={14} />
            </View>
          </View>
        </View>

        {/* Stops card */}
        <View
          style={{
            backgroundColor: '#1e293b',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#334155',
            padding: 16,
            gap: 14,
          }}
        >
          {/* Section header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Skeleton width={16} height={16} borderRadius={4} />
            <Skeleton width="40%" height={16} />
          </View>
          {/* 3 stop timeline rows */}
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Skeleton width={12} height={12} borderRadius={6} />
              <View style={{ flex: 1, gap: 5 }}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="35%" height={11} />
              </View>
            </View>
          ))}
        </View>

        {/* Truck card */}
        <View
          style={{
            backgroundColor: '#1e293b',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#334155',
            padding: 16,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Skeleton width={16} height={16} borderRadius={4} />
              <Skeleton width="45%" height={16} />
            </View>
            <Skeleton width={88} height={32} borderRadius={8} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="40%" height={11} />
              <Skeleton width="70%" height={14} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="50%" height={11} />
              <Skeleton width="65%" height={14} />
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}
