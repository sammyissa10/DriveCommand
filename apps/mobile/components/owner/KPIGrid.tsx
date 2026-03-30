import React from 'react'
import { StyleSheet, View } from 'react-native'
import { AlertTriangle, DollarSign, Package, UserCheck } from 'lucide-react-native'
import { KPICard } from './KPICard'
import { colors, spacing } from '../../constants/tokens'

interface KPIGridProps {
  kpis: {
    activeLoads: number
    availableDrivers: number
    revenue: string
    openAlerts: number
  }
  onPressLoads: () => void
  onPressDrivers: () => void
  onPressRevenue: () => void
  onPressAlerts: () => void
}

export function KPIGrid({
  kpis,
  onPressLoads,
  onPressDrivers,
  onPressRevenue,
  onPressAlerts,
}: KPIGridProps) {
  const alertColor = kpis.openAlerts > 0 ? colors.warning : colors.textMuted

  return (
    <View style={styles.wrapper}>
      {/* Row 1 */}
      <View style={styles.row}>
        <KPICard
          label="Active Loads"
          value={kpis.activeLoads}
          valueColor={colors.brandLight}
          icon={<Package color={colors.brandLight} size={16} />}
          accentColor={colors.brandLight}
          accessibilityLabel={`${kpis.activeLoads} active loads. Tap to view loads.`}
          onPress={onPressLoads}
        />
        <KPICard
          label="Available"
          value={kpis.availableDrivers}
          valueColor={colors.brandLight}
          icon={<UserCheck color={colors.brandLight} size={16} />}
          accentColor={colors.brandLight}
          accessibilityLabel={`${kpis.availableDrivers} available drivers. Tap to view drivers.`}
          onPress={onPressDrivers}
        />
      </View>

      {/* Row 2 */}
      <View style={[styles.row, styles.lastRow]}>
        <KPICard
          label="Revenue (MTD)"
          value={kpis.revenue}
          valueColor={colors.success}
          icon={<DollarSign color={colors.success} size={16} />}
          accentColor={colors.success}
          accessibilityLabel={`${kpis.revenue} revenue this month. Tap to view invoices.`}
          onPress={onPressRevenue}
        />
        <KPICard
          label="Open Alerts"
          value={kpis.openAlerts}
          valueColor={alertColor}
          icon={<AlertTriangle color={alertColor} size={16} />}
          accentColor={alertColor}
          accessibilityLabel={`${kpis.openAlerts} open compliance alerts. Tap to view compliance.`}
          onPress={onPressAlerts}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  lastRow: {
    marginBottom: 0,
  },
})
