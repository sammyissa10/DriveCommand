import React, { useCallback, useState } from 'react'
import {
  Animated,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Building2,
  DollarSign,
  FileText,
  LifeBuoy,
  Package,
  Plus,
  Truck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { useSupportTicket } from '../../context/SupportTicketContext'
import { ownerApi } from '@drivecommand/api-client'
import { KPICard } from '../../components/owner/KPICard'
import { DriverStatusChip } from '../../components/owner/DriverStatusChip'
import { DashboardLoadCard } from '../../components/owner/DashboardLoadCard'
import { DashboardSkeleton } from '../../components/skeletons/DashboardSkeleton'
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'
import { haptic } from '../../lib/haptics'

const SCREEN_WIDTH = Dimensions.get('window').width
const CHIP_WIDTH = (SCREEN_WIDTH - 16 - 16 - 8) / 2

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OwnerDashboardData {
  kpis: {
    activeLoadsCount: number
    driversOnDutyCount: number
    revenueThisMonth: number
    openAlertsCount: number
  }
  activeLoads: Array<{
    id: string
    loadNumber: string
    status: string
    origin: string
    destination: string
    customer: { id: string; companyName: string }
    truck: { id: string; make: string; model: string; licensePlate: string } | null
    driverName: string | null
    createdAt: string
    updatedAt: string
  }>
  driverStatuses: Array<{
    id: string
    name: string
    hosStatus: string | null
    activeLoadNumber: string | null
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function formatRevenue(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toFixed(0)}`
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const CREATE_ACTIONS = [
  { key: 'load',     label: 'New Load',      icon: Package,   route: '/(owner)/loads?create=1',       color: '#38bdf8' },
  { key: 'driver',   label: 'Invite Driver', icon: UserPlus,  route: '/(owner)/drivers/invite',       color: '#a78bfa' },
  { key: 'customer', label: 'New Customer',  icon: Building2, route: '/(owner)/more/crm/new',         color: '#34d399' },
  { key: 'invoice',  label: 'New Invoice',   icon: FileText,  route: '/(owner)/more/invoices/new',    color: '#fbbf24' },
  { key: 'truck',    label: 'Add Truck',     icon: Truck,     route: '/(owner)/more/trucks/new',      color: '#f87171' },
] as const

export default function OwnerDashboard() {
  const { token } = useAuthContext()
  const { open: openSupport } = useSupportTicket()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const fadeAnim = React.useRef(new Animated.Value(0)).current

  function openMenu() {
    haptic.medium()
    setMenuOpen(true)
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start()
  }

  function closeMenu() {
    Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => setMenuOpen(false))
  }

  function handleAction(route: string) {
    closeMenu()
    haptic.light()
    setTimeout(() => router.push(route as any), 150)
  }

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<OwnerDashboardData>({
    queryKey: ['owner-dashboard'],
    queryFn: () => ownerApi.getDashboard(token!),
    enabled: !!token,
    refetchInterval: 60_000,
  })

  const onRefresh = useCallback(() => {
    haptic.light()
    refetch()
  }, [refetch])

  // Loading state — show skeleton instead of spinner
  if (isLoading) {
    return <DashboardSkeleton />
  }

  // Error state
  if (isError) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#080f1a' }}
        className="items-center justify-center px-6"
        edges={['bottom', 'left', 'right']}
      >
        <AlertTriangle color="#f87171" size={40} />
        <Text className="text-white text-lg font-semibold mt-4 text-center">
          Failed to load dashboard
        </Text>
        <Text className="text-slate-400 text-sm mt-2 text-center">
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-6 bg-sky-600 px-6 py-3 rounded-lg active:opacity-80"
        >
          <Text className="text-white font-semibold">Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const { kpis, activeLoads, driverStatuses } = data!

  const availableDriversCount = driverStatuses.filter(
    d => d.activeLoadNumber === null && (d.hosStatus === 'OFF_DUTY' || d.hosStatus === 'SLEEPER_BERTH' || d.hosStatus === null)
  ).length

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#080f1a' }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor="#0ea5e9"
            colors={['#0ea5e9']}
          />
        }
      >
        {/* Header */}
        <View className="mb-5">
          <Text className="text-3xl font-bold text-white">Dashboard</Text>
          <Text className="text-slate-500 text-sm mt-0.5">Fleet overview</Text>
        </View>

        {/* 2x2 KPI Grid */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <KPICard
            label="Active Loads"
            value={kpis.activeLoadsCount}
            valueColor="#38bdf8"
            icon={<Package color="#38bdf8" size={16} />}
            accentColor="#38bdf8"
            accessibilityLabel={`${kpis.activeLoadsCount} active loads. Tap to view loads.`}
            onPress={() => { haptic.light(); router.push('/(owner)/loads' as any) }}
          />
          <KPICard
            label="Available"
            value={availableDriversCount}
            valueColor="#38bdf8"
            icon={<UserCheck color="#38bdf8" size={16} />}
            accentColor="#38bdf8"
            accessibilityLabel={`${availableDriversCount} available drivers. Tap to view drivers.`}
            onPress={() => { haptic.light(); router.push('/(owner)/drivers' as any) }}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <KPICard
            label="Revenue (MTD)"
            value={formatRevenue(kpis.revenueThisMonth)}
            valueColor="#10b981"
            icon={<DollarSign color="#10b981" size={16} />}
            accentColor="#10b981"
            accessibilityLabel={`${formatRevenue(kpis.revenueThisMonth)} revenue this month. Tap to view invoices.`}
            onPress={() => { haptic.light(); router.push('/(owner)/invoices' as any) }}
          />
          <KPICard
            label="Open Alerts"
            value={kpis.openAlertsCount}
            valueColor={kpis.openAlertsCount > 0 ? '#fbbf24' : '#94a3b8'}
            icon={<AlertTriangle color={kpis.openAlertsCount > 0 ? '#fbbf24' : '#475569'} size={16} />}
            accentColor={kpis.openAlertsCount > 0 ? '#fbbf24' : '#475569'}
            accessibilityLabel={`${kpis.openAlertsCount} open compliance alerts. Tap to view compliance.`}
            onPress={() => { haptic.light(); router.push('/(owner)/compliance' as any) }}
          />
        </View>

        {/* Active Loads Section */}
        <View
          style={{
            height: 1,
            backgroundColor: '#1e293b',
            marginBottom: 14,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Truck color="#38bdf8" size={15} style={{ marginRight: 6 }} />
          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' }}>Active Loads</Text>
        </View>

        {activeLoads.length === 0 ? (
          <View style={{ backgroundColor: '#111827', borderWidth: 0, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 20 }}>
            <Package color="#475569" size={32} />
            <Text className="text-slate-400 text-sm mt-3 text-center">No active loads right now</Text>
          </View>
        ) : (
          <View style={{ marginBottom: 20 }}>
            {activeLoads.map((load) => (
              <DashboardLoadCard
                key={load.id}
                id={load.id}
                loadNumber={load.loadNumber}
                status={load.status}
                origin={load.origin}
                destination={load.destination}
                driverName={load.driverName}
                onPress={() => router.push(`/(owner)/loads/${load.id}` as any)}
              />
            ))}
          </View>
        )}

        {/* Driver Status Section */}
        <View
          style={{
            height: 1,
            backgroundColor: '#1e293b',
            marginBottom: 14,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Users color="#a78bfa" size={15} style={{ marginRight: 6 }} />
          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' }}>Driver Status</Text>
        </View>

        {(() => {
          const activeDrivers = driverStatuses.filter(
            d => d.hosStatus === 'DRIVING' || d.hosStatus === 'ON_DUTY' || d.activeLoadNumber !== null
          )
          if (activeDrivers.length === 0) {
            return (
              <View style={{ backgroundColor: '#111827', borderWidth: 0, borderRadius: 12, padding: 16, alignItems: 'center' }}>
                <Text className="text-slate-400 text-sm">All drivers are currently off duty</Text>
              </View>
            )
          }
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {activeDrivers.map((driver) => (
                <Pressable
                  key={driver.id}
                  style={({ pressed }) => ({ width: CHIP_WIDTH, opacity: pressed ? 0.75 : 1 })}
                  onPress={() => router.push(`/(owner)/drivers/${driver.id}` as any)}
                >
                  <DriverStatusChip
                    name={driver.name}
                    hosStatus={driver.hosStatus}
                    activeLoadNumber={driver.activeLoadNumber}
                  />
                </Pressable>
              ))}
            </View>
          )
        })()}
      </ScrollView>

      {/* Speed-dial backdrop */}
      {menuOpen && (
        <Pressable
          onPress={closeMenu}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Animated.View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.55)',
              opacity: fadeAnim,
            }}
          />
        </Pressable>
      )}

      {/* Speed-dial action items */}
      {menuOpen && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 88,
            right: 20,
            gap: 10,
            alignItems: 'flex-end',
            opacity: fadeAnim,
            transform: [{
              translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
            }],
          }}
        >
          {CREATE_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <Pressable
                key={action.key}
                onPress={() => handleAction(action.route)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: '#334155',
                }}>
                  <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{action.label}</Text>
                </View>
                <View style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: action.color + '22',
                  borderWidth: 1,
                  borderColor: action.color + '55',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon color={action.color} size={18} />
                </View>
              </Pressable>
            )
          })}

          {/* Separator above Get Support */}
          <View style={{ height: 1, backgroundColor: '#475569', width: 160, alignSelf: 'flex-end', marginVertical: 2 }} />

          {/* Get Support item */}
          <Pressable
            onPress={() => { closeMenu(); haptic.light(); openSupport() }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View style={{
              backgroundColor: '#1e293b',
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: '#334155',
            }}>
              <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>Get Support</Text>
            </View>
            <View style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#f59e0b22',
              borderWidth: 1,
              borderColor: '#f59e0b55',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <LifeBuoy color="#f59e0b" size={18} />
            </View>
          </Pressable>
        </Animated.View>
      )}

      {/* FAB — toggle speed dial */}
      <Pressable
        accessibilityLabel="Quick create"
        accessibilityRole="button"
        onPress={menuOpen ? closeMenu : openMenu}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: menuOpen ? '#475569' : '#0ea5e9',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#0ea5e9',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        {menuOpen ? <X color="#ffffff" size={22} /> : <Plus color="#ffffff" size={24} />}
      </Pressable>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
