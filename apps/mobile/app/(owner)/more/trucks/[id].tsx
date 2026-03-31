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
import { AlertTriangle, ChevronLeft, Pencil, Truck } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi, type TruckDetail, type UpdateTruckPayload } from '@drivecommand/api-client'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { haptic } from '../../../../lib/haptics'

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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-4">
      <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</Text>
      <Text className="text-sm text-slate-100 font-medium">{value}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// EditTruckSheet
// ---------------------------------------------------------------------------

const inputClass = 'bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm'
const labelClass = 'text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5'

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
    // Build payload with only changed fields
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
      Toast.show({
        type: 'info',
        text1: 'No changes',
        text2: 'No fields were changed.',
        visibilityTime: 2500,
      })
      return
    }

    // Validate required fields haven't been emptied
    const currentMake = payload.make ?? initialData.make
    const currentModel = payload.model ?? initialData.model
    if (!currentMake || !currentModel) {
      Toast.show({
        type: 'error',
        text1: 'Missing fields',
        text2: 'Make and model cannot be empty.',
        visibilityTime: 3000,
      })
      return
    }

    onSave(payload)
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
              <Text className={labelClass}>Make</Text>
              <TextInput
                className={inputClass}
                placeholder="Freightliner"
                placeholderTextColor="#475569"
                value={make}
                onChangeText={setMake}
                autoCapitalize="words"
                editable={!isPending}
              />
            </View>
            <View className="flex-1">
              <Text className={labelClass}>Model</Text>
              <TextInput
                className={inputClass}
                placeholder="Cascadia"
                placeholderTextColor="#475569"
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
              <Text className={labelClass}>Year</Text>
              <TextInput
                className={inputClass}
                placeholder="2022"
                placeholderTextColor="#475569"
                value={year}
                onChangeText={setYear}
                keyboardType="numeric"
                editable={!isPending}
              />
            </View>
            <View className="flex-1">
              <Text className={labelClass}>License Plate</Text>
              <TextInput
                className={inputClass}
                placeholder="ABC-1234"
                placeholderTextColor="#475569"
                value={licensePlate}
                onChangeText={setLicensePlate}
                autoCapitalize="characters"
                editable={!isPending}
              />
            </View>
          </View>

          {/* VIN */}
          <View className="mb-4">
            <Text className={labelClass}>VIN</Text>
            <TextInput
              className={inputClass}
              placeholder="1XPBD49X1XD123456"
              placeholderTextColor="#475569"
              value={vin}
              onChangeText={setVin}
              autoCapitalize="characters"
              editable={!isPending}
            />
          </View>

          {/* Odometer */}
          <View className="mb-6">
            <Text className={labelClass}>Odometer (miles)</Text>
            <TextInput
              className={inputClass}
              placeholder="150000"
              placeholderTextColor="#475569"
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
            style={{ backgroundColor: isPending ? '#0c4a6e' : '#0284c7', opacity: isPending ? 0.7 : 1 }}
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
// Screen
// ---------------------------------------------------------------------------

