import React, { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Toast from 'react-native-toast-message'
import { useQueryClient } from '@tanstack/react-query'
import { driverApi, type LoadDetail } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'

interface NextAction {
  label: string
  nextStatus: string
}

function getNextAction(dbStatus: string): NextAction | null {
  switch (dbStatus) {
    case 'PENDING':
      return { label: 'Accept Load', nextStatus: 'ACCEPTED' }
    case 'DISPATCHED':
      return { label: 'Start Route', nextStatus: 'EN_ROUTE' }
    case 'IN_TRANSIT':
    case 'PICKED_UP':
      return { label: 'Mark Delivered', nextStatus: 'DELIVERED' }
    case 'DELIVERED':
    case 'INVOICED':
    case 'CANCELLED':
    default:
      return null
  }
}

interface StatusUpdateButtonProps {
  load: LoadDetail
  onStatusUpdated: () => void
}

export function StatusUpdateButton({ load, onStatusUpdated }: StatusUpdateButtonProps) {
  const { token } = useAuthContext()
  const queryClient = useQueryClient()
  const [modalVisible, setModalVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const action = getNextAction(load.status)

  // Don't render for terminal statuses
  if (!action) return null

  async function handleConfirm() {
    if (!token || isLoading) return

    setIsLoading(true)
    try {
      await driverApi.updateLoadStatus(token, load.id, action!.nextStatus)

      // Success path: haptic + close modal + invalidate queries + notify parent
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setModalVisible(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['driver-load', load.id] }),
        queryClient.invalidateQueries({ queryKey: ['driver-loads'] }),
        queryClient.invalidateQueries({ queryKey: ['driver-dashboard'] }),
      ])
      onStatusUpdated()
    } catch (err) {
      // Error path: close modal + toast + re-enable button
      setModalVisible(false)
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: err instanceof Error ? err.message : 'An unexpected error occurred',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Main action button */}
      <Pressable
        onPress={() => setModalVisible(true)}
        className="bg-sky-600 rounded-xl items-center active:bg-sky-700"
        style={{ paddingVertical: 18, paddingHorizontal: 24 }}
      >
        <Text className="text-white text-lg font-bold tracking-wide">{action.label}</Text>
      </Pressable>

      {/* Confirmation modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !isLoading && setModalVisible(false)}
      >
        {/* Backdrop */}
        <Pressable
          className="flex-1 bg-black/60"
          onPress={() => !isLoading && setModalVisible(false)}
        />

        {/* Bottom card */}
        <View className="bg-slate-800 rounded-t-3xl px-6 pt-6 pb-10 border-t border-slate-700">
          {/* Handle */}
          <View className="self-center w-12 h-1 bg-slate-600 rounded-full mb-6" />

          {/* Title */}
          <Text className="text-xl font-bold text-white mb-2">
            Confirm: {action.label}
          </Text>

          {/* Load summary */}
          <Text className="text-slate-400 text-base mb-1">
            Load #{load.loadNumber}
          </Text>
          <Text className="text-slate-500 text-sm mb-8">
            {load.origin} → {load.destination}
          </Text>

          {/* Action buttons */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => !isLoading && setModalVisible(false)}
              className="flex-1 border border-slate-600 rounded-xl py-4 items-center active:bg-slate-700/50"
              disabled={isLoading}
            >
              <Text className="text-slate-300 font-semibold text-base">Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleConfirm}
              className="flex-1 bg-sky-600 rounded-xl py-4 items-center active:bg-sky-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-white font-semibold text-base">Confirm</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}
