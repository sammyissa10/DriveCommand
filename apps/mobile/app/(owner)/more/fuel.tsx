import React, { useCallback, useState } from 'react'
import {
  Modal,
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
import { AlertTriangle, ChevronLeft, Droplets, Plus } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import {
  ownerApi,
  type FuelEntry,
  type TruckOption,
} from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { FuelRowSkeleton } from '../../../components/skeletons/FuelRowSkeleton'

// ---------------------------------------------------------------------------
// FuelRow
// ---------------------------------------------------------------------------

function FuelRow({ entry }: { entry: FuelEntry }) {
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(entry.timestamp))

  const gallons = parseFloat(entry.quantity).toFixed(1)
  const totalCost = entry.totalCost
    ? `$${parseFloat(entry.totalCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

  return (
    <View className="mx-4 mb-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5 flex-row items-center">
      <View className="flex-1 min-w-0">
        <Text className="text-slate-100 font-semibold text-[15px] mb-0.5" numberOfLines={1}>
          {date}
        </Text>
        <Text className="text-slate-500 text-[13px]" numberOfLines={1}>
          {entry.truckName} · {entry.licensePlate}
        </Text>
      </View>
      <View className="items-end shrink-0 ml-2.5">
        <Text className="text-slate-100 font-semibold text-[14px]">
          {gallons} gal · {totalCost}
        </Text>
        {entry.location ? (
          <Text className="text-slate-500 text-[12px] mt-0.5" numberOfLines={1}>
            {entry.location}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// AddFuelModal
// ---------------------------------------------------------------------------

function AddFuelModal({
  visible,
  token,
  onClose,
  onSuccess,
}: {
  visible: boolean
  token: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null)
  const [gallons, setGallons] = useState('')
  const [costPerGallon, setCostPerGallon] = useState('')
  const [odometer, setOdometer] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  const { data: trucks } = useQuery<TruckOption[]>({
    queryKey: ['owner-trucks'],
    queryFn: () => ownerApi.getTrucks(token),
    enabled: !!token && visible,
    staleTime: 60_000,
  })

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () =>
      ownerApi.createFuelEntry(token, {
        truckId: selectedTruckId!,
        quantity: parseFloat(gallons),
        unitCost: parseFloat(costPerGallon),
        odometer: parseInt(odometer, 10),
        location: location.trim() || undefined,
        timestamp: date ? new Date(date).toISOString() : undefined,
      }),
    onSuccess: () => {
      onSuccess()
      handleClose()
    },
  })

  const handleClose = () => {
    setSelectedTruckId(null)
    setGallons('')
    setCostPerGallon('')
    setOdometer('')
    setLocation('')
    setDate(new Date().toISOString().split('T')[0])
    reset()
    onClose()
  }

  const isValid =
    selectedTruckId !== null &&
    parseFloat(gallons) > 0 &&
    parseFloat(costPerGallon) > 0 &&
    parseInt(odometer, 10) >= 0

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <View
          className="rounded-t-2xl px-4 pt-6 pb-8"
          style={{ backgroundColor: '#0f172a' }}
        >
          {/* Title */}
          <View className="flex-row items-center justify-between mb-5">
            <Text className="text-slate-100 text-lg font-bold">Add Fuel Entry</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Text className="text-slate-400 text-[15px]">Cancel</Text>
            </Pressable>
          </View>

          {/* Truck picker */}
          <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            Truck
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
            contentContainerStyle={{ gap: 8 }}
          >
            {(trucks ?? []).map((truck) => {
              const selected = truck.id === selectedTruckId
              return (
                <Pressable
                  key={truck.id}
                  onPress={() => setSelectedTruckId(truck.id)}
                  className="rounded-xl px-3.5 py-2.5"
                  style={{ backgroundColor: selected ? '#0ea5e9' : '#1e293b' }}
                >
                  <Text
                    className="font-semibold text-[13px]"
                    style={{ color: selected ? '#fff' : '#94a3b8' }}
                  >
                    {truck.make} {truck.model}
                  </Text>
                  <Text
                    className="text-[11px] mt-0.5"
                    style={{ color: selected ? '#bae6fd' : '#64748b' }}
                  >
                    {truck.licensePlate}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          {/* Gallons + Cost per Gallon */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                Gallons
              </Text>
              <TextInput
                value={gallons}
                onChangeText={setGallons}
                placeholder="0.0"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
                className="bg-slate-800 border border-slate-700 rounded-xl text-slate-100 px-4 py-3 text-[15px]"
              />
            </View>
            <View className="flex-1">
              <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                Cost / Gal
              </Text>
              <TextInput
                value={costPerGallon}
                onChangeText={setCostPerGallon}
                placeholder="$0.00"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
                className="bg-slate-800 border border-slate-700 rounded-xl text-slate-100 px-4 py-3 text-[15px]"
              />
            </View>
          </View>

          {/* Odometer + Location */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                Odometer
              </Text>
              <TextInput
                value={odometer}
                onChangeText={setOdometer}
                placeholder="Miles"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
                className="bg-slate-800 border border-slate-700 rounded-xl text-slate-100 px-4 py-3 text-[15px]"
              />
            </View>
            <View className="flex-1">
              <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                Location
              </Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="State / City"
                placeholderTextColor="#64748b"
                className="bg-slate-800 border border-slate-700 rounded-xl text-slate-100 px-4 py-3 text-[15px]"
              />
            </View>
          </View>

          {/* Date */}
          <View className="mb-5">
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
              Date (YYYY-MM-DD)
            </Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="2025-01-01"
              placeholderTextColor="#64748b"
              className="bg-slate-800 border border-slate-700 rounded-xl text-slate-100 px-4 py-3 text-[15px]"
            />
          </View>

          {/* Error */}
          {error && (
            <Text className="text-red-400 text-sm text-center mb-3">
              {error.message || 'Failed to save. Please try again.'}
            </Text>
          )}

          {/* Save button */}
          <Pressable
            onPress={() => mutate()}
            disabled={!isValid || isPending}
            className="bg-sky-500 rounded-xl py-3.5 items-center"
            style={{ opacity: !isValid || isPending ? 0.5 : 1 }}
          >
            <Text className="text-white font-semibold text-[15px]">
              {isPending ? 'Saving…' : 'Save Fuel Entry'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function FuelScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<{ entries: FuelEntry[] }>({
    queryKey: ['owner-fuel-log'],
    queryFn: () => ownerApi.getFuelLog(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  const renderEntry = useCallback(
    ({ item }: { item: FuelEntry }) => <FuelRow entry={item} />,
    []
  )

  const handleEntryAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['owner-fuel-log'] })
  }

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
          <Text className="text-lg font-bold text-slate-100">Fuel Log</Text>
        </View>

        {isLoading ? (
          <View className="pt-3">
            <FuelRowSkeleton />
            <FuelRowSkeleton />
            <FuelRowSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-slate-100 text-[17px] font-semibold mt-4 text-center">
              Failed to load fuel records
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
            data={data?.entries ?? []}
            renderItem={renderEntry}
            keyExtractor={(entry) => entry.id}
            estimatedItemSize={72}
            ListEmptyComponent={
              <View className="items-center justify-center px-6 pt-16">
                <Droplets color="#475569" size={48} />
                <Text className="text-slate-400 text-base font-semibold mt-3 text-center">
                  No fuel entries yet
                </Text>
                <Text className="text-slate-500 text-sm mt-1.5 text-center">
                  Tap the + button to log a fill-up
                </Text>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor="#38bdf8"
                colors={['#38bdf8']}
              />
            }
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 96 }}
          />
        )}

        {/* FAB */}
        <Pressable
          onPress={() => setShowModal(true)}
          accessibilityLabel="Add fuel entry"
          accessibilityRole="button"
          style={{
            position: 'absolute',
            bottom: 24,
            right: 16,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: '#0ea5e9',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Plus color="#fff" size={24} />
        </Pressable>

        {/* Add fuel modal */}
        {token && (
          <AddFuelModal
            visible={showModal}
            token={token}
            onClose={() => setShowModal(false)}
            onSuccess={handleEntryAdded}
          />
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
