import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type DriverOption, type TruckOption } from '@drivecommand/api-client'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { AddressInput } from '../../../components/owner/AddressInput'
import { haptic } from '../../../lib/haptics'
import { useThemeColors } from '../../../constants/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StopEntry {
  id: string
  address: string
  type: 'PICKUP' | 'DELIVERY'
  lat?: number
  lng?: number
}

// ─── Driver Picker Sheet ────────────────────────────────────────────────────

interface DriverPickerSheetProps {
  visible: boolean
  onClose: () => void
  selectedDriverId: string | null
  onSelect: (driverId: string, name: string) => void
  token: string
}

function DriverPickerSheet({
  visible,
  onClose,
  selectedDriverId,
  onSelect,
  token,
}: DriverPickerSheetProps) {
  const c = useThemeColors()

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['owner-active-drivers'],
    queryFn: () => ownerApi.getActiveDrivers(token),
    enabled: !!token && visible,
    staleTime: 60_000,
  })

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Select Driver" snapPoint="60%">
      {isLoading ? (
        <View className="flex-1 items-center justify-center py-8">
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {drivers.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-sm" style={{ color: c.textSecondary }}>No active drivers found</Text>
            </View>
          ) : (
            drivers.map((driver: DriverOption) => {
              const isSelected = driver.id === selectedDriverId
              return (
                <Pressable
                  key={driver.id}
                  onPress={() => {
                    onSelect(driver.id, driver.name)
                    onClose()
                  }}
                  className="flex-row items-center p-3 rounded-xl mb-2 border active:opacity-75"
                  style={{
                    backgroundColor: isSelected ? c.brandDark + '40' : c.surfaceElevated,
                    borderColor: isSelected ? c.brand : c.border,
                  }}
                >
                  <Text className="text-sm flex-1" style={{ color: c.textPrimary }} numberOfLines={1}>
                    {driver.name}
                  </Text>
                  {isSelected && (
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: c.brand }} />
                  )}
                </Pressable>
              )
            })
          )}
        </ScrollView>
      )}
    </BottomSheet>
  )
}

// ─── Truck Picker Sheet ─────────────────────────────────────────────────────

interface TruckPickerSheetProps {
  visible: boolean
  onClose: () => void
  selectedTruckId: string | null
  onSelect: (truckId: string, label: string) => void
  token: string
}

function TruckPickerSheet({
  visible,
  onClose,
  selectedTruckId,
  onSelect,
  token,
}: TruckPickerSheetProps) {
  const c = useThemeColors()

  const variantColors: Record<string, string> = {
    blue: '#3b82f6',
    amber: '#f59e0b',
    red: '#ef4444',
    green: '#22c55e',
  }

  const { data: trucks = [], isLoading } = useQuery({
    queryKey: ['owner-trucks'],
    queryFn: () => ownerApi.getTruckOptions(token),
    enabled: !!token && visible,
    staleTime: 60_000,
  })

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Select Truck" snapPoint="60%">
      {isLoading ? (
        <View className="flex-1 items-center justify-center py-8">
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {trucks.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-sm" style={{ color: c.textSecondary }}>No trucks found</Text>
            </View>
          ) : (
            trucks.map((truck: TruckOption) => {
              const isSelected = truck.id === selectedTruckId
              const dotColor = variantColors[truck.variant] ?? c.textTertiary
              const label = `${truck.year} ${truck.make} ${truck.model} — ${truck.licensePlate}`
              return (
                <Pressable
                  key={truck.id}
                  onPress={() => {
                    onSelect(truck.id, label)
                    onClose()
                  }}
                  className="flex-row items-center p-3 rounded-xl mb-2 border active:opacity-75"
                  style={{
                    backgroundColor: isSelected ? c.brandDark + '40' : c.surfaceElevated,
                    borderColor: isSelected ? c.brand : c.border,
                  }}
                >
                  <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: dotColor }} />
                  <Text className="text-sm flex-1" style={{ color: c.textPrimary }} numberOfLines={1}>
                    {label}
                  </Text>
                  {isSelected && (
                    <View className="w-2 h-2 rounded-full ml-2" style={{ backgroundColor: c.brand }} />
                  )}
                </Pressable>
              )
            })
          )}
        </ScrollView>
      )}
    </BottomSheet>
  )
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

