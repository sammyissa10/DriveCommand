import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

/**
 * Mimics the InvoiceRow shape:
 * - Top row: invoice number (left) + amount (right)
 * - Bottom row: customer name (left) + status dot (right)
 */
export function InvoiceRowSkeleton() {
  return (
    <View
      style={{
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginHorizontal: 16,
        marginBottom: 10,
      }}
    >
      {/* Top row: invoice number + amount */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Skeleton width="40%" height={15} />
        <Skeleton width="22%" height={15} />
      </View>
      {/* Bottom row: customer + status dot */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="55%" height={12} />
        <Skeleton width={8} height={8} borderRadius={4} />
      </View>
    </View>
  )
}
