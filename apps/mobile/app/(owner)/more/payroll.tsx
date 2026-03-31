import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'
import { AlertTriangle, ChevronDown, ChevronLeft, DollarSign } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import {
  ownerApi,
  type DriverOption,
  type PayrollRecordDetail,
  type PayrollResponse,
  type PayrollRecordSummary,
} from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { PageSpeedDial } from '../../../components/ui/PageSpeedDial'
import { PayrollRowSkeleton } from '../../../components/skeletons/PayrollRowSkeleton'
import { haptic } from '../../../lib/haptics'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toFixed(0)}`
}

function formatCurrencyFull(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'PAID': return '#22c55e'
    case 'APPROVED': return '#38bdf8'
    case 'DRAFT': return '#64748b'
    default: return '#64748b'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'PAID': return 'Paid'
    case 'APPROVED': return 'Approved'
    case 'DRAFT': return 'Draft'
    default: return status
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}{required && <Text style={{ color: '#f87171' }}> *</Text>}
      </Text>
      {children}
      {hint && <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>{hint}</Text>}
    </View>
  )
}

const inputStyle = {
  backgroundColor: '#1e293b',
  borderWidth: 1,
  borderColor: '#334155',
  color: '#f1f5f9',
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 11,
  fontSize: 14,
} as const

// ---------------------------------------------------------------------------
// PayrollRow Component
// ---------------------------------------------------------------------------

function PayrollRow({ record, onPress }: { record: PayrollRecordSummary; onPress: () => void }) {
  const statusColor = getStatusColor(record.status)
  const initials = getInitials(record.driverName)
  const period = `${formatDateShort(record.periodStart)} – ${formatDateShort(record.periodEnd)}`

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5 flex-row items-center active:opacity-80"
    >
      {/* Avatar */}
      <View
        className="w-[42px] h-[42px] rounded-full items-center justify-center mr-3.5 shrink-0"
        style={{ backgroundColor: '#8b5cf620' }}
      >
        <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 14 }}>{initials}</Text>
      </View>

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text
          className="text-slate-100 font-bold text-[15px] mb-0.5"
          numberOfLines={1}
        >
          {record.driverName}
        </Text>
        <Text className="text-slate-500 text-[13px]" numberOfLines={1}>
          {period}
        </Text>
      </View>

      {/* Right side */}
      <View className="items-end shrink-0 ml-2.5">
        <Text className="text-white font-bold text-base mb-1">
          {formatCurrency(record.totalPay)}
        </Text>
        <View
          className="px-2.5 py-0.5 rounded-[20px]"
          style={{ backgroundColor: statusColor + '22' }}
        >
          <Text
            className="text-[11px] font-semibold"
            style={{ color: statusColor }}
          >
            {getStatusLabel(record.status)}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  value,
  label,
  valueColor,
}: {
  value: string | number
  label: string
  valueColor?: string
}) {
  return (
    <View className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3.5 items-center">
      <Text
        className="text-lg font-bold"
        style={{ color: valueColor ?? '#f1f5f9' }}
      >
        {value}
      </Text>
      <Text className="text-slate-500 text-xs mt-0.5 text-center">{label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PayrollScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Detail sheet state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)

  // Create sheet state
  const [createVisible, setCreateVisible] = useState(false)
  const [driverPickerVisible, setDriverPickerVisible] = useState(false)
  const [selectedDriver, setSelectedDriver] = useState<DriverOption | null>(null)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [basePay, setBasePay] = useState('')
  const [bonuses, setBonuses] = useState('')
  const [deductions, setDeductions] = useState('')
  const [notes, setNotes] = useState('')

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<PayrollResponse>({
    queryKey: ['owner-payroll'],
    queryFn: () => ownerApi.getPayroll(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const { data: detail, isLoading: detailLoading } = useQuery<PayrollRecordDetail>({
    queryKey: ['payroll-detail', selectedId],
    queryFn: () => ownerApi.getPayrollRecord(token!, selectedId!),
    enabled: !!token && !!selectedId,
    staleTime: 60_000,
  })

  const { data: drivers } = useQuery<DriverOption[]>({
    queryKey: ['owner-active-drivers'],
    queryFn: () => ownerApi.getActiveDrivers(token!),
    enabled: !!token && createVisible,
    staleTime: 60_000,
  })

  function resetCreateForm() {
    setSelectedDriver(null)
    setPeriodStart('')
    setPeriodEnd('')
    setBasePay('')
    setBonuses('')
    setDeductions('')
    setNotes('')
  }

  const { mutate: createRecord, isPending: creating } = useMutation({
    mutationFn: () =>
      ownerApi.createPayrollRecord(token!, {
        driverId: selectedDriver!.id,
        periodStart: periodStart.trim(),
        periodEnd: periodEnd.trim(),
        basePay: parseFloat(basePay),
        ...(deductions.trim() ? { deductions: parseFloat(deductions) } : {}),
        ...(bonuses.trim() ? { bonuses: parseFloat(bonuses) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    onSuccess: () => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['owner-payroll'] })
      Toast.show({ type: 'success', text1: 'Payroll created', text2: 'New record added as draft.', visibilityTime: 3000 })
      setCreateVisible(false)
      resetCreateForm()
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Failed to create', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  function handleCreate() {
    if (!selectedDriver) {
      Toast.show({ type: 'error', text1: 'Driver required', text2: 'Please select a driver.', visibilityTime: 3000 })
      return
    }
    if (!periodStart.trim() || !periodEnd.trim()) {
      Toast.show({ type: 'error', text1: 'Dates required', text2: 'Enter both period start and end dates (YYYY-MM-DD).', visibilityTime: 3000 })
      return
    }
    const basePayNum = parseFloat(basePay)
    if (isNaN(basePayNum) || basePayNum <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid base pay', text2: 'Base pay must be greater than 0.', visibilityTime: 3000 })
      return
    }
    createRecord()
  }

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  const renderRecord = useCallback(({ item: r }: { item: PayrollRecordSummary }) => (
    <PayrollRow
      record={r}
      onPress={() => {
        setSelectedId(r.id)
        setDetailVisible(true)
      }}
    />
  ), [])

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3.5 border-b border-slate-700">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            className="mr-3"
            hitSlop={8}
          >
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text className="text-lg font-bold text-slate-100">Payroll</Text>
        </View>

        {isLoading ? (
          <View className="pt-3">
            <PayrollRowSkeleton />
            <PayrollRowSkeleton />
            <PayrollRowSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-slate-100 text-[17px] font-semibold mt-4 text-center">
              Failed to load payroll
            </Text>
            <Text className="text-slate-500 text-sm mt-1.5 text-center">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-5 bg-sky-500 px-6 py-3 rounded-[10px]"
            >
              <Text className="text-white font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlashList
            data={data?.records ?? []}
            renderItem={renderRecord}
            keyExtractor={(r) => r.id}
            estimatedItemSize={80}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor="#38bdf8"
                colors={['#38bdf8']}
              />
            }
            contentContainerStyle={{ paddingBottom: 100 }}
            ListHeaderComponent={
              <View>
                {/* Stats grid 2x2 */}
                <View className="px-4 pt-4 pb-2">
                  <View className="flex-row gap-3 mb-3">
                    <StatCard value={data?.stats.total ?? 0} label="Total Records" />
                    <StatCard
                      value={data?.stats.draft ?? 0}
                      label="Draft"
                      valueColor="#64748b"
                    />
                  </View>
                  <View className="flex-row gap-3">
                    <StatCard
                      value={data?.stats.approved ?? 0}
                      label="Approved"
                      valueColor="#38bdf8"
                    />
                    <StatCard
                      value={formatCurrency(data?.stats.totalPaid ?? 0)}
                      label="Total Paid"
                      valueColor="#22c55e"
                    />
                  </View>
                </View>

                {/* Records section header */}
                <View className="px-4 pt-4 pb-2.5">
                  <Text className="text-slate-400 text-xs font-semibold tracking-[0.5px] uppercase">
                    Recent Records
                  </Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View className="items-center justify-center px-6 pt-10">
                <DollarSign color="#334155" size={48} />
                <Text className="text-slate-500 text-[15px] mt-3 text-center">
                  No payroll records yet
                </Text>
              </View>
            }
          />
        )}

        {/* FAB */}
        <PageSpeedDial
          primaryLabel="New Payroll"
          primaryIcon={DollarSign}
          primaryColor="#8b5cf6"
          onPrimaryPress={() => setCreateVisible(true)}
        />

        {/* Detail bottom sheet */}
        <BottomSheet
          visible={detailVisible}
          onClose={() => setDetailVisible(false)}
          title="Payroll Detail"
          snapPoint="80%"
        >
          {detailLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#38bdf8" size="large" />
            </View>
          ) : detail ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              {/* Driver + period */}
              <Text style={{ color: '#f1f5f9', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
                {detail.driverName}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
                {formatDateShort(detail.periodStart)} – {formatDateShort(detail.periodEnd)}
              </Text>

              {/* Status badge */}
              <View style={{ marginBottom: 20 }}>
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: getStatusColor(detail.status) + '22',
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 20,
                  }}
                >
                  <Text style={{ color: getStatusColor(detail.status), fontSize: 12, fontWeight: '700' }}>
                    {getStatusLabel(detail.status)}
                  </Text>
                </View>
              </View>

              {/* Pay Breakdown */}
              <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
                Pay Breakdown
              </Text>
              <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 16, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>Base Pay</Text>
                  <Text style={{ color: '#f1f5f9', fontSize: 13, fontWeight: '600' }}>
                    {formatCurrencyFull(detail.basePay)}
                  </Text>
                </View>
                {detail.bonuses > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                    <Text style={{ color: '#94a3b8', fontSize: 13 }}>+ Bonuses</Text>
                    <Text style={{ color: '#22c55e', fontSize: 13, fontWeight: '600' }}>
                      {formatCurrencyFull(detail.bonuses)}
                    </Text>
                  </View>
                )}
                {detail.deductions > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                    <Text style={{ color: '#94a3b8', fontSize: 13 }}>- Deductions</Text>
                    <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>
                      {formatCurrencyFull(detail.deductions)}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#334155' }}>
                  <Text style={{ color: '#f1f5f9', fontSize: 15, fontWeight: '700' }}>= Total Pay</Text>
                  <Text style={{ color: '#f1f5f9', fontSize: 15, fontWeight: '700' }}>
                    {formatCurrencyFull(detail.totalPay)}
                  </Text>
                </View>
              </View>

              {/* Performance */}
              {(detail.milesLogged > 0 || detail.loadsCompleted > 0) && (
                <>
                  <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
                    Performance
                  </Text>
                  <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 16, marginBottom: 20 }}>
                    {detail.milesLogged > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#0f172a' }}>
                        <Text style={{ color: '#64748b', fontSize: 13 }}>Miles Logged</Text>
                        <Text style={{ color: '#f1f5f9', fontSize: 13, fontWeight: '600' }}>
                          {detail.milesLogged.toLocaleString()}
                        </Text>
                      </View>
                    )}
                    {detail.loadsCompleted > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }}>
                        <Text style={{ color: '#64748b', fontSize: 13 }}>Loads Completed</Text>
                        <Text style={{ color: '#f1f5f9', fontSize: 13, fontWeight: '600' }}>
                          {detail.loadsCompleted}
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Paid date */}
              {detail.paidAt && (
                <Text style={{ color: '#22c55e', fontSize: 13, marginBottom: 16 }}>
                  Paid on {formatDate(detail.paidAt)}
                </Text>
              )}

              {/* Notes */}
              {detail.notes && (
                <>
                  <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
                    Notes
                  </Text>
                  <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 16, marginBottom: 20 }}>
                    <Text style={{ color: '#f1f5f9', fontSize: 13, lineHeight: 20 }}>{detail.notes}</Text>
                  </View>
                </>
              )}
            </ScrollView>
          ) : null}
        </BottomSheet>

        {/* Create form bottom sheet */}
        <BottomSheet
          visible={createVisible}
          onClose={() => { setCreateVisible(false); resetCreateForm() }}
          title="New Payroll Record"
          snapPoint="80%"
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {/* Driver picker */}
              <FormField label="Driver" required>
                <Pressable
                  onPress={() => setDriverPickerVisible(true)}
                  disabled={creating}
                  style={{
                    ...inputStyle,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ color: selectedDriver ? '#f1f5f9' : '#475569', fontSize: 14 }}>
                    {selectedDriver ? selectedDriver.name : 'Select driver'}
                  </Text>
                  <ChevronDown color="#475569" size={16} />
                </Pressable>
              </FormField>

              {/* Period dates */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <FormField label="Period Start" required hint="YYYY-MM-DD">
                    <TextInput
                      style={inputStyle}
                      value={periodStart}
                      onChangeText={setPeriodStart}
                      placeholder="2026-04-01"
                      placeholderTextColor="#475569"
                      keyboardType="numbers-and-punctuation"
                      editable={!creating}
                    />
                  </FormField>
                </View>
                <View style={{ flex: 1 }}>
                  <FormField label="Period End" required hint="YYYY-MM-DD">
                    <TextInput
                      style={inputStyle}
                      value={periodEnd}
                      onChangeText={setPeriodEnd}
                      placeholder="2026-04-14"
                      placeholderTextColor="#475569"
                      keyboardType="numbers-and-punctuation"
                      editable={!creating}
                    />
                  </FormField>
                </View>
              </View>

              {/* Pay fields */}
              <FormField label="Base Pay ($)" required>
                <TextInput
                  style={inputStyle}
                  value={basePay}
                  onChangeText={setBasePay}
                  placeholder="0.00"
                  placeholderTextColor="#475569"
                  keyboardType="decimal-pad"
                  editable={!creating}
                />
              </FormField>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <FormField label="Bonuses ($)">
                    <TextInput
                      style={inputStyle}
                      value={bonuses}
                      onChangeText={setBonuses}
                      placeholder="0.00"
                      placeholderTextColor="#475569"
                      keyboardType="decimal-pad"
                      editable={!creating}
                    />
                  </FormField>
                </View>
                <View style={{ flex: 1 }}>
                  <FormField label="Deductions ($)">
                    <TextInput
                      style={inputStyle}
                      value={deductions}
                      onChangeText={setDeductions}
                      placeholder="0.00"
                      placeholderTextColor="#475569"
                      keyboardType="decimal-pad"
                      editable={!creating}
                    />
                  </FormField>
                </View>
              </View>

              <FormField label="Notes">
                <TextInput
                  style={[inputStyle, { minHeight: 70, textAlignVertical: 'top' }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional notes..."
                  placeholderTextColor="#475569"
                  multiline
                  numberOfLines={3}
                  editable={!creating}
                />
              </FormField>

              {/* Submit */}
              <Pressable
                onPress={handleCreate}
                disabled={creating}
                style={{
                  backgroundColor: creating ? '#2d1e4f' : '#8b5cf6',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: creating ? 0.7 : 1,
                  marginTop: 4,
                }}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Create Payroll Record</Text>
                )}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </BottomSheet>

        {/* Driver picker sheet */}
        <BottomSheet
          visible={driverPickerVisible}
          onClose={() => setDriverPickerVisible(false)}
          title="Select Driver"
          snapPoint="60%"
        >
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
            {(drivers ?? []).length === 0 && (
              <Text style={{ color: '#64748b', fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>
                No active drivers found
              </Text>
            )}
            {(drivers ?? []).map((d) => (
              <Pressable
                key={d.id}
                onPress={() => {
                  haptic.light()
                  setSelectedDriver(d)
                  setDriverPickerVisible(false)
                }}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: '#1e293b',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: '#f1f5f9', fontSize: 15 }}>{d.name}</Text>
                {selectedDriver?.id === d.id && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#8b5cf6' }} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </BottomSheet>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