export default function TruckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

  const [editSheetVisible, setEditSheetVisible] = useState(false)

  const { data: truck, isLoading, isError, error, refetch, isRefetching } = useQuery<TruckDetail>({
    queryKey: ['owner-truck', id],
    queryFn: () => ownerApi.getTruck(token!, id!),
    enabled: !!token && !!id,
  })

  const { mutate: updateTruck, isPending: isUpdating } = useMutation({
    mutationFn: (payload: UpdateTruckPayload) => ownerApi.updateTruck(token!, id!, payload),
    onSuccess: () => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['owner-truck', id] })
      queryClient.invalidateQueries({ queryKey: ['owner-trucks'] })
      Toast.show({
        type: 'success',
        text1: 'Truck updated',
        text2: 'Changes saved successfully.',
        visibilityTime: 3000,
      })
      setEditSheetVisible(false)
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: err.message || 'Please try again.',
        visibilityTime: 4000,
      })
    },
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  const colors = STATUS_COLORS[truck?.status ?? ''] ?? STATUS_COLORS['Ready to Use']
  const docMeta = truck?.documentMetadata

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
          <View className="flex-1 min-w-0">
            {truck ? (
              <Text className="text-lg font-bold text-slate-100" numberOfLines={1}>
                {truck.year} {truck.make} {truck.model}
              </Text>
            ) : (
              <Text className="text-lg font-bold text-slate-100">Truck Detail</Text>
            )}
          </View>
          {truck && (
            <View className="px-2.5 py-1 rounded-full ml-2" style={{ backgroundColor: colors.bg }}>
              <Text className="text-xs font-semibold" style={{ color: colors.text }}>
                {truck.status}
              </Text>
            </View>
          )}
          {/* Edit button */}
          {truck && (
            <Pressable
              onPress={() => { haptic.light(); setEditSheetVisible(true) }}
              hitSlop={8}
              className="active:opacity-75 ml-3"
            >
              <Pencil color="#94a3b8" size={18} />
            </Pressable>
          )}
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#38bdf8" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-slate-100 text-[17px] font-semibold mt-4 text-center">
              Failed to load truck
            </Text>
            <Text className="text-slate-500 text-sm mt-1.5 text-center">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable onPress={() => refetch()} className="mt-5 bg-sky-500 px-6 py-3 rounded-[10px]">
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
                  tintColor="#38bdf8"
                  colors={['#38bdf8']}
                />
              }
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            >
              {/* Vehicle Information */}
              <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
                <View className="flex-row items-center gap-2 mb-4">
                  <Truck color="#64748b" size={16} />
                  <Text className="text-white font-semibold text-base">Vehicle Information</Text>
                </View>
                <View className="flex-row flex-wrap">
                  <View className="w-1/2">
                    <InfoRow label="Make" value={truck.make} />
                  </View>
                  <View className="w-1/2">
                    <InfoRow label="Model" value={truck.model} />
                  </View>
                  <View className="w-1/2">
                    <InfoRow label="Year" value={String(truck.year)} />
                  </View>
                  <View className="w-1/2">
                    <InfoRow label="License Plate" value={truck.licensePlate} />
                  </View>
                  <View className="w-full">
                    <InfoRow label="VIN" value={truck.vin} />
                  </View>
                  <View className="w-1/2">
                    <InfoRow label="Odometer" value={`${truck.odometer.toLocaleString()} mi`} />
                  </View>
                  <View className="w-1/2">
                    <InfoRow label="Status" value={truck.status} />
                  </View>
                </View>
              </View>

              {/* Document Information */}
              <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
                <Text className="text-white font-semibold text-base mb-4">Document Information</Text>
                {docMeta && (docMeta.registrationNumber || docMeta.registrationExpiry || docMeta.insuranceNumber || docMeta.insuranceExpiry) ? (
                  <View className="flex-row flex-wrap">
                    {docMeta.registrationNumber && (
                      <View className="w-1/2">
                        <InfoRow label="Registration #" value={docMeta.registrationNumber} />
                      </View>
                    )}
                    {docMeta.registrationExpiry && (
                      <View className="w-1/2">
                        <InfoRow label="Reg. Expiry" value={formatDate(docMeta.registrationExpiry)} />
                      </View>
                    )}
                    {docMeta.insuranceNumber && (
                      <View className="w-1/2">
                        <InfoRow label="Insurance #" value={docMeta.insuranceNumber} />
                      </View>
                    )}
                    {docMeta.insuranceExpiry && (
                      <View className="w-1/2">
                        <InfoRow label="Ins. Expiry" value={formatDate(docMeta.insuranceExpiry)} />
                      </View>
                    )}
                  </View>
                ) : (
                  <Text className="text-slate-500 text-sm">No document information recorded</Text>
                )}
              </View>

              {/* Record History */}
              <View className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <Text className="text-white font-semibold text-base mb-4">Record History</Text>
                <View className="flex-row flex-wrap">
                  <View className="w-1/2">
                    <InfoRow label="Created" value={formatDate(truck.createdAt)} />
                  </View>
                  <View className="w-1/2">
                    <InfoRow label="Last Updated" value={formatDate(truck.updatedAt)} />
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Edit Truck Sheet */}
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
          </>
        ) : null}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