interface StepIndicatorProps {
  current: 1 | 2
}

function StepIndicator({ current }: StepIndicatorProps) {
  const c = useThemeColors()
  return (
    <View className="flex-row items-center gap-2">
      {[1, 2].map((step) => {
        const isActive = step === current
        const isDone = step < current
        return (
          <React.Fragment key={step}>
            <View
              className="w-6 h-6 rounded-full items-center justify-center"
              style={{
                backgroundColor: isActive || isDone ? c.brand : c.surfaceElevated,
                borderWidth: 1,
                borderColor: isActive || isDone ? c.brand : c.border,
              }}
            >
              <Text className="text-xs font-bold" style={{ color: isActive || isDone ? '#fff' : c.textTertiary }}>
                {step}
              </Text>
            </View>
            {step < 2 && (
              <View
                className="flex-1 h-0.5"
                style={{ backgroundColor: isDone ? c.brand : c.border, width: 24 }}
              />
            )}
          </React.Fragment>
        )
      })}
      <Text className="text-xs ml-1" style={{ color: c.textTertiary }}>
        Step {current} of 2
      </Text>
    </View>
  )
}

// ─── Field Label ──────────────────────────────────────────────────────────────

function FieldLabel({ text }: { text: string }) {
  const c = useThemeColors()
  return (
    <Text className="text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: c.textTertiary }}>
      {text}
    </Text>
  )
}

// ─── Today's date ─────────────────────────────────────────────────────────────

function getTodayDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CreateRouteScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()

  // ─ Step state ─
  const [step, setStep] = useState<1 | 2>(1)

  // ─ Step 1 state ─
  const [name, setName] = useState('')
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [selectedDriverName, setSelectedDriverName] = useState<string>('')
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null)
  const [selectedTruckLabel, setSelectedTruckLabel] = useState<string>('')
  const [scheduledDate, setScheduledDate] = useState(getTodayDate())

  // ─ Step 2 state ─
  const [stops, setStops] = useState<StopEntry[]>([
    { id: '1', address: '', type: 'PICKUP' },
    { id: '2', address: '', type: 'DELIVERY' },
  ])

  // ─ Picker visibility ─
  const [driverPickerVisible, setDriverPickerVisible] = useState(false)
  const [truckPickerVisible, setTruckPickerVisible] = useState(false)

  // ─ Mutation ─
  const { mutate: createRoute, isPending } = useMutation({
    mutationFn: () =>
      ownerApi.createRoute(token!, {
        name: name.trim(),
        driverId: selectedDriverId!,
        truckId: selectedTruckId!,
        scheduledDate: scheduledDate || undefined,
        stops: stops.map((s) => ({ address: s.address, type: s.type })),
      }),
    onSuccess: () => {
      haptic.success()
      Toast.show({ type: 'success', text1: 'Route Created', text2: 'Your new route is ready.', visibilityTime: 3000 })
      queryClient.invalidateQueries({ queryKey: ['owner-routes'] })
      router.back()
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Failed to create route', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  // ─ Stop helpers ─
  const updateStopAddress = useCallback((id: string, address: string, lat?: number, lng?: number) => {
    setStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, address, lat, lng } : s))
    )
  }, [])

  const toggleStopType = useCallback((id: string) => {
    setStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, type: s.type === 'PICKUP' ? 'DELIVERY' : 'PICKUP' } : s))
    )
  }, [])

  const removeStop = useCallback((id: string) => {
    setStops((prev) => {
      if (prev.length <= 2) {
        Toast.show({ type: 'info', text1: 'Minimum 2 stops required', visibilityTime: 2500 })
        return prev
      }
      haptic.light()
      return prev.filter((s) => s.id !== id)
    })
  }, [])

  const addStop = useCallback(() => {
    haptic.light()
    setStops((prev) => [
      ...prev,
      { id: String(Date.now()), address: '', type: 'DELIVERY' },
    ])
  }, [])

  // ─ Navigation helpers ─
  const handleBack = useCallback(() => {
    if (step === 2) {
      haptic.light()
      setStep(1)
    } else {
      router.back()
    }
  }, [step, router])

  const handleNext = useCallback(() => {
    haptic.light()
    setStep(2)
  }, [])

  const handleSubmit = useCallback(() => {
    const emptyStop = stops.find((s) => !s.address.trim())
    if (emptyStop) {
      Toast.show({ type: 'error', text1: 'Incomplete stops', text2: 'All stops must have an address.', visibilityTime: 3000 })
      return
    }
    haptic.medium()
    createRoute()
  }, [stops, createRoute])

  const step1Valid = name.trim().length > 0 && !!selectedDriverId && !!selectedTruckId

  const inputStyle = {
    backgroundColor: c.surfaceInput,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: c.textPrimary,
    fontSize: 14,
  } as const

  const pickerRowStyle = {
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View
          className="flex-row items-center px-4 py-3"
          style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
        >
          <Pressable
            onPress={handleBack}
            className="mr-3 p-1.5 rounded-lg active:opacity-75"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft color={c.textSecondary} size={22} />
          </Pressable>
          <Text className="flex-1 text-lg font-bold" style={{ color: c.textPrimary }}>
            Create Route
          </Text>
          <StepIndicator current={step} />
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 20,
              paddingBottom: 32 + insets.bottom,
            }}
          >
            {/* ─────────────────────── STEP 1 ─────────────────────── */}
            {step === 1 && (
              <View>
                {/* Route Name */}
                <FieldLabel text="Route Name *" />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Chicago → Detroit Run"
                  placeholderTextColor={c.textMuted}
                  style={[inputStyle, { marginBottom: 16 }]}
                  returnKeyType="done"
                  accessibilityLabel="Route name"
                />

                {/* Driver Picker */}
                <FieldLabel text="Driver *" />
                <Pressable
                  onPress={() => setDriverPickerVisible(true)}
                  className="mb-4 active:opacity-75"
                  style={pickerRowStyle}
                  accessibilityLabel="Select driver"
                  accessibilityRole="button"
                >
                  <Text
                    className="text-sm flex-1"
                    style={{ color: selectedDriverId ? c.textPrimary : c.textMuted }}
                    numberOfLines={1}
                  >
                    {selectedDriverName || 'Select Driver'}
                  </Text>
                  <View className="w-2 h-2 rounded-full ml-2" style={{ backgroundColor: selectedDriverId ? c.brand : c.textTertiary }} />
                </Pressable>

                {/* Truck Picker */}
                <FieldLabel text="Truck *" />
                <Pressable
                  onPress={() => setTruckPickerVisible(true)}
                  className="mb-4 active:opacity-75"
                  style={pickerRowStyle}
                  accessibilityLabel="Select truck"
                  accessibilityRole="button"
                >
                  <Text
                    className="text-sm flex-1"
                    style={{ color: selectedTruckId ? c.textPrimary : c.textMuted }}
                    numberOfLines={1}
                  >
                    {selectedTruckLabel || 'Select Truck'}
                  </Text>
                  <View className="w-2 h-2 rounded-full ml-2" style={{ backgroundColor: selectedTruckId ? c.brand : c.textTertiary }} />
                </Pressable>

                {/* Scheduled Date */}
                <FieldLabel text="Scheduled Date (optional)" />
                <TextInput
                  value={scheduledDate}
                  onChangeText={setScheduledDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={c.textMuted}
                  style={[inputStyle, { marginBottom: 32 }]}
                  keyboardType="numeric"
                  maxLength={10}
                  returnKeyType="done"
                  accessibilityLabel="Scheduled date"
                />

                {/* Next Button */}
                <Pressable
                  onPress={handleNext}
                  disabled={!step1Valid}
                  className="rounded-xl py-3.5 items-center active:opacity-75"
                  style={{
                    backgroundColor: step1Valid ? c.brand : c.surfaceElevated,
                    borderWidth: step1Valid ? 0 : 1,
                    borderColor: c.border,
                  }}
                  accessibilityLabel="Next step"
                  accessibilityRole="button"
                >
                  <Text
                    className="font-semibold text-base"
                    style={{ color: step1Valid ? '#fff' : c.textTertiary }}
                  >
                    Next: Add Stops
                  </Text>
                </Pressable>
              </View>
            )}

            {/* ─────────────────────── STEP 2 ─────────────────────── */}
            {step === 2 && (
              <View>
                {/* Instruction */}
                <View
                  className="rounded-xl px-4 py-3 mb-5"
                  style={{ backgroundColor: c.brandDark + '20', borderWidth: 1, borderColor: c.brand + '40' }}
                >
                  <Text className="text-sm" style={{ color: c.textSecondary }}>
                    Add at least 2 stops (pickup and delivery points). Swipe a stop left to delete.
                  </Text>
                </View>

                {/* Stop List */}
                {stops.map((stop, index) => (
                  <View
                    key={stop.id}
                    className="rounded-xl p-3 mb-3 border"
                    style={{
                      backgroundColor: c.surfaceCard,
                      borderColor: c.border,
                      zIndex: 1000 - index,
                      overflow: 'visible',
                    }}
                  >
                    {/* Stop header row */}
                    <View className="flex-row items-center mb-2">
                      <View
                        className="w-6 h-6 rounded-full items-center justify-center mr-2"
                        style={{ backgroundColor: c.brand }}
                      >
                        <Text className="text-xs font-bold text-white">{index + 1}</Text>
                      </View>
                      <Pressable
                        onPress={() => toggleStopType(stop.id)}
                        className="px-2.5 py-1 rounded-lg active:opacity-75"
                        style={{
                          backgroundColor:
                            stop.type === 'PICKUP' ? '#16a34a20' : '#2563eb20',
                          borderWidth: 1,
                          borderColor: stop.type === 'PICKUP' ? '#16a34a60' : '#2563eb60',
                        }}
                        accessibilityLabel={`Toggle stop type, currently ${stop.type}`}
                        accessibilityRole="button"
                      >
                        <Text
                          className="text-xs font-semibold uppercase tracking-wide"
                          style={{ color: stop.type === 'PICKUP' ? '#22c55e' : '#60a5fa' }}
                        >
                          {stop.type}
                        </Text>
                      </Pressable>
                      {/* Delete button — only shown when more than 2 stops */}
                      {stops.length > 2 && (
                        <Pressable
                          onPress={() => removeStop(stop.id)}
                          className="ml-auto p-1.5 rounded-lg active:opacity-75"
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={`Delete stop ${index + 1}`}
                          accessibilityRole="button"
                        >
                          <Trash2 color="#ef4444" size={16} />
                        </Pressable>
                      )}
                    </View>

                    {/* Address input with z-index for dropdown */}
                    <View style={{ zIndex: 1000 - index }}>
                      <AddressInput
                        value={stop.address}
                        onChangeText={(text) => updateStopAddress(stop.id, text)}
                        onAddressSelect={(result) =>
                          updateStopAddress(stop.id, result.formatted_address, result.latitude, result.longitude)
                        }
                        placeholder={stop.type === 'PICKUP' ? 'Pickup address...' : 'Delivery address...'}
                      />
                    </View>
                  </View>
                ))}

                {/* Add Stop Button */}
                <Pressable
                  onPress={addStop}
                  className="flex-row items-center justify-center rounded-xl py-3 mb-6 border active:opacity-75"
                  style={{ backgroundColor: c.surfaceElevated, borderColor: c.border, borderStyle: 'dashed' }}
                  accessibilityLabel="Add stop"
                  accessibilityRole="button"
                >
                  <Plus color={c.brand} size={16} style={{ marginRight: 6 }} />
                  <Text className="text-sm font-medium" style={{ color: c.brand }}>
                    Add Stop
                  </Text>
                </Pressable>

                {/* Submit Button */}
                <Pressable
                  onPress={handleSubmit}
                  disabled={isPending}
                  className="rounded-xl py-3.5 items-center active:opacity-75"
                  style={{
                    backgroundColor: isPending ? c.brandDark : c.brand,
                    opacity: isPending ? 0.7 : 1,
                  }}
                  accessibilityLabel="Create route"
                  accessibilityRole="button"
                >
                  {isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold text-base">Create Route</Text>
                  )}
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Pickers */}
        <DriverPickerSheet
          visible={driverPickerVisible}
          onClose={() => setDriverPickerVisible(false)}
          selectedDriverId={selectedDriverId}
          onSelect={(id, name) => {
            setSelectedDriverId(id)
            setSelectedDriverName(name)
          }}
          token={token!}
        />

        <TruckPickerSheet
          visible={truckPickerVisible}
          onClose={() => setTruckPickerVisible(false)}
          selectedTruckId={selectedTruckId}
          onSelect={(id, label) => {
            setSelectedTruckId(id)
            setSelectedTruckLabel(label)
          }}
          token={token!}
        />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
