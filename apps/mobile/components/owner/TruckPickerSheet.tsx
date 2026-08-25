import React, { useCallback } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, AlertTriangle } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { BottomSheet } from '../ui/BottomSheet'
import { ownerApi, type TruckOption } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'

interface TruckPickerSheetProps {
  visible: boolean
  onClose: () => void
  loadId: string
  currentTruckId: string | null
  onAssigned: () => void
}

export function TruckPickerSheet({
  visible,
  onClose,
  loadId,
  currentTruckId,
  onAssigned,
}: TruckPickerSheetProps) {
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

  const { data: trucks, isLoading } = useQuery({
    // TKT-0076: the picker variant — samples excluded, and its OWN cache key so
    // it cannot collide with the trucks LIST, which still shows them.
    queryKey: ['owner-truck-options'],
    queryFn: () => ownerApi.getTruckOptions(token!),
    enabled: !!token && visible,
  })

  const { mutate: assignTruck, isPending, variables: pendingTruckId } = useMutation({
    mutationFn: (truckId: string | null) =>
      ownerApi.assignTruck(token!, loadId, truckId),
    onSuccess: () => {
      onAssigned()
      onClose()
      Toast.show({
        type: 'success',
        text1: 'Truck assigned',
        text2: 'The truck has been updated on this load.',
        visibilityTime: 3000,
      })
    },
    onError: (error: Error) => {
      Toast.show({
        type: 'error',
        text1: 'Failed to assign truck',
        text2: error.message || 'Please try again.',
        visibilityTime: 4000,
      })
    },
  })

  const handleSelect = useCallback(
    (truckId: string | null) => {
      if (isPending) return
      assignTruck(truckId)
    },
    [isPending, assignTruck]
  )

  const renderTruckRow = useCallback(
    (truck: TruckOption) => {
      const isSelected = truck.id === currentTruckId
      const isThisLoading = isPending && pendingTruckId === truck.id

      return (
        <Pressable
          key={truck.id}
          onPress={() => handleSelect(truck.id)}
          disabled={isPending}
          className={`flex-row items-center p-3 rounded-xl mb-2 border ${
            isSelected
              ? 'bg-sky-900/40 border-sky-500'
              : 'bg-slate-700/50 border-slate-600 active:opacity-75'
          }`}
        >
          {/* Truck info */}
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="text-white font-semibold text-sm">
                {truck.year} {truck.make} {truck.model}
              </Text>
              {truck.inMaintenance && (
                <View className="flex-row items-center gap-1 bg-amber-900/60 px-2 py-0.5 rounded-full">
                  <AlertTriangle color="#fbbf24" size={10} />
                  <Text className="text-amber-400 text-xs">In Maintenance</Text>
                </View>
              )}
            </View>
            <Text className="text-slate-400 text-xs mt-0.5">{truck.licensePlate}</Text>
          </View>

          {/* Selected indicator or loading spinner */}
          <View className="ml-3">
            {isThisLoading ? (
              <ActivityIndicator size="small" color="#0ea5e9" />
            ) : isSelected ? (
              <Check color="#0ea5e9" size={18} />
            ) : null}
          </View>
        </Pressable>
      )
    },
    [currentTruckId, isPending, pendingTruckId, handleSelect]
  )

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Select Truck" snapPoint="60%">
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text className="text-slate-400 mt-3 text-sm">Loading trucks...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Unassign option — only shown when a truck is currently assigned */}
          {currentTruckId && (
            <Pressable
              onPress={() => handleSelect(null)}
              disabled={isPending}
              className={`flex-row items-center p-3 rounded-xl mb-2 border border-slate-600 bg-slate-700/50 active:opacity-75 ${
                isPending && pendingTruckId === null ? 'opacity-60' : ''
              }`}
            >
              <View className="flex-1">
                <Text className="text-red-400 font-semibold text-sm">Unassign Truck</Text>
                <Text className="text-slate-500 text-xs mt-0.5">Remove truck from this load</Text>
              </View>
              {isPending && pendingTruckId === null && (
                <ActivityIndicator size="small" color="#f87171" />
              )}
            </Pressable>
          )}

          {/* Truck list */}
          {(trucks ?? []).length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-slate-400 text-sm">No trucks available</Text>
            </View>
          ) : (
            (trucks ?? []).map(renderTruckRow)
          )}
        </ScrollView>
      )}
    </BottomSheet>
  )
}
