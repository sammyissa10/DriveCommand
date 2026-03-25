import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Skeleton } from '../ui/Skeleton'
import { LoadCardSkeleton } from './LoadCardSkeleton'

/**
 * Mimics the owner dashboard layout:
 * - 2x2 grid of KPI card skeletons
 * - Divider
 * - 3 load card skeletons
 */
export function DashboardSkeleton() {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#0f172a' }}
      edges={['bottom', 'left', 'right']}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        {/* Header */}
        <Skeleton width={120} height={24} style={{ marginBottom: 6 }} />
        <Skeleton width={160} height={14} style={{ marginBottom: 20 }} />

        {/* KPI row 1 */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <KPICardSkeleton />
          <KPICardSkeleton />
        </View>

        {/* KPI row 2 */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <KPICardSkeleton />
          <KPICardSkeleton />
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: '#1e293b', marginBottom: 16 }} />

        {/* Section title */}
        <Skeleton width={100} height={16} style={{ marginBottom: 12 }} />
      </View>

      {/* Load card skeletons */}
      <LoadCardSkeleton />
      <LoadCardSkeleton />
      <LoadCardSkeleton />
    </SafeAreaView>
  )
}

function KPICardSkeleton() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        padding: 14,
        gap: 8,
      }}
    >
      <Skeleton width={24} height={24} borderRadius={6} />
      <Skeleton width="80%" height={22} />
      <Skeleton width="60%" height={12} />
    </View>
  )
}
