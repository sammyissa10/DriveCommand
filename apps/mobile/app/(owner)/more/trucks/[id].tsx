import React, { useCallback, useEffect, useState } from 'react'
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
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, Pencil, Truck, Wrench } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../../context/AuthContext'
import {
  ownerApi,
  type TruckDetail,
  type UpdateTruckPayload,
  type MaintenanceEventSummary,
  type LogMaintenancePayload,
  type ScheduledServiceSummary,
  type CompleteScheduledServicePayload,
} from '@drivecommand/api-client'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { MaintenanceServicePicker } from '../../../../components/owner/MaintenanceServicePicker'
import { ScheduleServiceSheet } from '../../../../components/owner/ScheduleServiceSheet'
import { haptic } from '../../../../lib/haptics'
import { useThemeColors } from '../../../../constants/tokens'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  'In Use':         { text: '#38bdf8', bg: '#38bdf820' },
  'In Maintenance': { text: '#f59e0b', bg: '#f59e0b20' },
  'Expired Docs':   { text: '#ef4444', bg: '#ef444420' },
  'Ready to Use':   { text: '#22c55e', bg: '#22c55e20' },
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return '—'
  }
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function formatCost(cost: string | null | undefined): string {
  if (!cost) return ''
  const num = parseFloat(cost)
  if (isNaN(num)) return ''
  return `$${num.toFixed(2)}`
}

function todayISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const c = useThemeColors()
  return (
    <View className="mb-4">
      <Text className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: c.textTertiary }}>{label}</Text>
      <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>{value}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// EditTruckSheet
// ---------------------------------------------------------------------------

interface EditTruckSheetProps {
  visible: boolean
  onClose: () => void
  initialData: {
    make: string
    model: string
    year: number
    licensePlate: string
    vin: string
    odometer: number
  }
  onSave: (payload: UpdateTruckPayload) => void
  isPending: boolean
}

function EditTruckSheet({ visible, onClose, initialData, onSave, isPending }: EditTruckSheetProps) {
  const c = useThemeColors()
  const [make, setMake] = useState(initialData.make)
  const [model, setModel] = useState(initialData.model)
  const [year, setYear] = useState(String(initialData.year))
  const [licensePlate, setLicensePlate] = useState(initialData.licensePlate)
  const [vin, setVin] = useState(initialData.vin)
  const [odometer, setOdometer] = useState(String(initialData.odometer))

  useEffect(() => {
    if (visible) {
      setMake(initialData.make)
      setModel(initialData.model)
      setYear(String(initialData.year))
      setLicensePlate(initialData.licensePlate)
      setVin(initialData.vin)
      setOdometer(String(initialData.odometer))
    }
  }, [visible])

  function handleSave() {
    const payload: UpdateTruckPayload = {}

    if (make.trim() !== initialData.make) payload.make = make.trim()
    if (model.trim() !== initialData.model) payload.model = model.trim()
    const yearNum = parseInt(year, 10)
    if (!isNaN(yearNum) && yearNum !== initialData.year) payload.year = yearNum
    if (licensePlate.trim() !== initialData.licensePlate) payload.licensePlate = licensePlate.trim()
    if (vin.trim() !== initialData.vin) payload.vin = vin.trim()
    const odometerNum = parseFloat(odometer)
    if (!isNaN(odometerNum) && odometerNum !== initialData.odometer) payload.odometer = odometerNum

    if (Object.keys(payload).length === 0) {
      Toast.show({ type: 'info', text1: 'No changes', text2: 'No fields were changed.', visibilityTime: 2500 })
      return
    }

    const currentMake = payload.make ?? initialData.make
    const currentModel = payload.model ?? initialData.model
    if (!currentMake || !currentModel) {
      Toast.show({ type: 'error', text1: 'Missing fields', text2: 'Make and model cannot be empty.', visibilityTime: 3000 })
      return
    }

    onSave(payload)
  }

  const inputStyle = {
    backgroundColor: c.surfaceInput,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  } as const

  const labelStyle = {
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit Truck" snapPoint="80%">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {/* Make + Model row */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text style={labelStyle}>Make</Text>
              <TextInput
                style={inputStyle}
                placeholder="Freightliner"
                placeholderTextColor={c.textMuted}
                value={make}
                onChangeText={setMake}
                autoCapitalize="words"
                editable={!isPending}
              />
            </View>
            <View className="flex-1">
              <Text style={labelStyle}>Model</Text>
              <TextInput
                style={inputStyle}
                placeholder="Cascadia"
                placeholderTextColor={c.textMuted}
                value={model}
                onChangeText={setModel}
                autoCapitalize="words"
                editable={!isPending}
              />
            </View>
          </View>

          {/* Year + License Plate row */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text style={labelStyle}>Year</Text>
              <TextInput
                style={inputStyle}
                placeholder="2022"
                placeholderTextColor={c.textMuted}
                value={year}
                onChangeText={setYear}
                keyboardType="numeric"
                editable={!isPending}
              />
            </View>
            <View className="flex-1">
              <Text style={labelStyle}>License Plate</Text>
              <TextInput
                style={inputStyle}
                placeholder="ABC-1234"
                placeholderTextColor={c.textMuted}
                value={licensePlate}
                onChangeText={setLicensePlate}
                autoCapitalize="characters"
                editable={!isPending}
              />
            </View>
          </View>

          {/* VIN */}
          <View className="mb-4">
            <Text style={labelStyle}>VIN</Text>
            <TextInput
              style={inputStyle}
              placeholder="1XPBD49X1XD123456"
              placeholderTextColor={c.textMuted}
              value={vin}
              onChangeText={setVin}
              autoCapitalize="characters"
              editable={!isPending}
            />
          </View>

          {/* Odometer */}
          <View className="mb-6">
            <Text style={labelStyle}>Odometer (miles)</Text>
            <TextInput
              style={inputStyle}
              placeholder="150000"
              placeholderTextColor={c.textMuted}
              value={odometer}
              onChangeText={setOdometer}
              keyboardType="numeric"
              editable={!isPending}
            />
          </View>

          {/* Save button */}
          <Pressable
            onPress={handleSave}
            disabled={isPending}
            className="rounded-xl py-4 items-center"
            style={{ backgroundColor: isPending ? c.brandDark : c.brand, opacity: isPending ? 0.7 : 1 }}
          >
            {isPending
              ? <ActivityIndicator size="small" color="white" />
              : <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Save Changes</Text>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------
// LogMaintenanceSheet
// ---------------------------------------------------------------------------

interface LogMaintenanceSheetProps {
  visible: boolean
  onClose: () => void
  initialOdometer: number
  onSave: (payload: LogMaintenancePayload) => void
  isPending: boolean
}

function LogMaintenanceSheet({ visible, onClose, initialOdometer, onSave, isPending }: LogMaintenanceSheetProps) {
  const c = useThemeColors()
  const [serviceType, setServiceType] = useState('')
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [odometer, setOdometer] = useState(String(initialOdometer))
  const [serviceDate, setServiceDate] = useState(todayISO())
  const [pickerVisible, setPickerVisible] = useState(false)

  useEffect(() => {
    if (visible) {
      setServiceType('')
      setNotes('')
      setCost('')
      setOdometer(String(initialOdometer))
      setServiceDate(todayISO())
    }
  }, [visible, initialOdometer])

  function handleSave() {
    if (!serviceType.trim()) {
      Toast.show({ type: 'error', text1: 'Missing service type', text2: 'Please enter the type of service.', visibilityTime: 3000 })
      return
    }
    const odometerNum = parseInt(odometer, 10)
    if (isNaN(odometerNum) || odometerNum < 0) {
      Toast.show({ type: 'error', text1: 'Invalid odometer', text2: 'Odometer must be a non-negative number.', visibilityTime: 3000 })
      return
    }
    const parsedDate = new Date(serviceDate)
    if (isNaN(parsedDate.getTime())) {
      Toast.show({ type: 'error', text1: 'Invalid date', text2: 'Please enter a valid date (YYYY-MM-DD).', visibilityTime: 3000 })
      return
    }

    const payload: LogMaintenancePayload = {
      serviceType: serviceType.trim(),
      serviceDate: parsedDate.toISOString(),
      odometerAtService: odometerNum,
    }
    if (cost.trim()) {
      const costNum = parseFloat(cost)
      if (!isNaN(costNum) && costNum >= 0) payload.cost = costNum
    }
    if (notes.trim()) payload.notes = notes.trim()

    onSave(payload)
  }

  const inputStyle = {
    backgroundColor: c.surfaceInput,
    borderWidth: 1,
    borderColor: c.border,
    color: c.textPrimary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  } as const

  const labelStyle = {
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  }

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Log Maintenance" snapPoint="80%">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {/* Service Type */}
            <View className="mb-4">
              <Text style={labelStyle}>Service Type</Text>
              <Pressable
                onPress={() => { haptic.light(); setPickerVisible(true) }}
                style={[inputStyle, { justifyContent: 'center' }]}
                disabled={isPending}
              >
                <Text style={{ color: serviceType ? c.textPrimary : c.textMuted, fontSize: 14 }}>
                  {serviceType || 'Select service type'}
                </Text>
              </Pressable>
            </View>

          {/* Service Date + Odometer row */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text style={labelStyle}>Service Date</Text>
              <TextInput
                style={inputStyle}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.textMuted}
                value={serviceDate}
                onChangeText={setServiceDate}
                keyboardType="numeric"
                editable={!isPending}
              />
            </View>
            <View className="flex-1">
              <Text style={labelStyle}>Odometer (mi)</Text>
              <TextInput
                style={inputStyle}
                placeholder="150000"
                placeholderTextColor={c.textMuted}
                value={odometer}
                onChangeText={setOdometer}
                keyboardType="numeric"
                editable={!isPending}
              />
            </View>
          </View>

          {/* Cost */}
          <View className="mb-4">
            <Text style={labelStyle}>Cost ($)</Text>
            <TextInput
              style={inputStyle}
              placeholder="0.00"
              placeholderTextColor={c.textMuted}
              value={cost}
              onChangeText={setCost}
              keyboardType="numeric"
              editable={!isPending}
            />
          </View>

          {/* Notes */}
          <View className="mb-6">
            <Text style={labelStyle}>Notes</Text>
            <TextInput
              style={[inputStyle, { minHeight: 72, textAlignVertical: 'top' }]}
              placeholder="Describe the service performed..."
              placeholderTextColor={c.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!isPending}
            />
          </View>

          {/* Save button */}
          <Pressable
            onPress={handleSave}
            disabled={isPending}
            className="rounded-xl py-4 items-center"
            style={{ backgroundColor: isPending ? c.brandDark : c.brand, opacity: isPending ? 0.7 : 1 }}
          >
            {isPending
              ? <ActivityIndicator size="small" color="white" />
              : <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Save Record</Text>
            }
          </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </BottomSheet>

      <MaintenanceServicePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={setServiceType}
        selectedType={serviceType}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TruckDetailScreen() {
  const c = useThemeColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

  const [editSheetVisible, setEditSheetVisible] = useState(false)
  const [maintenanceSheetVisible, setMaintenanceSheetVisible] = useState(false)
  const [scheduleSheetVisible, setScheduleSheetVisible] = useState(false)
  const [completeSheetVisible, setCompleteSheetVisible] = useState(false)
  const [completingService, setCompletingService] = useState<ScheduledServiceSummary | null>(null)
  const [actualDate, setActualDate] = useState('')
  const [actualOdometer, setActualOdometer] = useState('')

  const { data: truck, isLoading, isError, error, refetch, isRefetching } = useQuery<TruckDetail>({
    queryKey: ['owner-truck', id],
    queryFn: () => ownerApi.getTruck(token!, id!),
    enabled: !!token && !!id,
  })

  const { data: maintenance, isLoading: maintenanceLoading, refetch: refetchMaintenance } = useQuery<MaintenanceEventSummary[]>({
    queryKey: ['owner-truck-maintenance', id],
    queryFn: () => ownerApi.getTruckMaintenance(token!, id!),
    enabled: !!token && !!id,
  })

  const { data: scheduledServices, isLoading: scheduledLoading, refetch: refetchScheduled } = useQuery<ScheduledServiceSummary[]>({
    queryKey: ['truck-scheduled-services', id],
    queryFn: () => ownerApi.getScheduledServices(token!, id!),
    enabled: !!token && !!id,
  })

  const { mutate: updateTruck, isPending: isUpdating } = useMutation({
    mutationFn: (payload: UpdateTruckPayload) => ownerApi.updateTruck(token!, id!, payload),
    onSuccess: () => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['owner-truck', id] })
      queryClient.invalidateQueries({ queryKey: ['owner-trucks'] })
      Toast.show({ type: 'success', text1: 'Truck updated', text2: 'Changes saved successfully.', visibilityTime: 3000 })
      setEditSheetVisible(false)
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Update failed', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  const { mutate: logMaintenance, isPending: isLogging } = useMutation({
    mutationFn: (payload: LogMaintenancePayload) => ownerApi.logMaintenanceEvent(token!, id!, payload),
    onSuccess: () => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['owner-truck-maintenance', id] })
      Toast.show({ type: 'success', text1: 'Maintenance logged', text2: 'Service record saved.', visibilityTime: 3000 })
      setMaintenanceSheetVisible(false)
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Failed to log', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  const { mutate: completeService, isPending: isCompleting } = useMutation({
    mutationFn: (payload: CompleteScheduledServicePayload) => ownerApi.completeScheduledService(token!, id!, payload),
    onSuccess: () => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['truck-scheduled-services', id] })
      queryClient.invalidateQueries({ queryKey: ['owner-truck-maintenance', id] })
      queryClient.invalidateQueries({ queryKey: ['all-scheduled-services'] })
      Toast.show({ type: 'success', text1: 'Service completed', text2: 'Maintenance record created.', visibilityTime: 3000 })
      setCompleteSheetVisible(false)
      setCompletingService(null)
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Failed to complete', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  const onRefresh = useCallback(() => {
    refetch()
    refetchMaintenance()
    refetchScheduled()
  }, [refetch, refetchMaintenance, refetchScheduled])

  function openCompleteSheet(service: ScheduledServiceSummary) {
    setCompletingService(service)
    setActualDate(todayISO())
    setActualOdometer(String(truck?.odometer ?? ''))
    setCompleteSheetVisible(true)
  }

  function handleCompleteService() {
    if (!completingService) return
    const payload: CompleteScheduledServicePayload = {
      serviceId: completingService.id,
    }
    if (actualDate.trim()) payload.actualDate = actualDate.trim()
    if (actualOdometer.trim()) {
      const miles = parseInt(actualOdometer, 10)
      if (!isNaN(miles) && miles >= 0) payload.actualOdometer = miles
    }
    completeService(payload)
  }

  const statusColors = STATUS_COLORS[truck?.status ?? ''] ?? STATUS_COLORS['Ready to Use']
  const docMeta = truck?.documentMetadata

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View
          className="flex-row items-center px-4 py-3.5"
          style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
        >
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            className="mr-3"
            hitSlop={8}
          >
            <ChevronLeft color={c.textPrimary} size={24} />
          </Pressable>
          <View className="flex-1 min-w-0">
            {truck ? (
              <Text className="text-lg font-bold" style={{ color: c.textPrimary }} numberOfLines={1}>
                {truck.year} {truck.make} {truck.model}
              </Text>
            ) : (
              <Text className="text-lg font-bold" style={{ color: c.textPrimary }}>Truck Detail</Text>
            )}
          </View>
          {truck && (
            <View className="px-2.5 py-1 rounded-full ml-2" style={{ backgroundColor: statusColors.bg }}>
              <Text className="text-xs font-semibold" style={{ color: statusColors.text }}>
                {truck.status}
              </Text>
            </View>
          )}
          {truck && (
            <Pressable
              onPress={() => { haptic.light(); setEditSheetVisible(true) }}
              hitSlop={8}
              className="active:opacity-75 ml-3"
            >
              <Pencil color={c.textSecondary} size={18} />
            </Pressable>
          )}
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={c.brand} />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-[17px] font-semibold mt-4 text-center" style={{ color: c.textPrimary }}>
              Failed to load truck
            </Text>
            <Text className="text-sm mt-1.5 text-center" style={{ color: c.textTertiary }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable onPress={() => refetch()} className="mt-5 px-6 py-3 rounded-[10px]" style={{ backgroundColor: c.brand }}>
              <Text className="text-white font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : truck ? (
          <>
            <ScrollView
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={onRefresh}
                  tintColor={c.brand}
                  colors={[c.brand]}
                />
              }
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            >
              {/* Vehicle Information */}
              <View
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
              >
                <View className="flex-row items-center gap-2 mb-4">
                  <Truck color={c.textTertiary} size={16} />
                  <Text className="font-semibold text-base" style={{ color: c.textPrimary }}>Vehicle Information</Text>
                </View>
                <View className="flex-row flex-wrap">
                  <View className="w-1/2"><InfoRow label="Make" value={truck.make} /></View>
                  <View className="w-1/2"><InfoRow label="Model" value={truck.model} /></View>
                  <View className="w-1/2"><InfoRow label="Year" value={String(truck.year)} /></View>
                  <View className="w-1/2"><InfoRow label="License Plate" value={truck.licensePlate} /></View>
                  <View className="w-full"><InfoRow label="VIN" value={truck.vin} /></View>
                  <View className="w-1/2"><InfoRow label="Odometer" value={`${truck.odometer.toLocaleString()} mi`} /></View>
                  <View className="w-1/2"><InfoRow label="Status" value={truck.status} /></View>
                </View>
              </View>

              {/* Document Information */}
              <View
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
              >
                <Text className="font-semibold text-base mb-4" style={{ color: c.textPrimary }}>Document Information</Text>
                {docMeta && (docMeta.registrationNumber || docMeta.registrationExpiry || docMeta.insuranceNumber || docMeta.insuranceExpiry) ? (
                  <View className="flex-row flex-wrap">
                    {docMeta.registrationNumber && <View className="w-1/2"><InfoRow label="Registration #" value={docMeta.registrationNumber} /></View>}
                    {docMeta.registrationExpiry && <View className="w-1/2"><InfoRow label="Reg. Expiry" value={formatDate(docMeta.registrationExpiry)} /></View>}
                    {docMeta.insuranceNumber && <View className="w-1/2"><InfoRow label="Insurance #" value={docMeta.insuranceNumber} /></View>}
                    {docMeta.insuranceExpiry && <View className="w-1/2"><InfoRow label="Ins. Expiry" value={formatDate(docMeta.insuranceExpiry)} /></View>}
                  </View>
                ) : (
                  <Text className="text-sm" style={{ color: c.textTertiary }}>No document information recorded</Text>
                )}
              </View>

              {/* Service History */}
              <View
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
              >
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center gap-2">
                    <Wrench color={c.textTertiary} size={16} />
                    <Text className="font-semibold text-base" style={{ color: c.textPrimary }}>Service History</Text>
                  </View>
                  <Pressable
                    onPress={() => { haptic.light(); setMaintenanceSheetVisible(true) }}
                    hitSlop={8}
                    className="active:opacity-75"
                  >
                    <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600' }}>Log</Text>
                  </Pressable>
                </View>

                {maintenanceLoading ? (
                  <ActivityIndicator size="small" color={c.brand} />
                ) : !maintenance || maintenance.length === 0 ? (
                  <Text className="text-sm" style={{ color: c.textTertiary }}>No maintenance records</Text>
                ) : (
                  maintenance.map((event, index) => (
                    <View key={event.id}>
                      {index > 0 && <View className="h-px my-3" style={{ backgroundColor: c.border }} />}
                      <View className="flex-row items-start justify-between">
                        <Text className="font-semibold text-sm flex-1 mr-2" style={{ color: c.textPrimary }}>{event.serviceType}</Text>
                        <Text className="text-xs" style={{ color: c.textTertiary }}>{formatDateShort(event.serviceDate)}</Text>
                      </View>
                      <View className="flex-row gap-3 mt-1">
                        {event.cost && (
                          <Text className="text-xs" style={{ color: c.textSecondary }}>{formatCost(event.cost)}</Text>
                        )}
                        <Text className="text-xs" style={{ color: c.textSecondary }}>{event.odometerAtService.toLocaleString()} mi</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Scheduled Services */}
              <View
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
              >
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center gap-2">
                    <Wrench color={c.textTertiary} size={16} />
                    <Text className="font-semibold text-base" style={{ color: c.textPrimary }}>Scheduled Services</Text>
                  </View>
                  <Pressable
                    onPress={() => { haptic.light(); setScheduleSheetVisible(true) }}
                    hitSlop={8}
                    className="active:opacity-75"
                  >
                    <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600' }}>Schedule</Text>
                  </Pressable>
                </View>

                {scheduledLoading ? (
                  <ActivityIndicator size="small" color={c.brand} />
                ) : !scheduledServices || scheduledServices.length === 0 ? (
                  <Text className="text-sm" style={{ color: c.textTertiary }}>No scheduled services</Text>
                ) : (
                  scheduledServices.map((service, index) => {
                    const statusLabel = service.status === 'overdue' ? 'Overdue' : service.status === 'due_soon' ? 'Due Soon' : 'OK'
                    const statusColor = service.status === 'overdue' ? '#ef4444' : service.status === 'due_soon' ? '#f59e0b' : '#22c55e'
                    const statusBg = service.status === 'overdue' ? '#ef444420' : service.status === 'due_soon' ? '#f59e0b20' : '#22c55e20'
                    return (
                      <View key={service.id}>
                        {index > 0 && <View className="h-px my-3" style={{ backgroundColor: c.border }} />}
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 min-w-0 mr-3">
                            <Text className="font-semibold text-sm" style={{ color: c.textPrimary }}>{service.serviceType}</Text>
                            <Text className="text-xs mt-0.5" style={{ color: c.textTertiary }}>
                              {service.dueDate ? `Due ${formatDateShort(service.dueDate)}` : ''}
                              {service.dueDate && service.dueMileage ? '  ·  ' : ''}
                              {service.dueMileage ? `${service.dueMileage.toLocaleString()} mi` : ''}
                            </Text>
                          </View>
                          <View className="items-end gap-1.5">
                            <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: statusBg }}>
                              <Text className="text-[11px] font-semibold" style={{ color: statusColor }}>{statusLabel}</Text>
                            </View>
                            <Pressable
                              onPress={() => { haptic.light(); openCompleteSheet(service) }}
                              className="active:opacity-75"
                            >
                              <Text style={{ color: c.brand, fontSize: 12, fontWeight: '600' }}>Mark Complete</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    )
                  })
                )}
              </View>

              {/* Record History */}
              <View
                className="rounded-xl p-4"
                style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
              >
                <Text className="font-semibold text-base mb-4" style={{ color: c.textPrimary }}>Record History</Text>
                <View className="flex-row flex-wrap">
                  <View className="w-1/2"><InfoRow label="Created" value={formatDate(truck.createdAt)} /></View>
                  <View className="w-1/2"><InfoRow label="Last Updated" value={formatDate(truck.updatedAt)} /></View>
                </View>
              </View>
            </ScrollView>

            <EditTruckSheet
              visible={editSheetVisible}
              onClose={() => setEditSheetVisible(false)}
              initialData={{
                make: truck.make,
                model: truck.model,
                year: truck.year,
                licensePlate: truck.licensePlate,
                vin: truck.vin,
                odometer: truck.odometer,
              }}
              onSave={updateTruck}
              isPending={isUpdating}
            />

            <LogMaintenanceSheet
              visible={maintenanceSheetVisible}
              onClose={() => setMaintenanceSheetVisible(false)}
              initialOdometer={truck.odometer}
              onSave={logMaintenance}
              isPending={isLogging}
            />

            <ScheduleServiceSheet
              visible={scheduleSheetVisible}
              onClose={() => setScheduleSheetVisible(false)}
              truckId={id!}
              token={token!}
              onSuccess={() => queryClient.invalidateQueries({ queryKey: ['truck-scheduled-services', id] })}
            />

            {/* Mark Complete confirmation sheet */}
            <BottomSheet
              visible={completeSheetVisible}
              onClose={() => { setCompleteSheetVisible(false); setCompletingService(null) }}
              title="Mark Service Complete"
              snapPoint="60%"
            >
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 16 }}
                >
                  {completingService && (
                    <View
                      className="rounded-xl px-3 py-2.5 mb-4"
                      style={{ backgroundColor: `${c.brand}10`, borderWidth: 1, borderColor: `${c.brand}30` }}
                    >
                      <Text className="text-sm font-semibold" style={{ color: c.textPrimary }}>
                        {completingService.serviceType}
                      </Text>
                    </View>
                  )}

                  {/* Actual Date */}
                  <View className="mb-4">
                    <Text style={{
                      color: c.textSecondary,
                      fontSize: 11,
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}>Actual Service Date</Text>
                    <TextInput
                      style={{
                        backgroundColor: c.surfaceInput,
                        borderWidth: 1,
                        borderColor: c.border,
                        color: c.textPrimary,
                        borderRadius: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        fontSize: 14,
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={c.textMuted}
                      value={actualDate}
                      onChangeText={setActualDate}
                      keyboardType="numeric"
                      editable={!isCompleting}
                    />
                  </View>

                  {/* Actual Odometer */}
                  <View className="mb-6">
                    <Text style={{
                      color: c.textSecondary,
                      fontSize: 11,
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}>Odometer at Service (mi)</Text>
                    <TextInput
                      style={{
                        backgroundColor: c.surfaceInput,
                        borderWidth: 1,
                        borderColor: c.border,
                        color: c.textPrimary,
                        borderRadius: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        fontSize: 14,
                      }}
                      placeholder="150000"
                      placeholderTextColor={c.textMuted}
                      value={actualOdometer}
                      onChangeText={setActualOdometer}
                      keyboardType="numeric"
                      editable={!isCompleting}
                    />
                  </View>

                  <Pressable
                    onPress={handleCompleteService}
                    disabled={isCompleting}
                    className="rounded-xl py-4 items-center"
                    style={{ backgroundColor: isCompleting ? c.brandDark : c.brand, opacity: isCompleting ? 0.7 : 1 }}
                  >
                    {isCompleting
                      ? <ActivityIndicator size="small" color="white" />
                      : <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Confirm Complete</Text>
                    }
                  </Pressable>
                </ScrollView>
              </KeyboardAvoidingView>
            </BottomSheet>
          </>
        ) : null}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
