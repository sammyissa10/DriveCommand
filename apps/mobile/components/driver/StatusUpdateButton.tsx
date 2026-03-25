import React, { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Toast from 'react-native-toast-message'
import { useQueryClient } from '@tanstack/react-query'
import { driverApi, type LoadDetail } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'
import { callOrQueue } from '../../lib/api-with-queue'

interface NextAction {
  label: string
  nextStatus: string
}

interface RevertAction {
  label: string
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

function getRevertAction(dbStatus: string): RevertAction | null {
  switch (dbStatus) {
    case 'PICKED_UP':
      return { label: 'Revert to Accepted' }
    case 'IN_TRANSIT':
      return { label: 'Revert to En Route' }
    default:
      // DISPATCHED -> cannot revert to Pending (owner-only)
      // All terminal statuses: no revert
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
  const [revertModalVisible, setRevertModalVisible] = useState(false)
  const [isReverting, setIsReverting] = useState(false)

  const action = getNextAction(load.status)
  const revertAction = getRevertAction(load.status)

  // Don't render for terminal statuses (when neither forward nor revert is available)
  if (!action && !revertAction) return null

  async function handleConfirm() {
    if (!token || isLoading) return

    setIsLoading(true)
    try {
      const result = await callOrQueue(
        'UPDATE_LOAD_STATUS',
        `/api/mobile/driver/loads/${load.id}/status`,
        'POST',
        { status: action!.nextStatus },
        () => driverApi.updateLoadStatus(token!, load.id, action!.nextStatus)
      )

      setModalVisible(false)

      if (result === null) {
        // Queued offline - inform driver the update will sync on reconnect
        Toast.show({
          type: 'info',
          text1: 'Saved offline',
          text2: 'Update will sync automatically when connected',
        })
      } else {
        // Synced immediately - haptic feedback + invalidate queries
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['driver-load', load.id] }),
          queryClient.invalidateQueries({ queryKey: ['driver-loads'] }),
          queryClient.invalidateQueries({ queryKey: ['driver-dashboard'] }),
        ])
        onStatusUpdated()
      }
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

  async function handleRevert() {
    if (!token || isReverting) return

    setIsReverting(true)
    try {
      const result = await callOrQueue(
        'REVERT_LOAD_STATUS',
        `/api/mobile/driver/loads/${load.id}/revert`,
        'PATCH',
        {},
        () => driverApi.revertLoadStatus(token!, load.id)
      )

      setRevertModalVisible(false)

      if (result === null) {
        Toast.show({
          type: 'info',
          text1: 'Saved offline',
          text2: 'Revert will sync automatically when connected',
        })
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['driver-load', load.id] }),
          queryClient.invalidateQueries({ queryKey: ['driver-loads'] }),
          queryClient.invalidateQueries({ queryKey: ['driver-dashboard'] }),
        ])
        onStatusUpdated()
      }
    } catch (err) {
      setRevertModalVisible(false)
      Toast.show({
        type: 'error',
        text1: 'Revert Failed',
        text2: err instanceof Error ? err.message : 'An unexpected error occurred',
      })
    } finally {
      setIsReverting(false)
    }
  }

  return (
    <>
      {/* Main action button */}
      {action && (
        <Pressable
          onPress={() => setModalVisible(true)}
          className="bg-sky-600 rounded-xl items-center active:bg-sky-700"
          style={{ paddingVertical: 18, paddingHorizontal: 24 }}
        >
          <Text className="text-white text-lg font-bold tracking-wide">{action.label}</Text>
        </Pressable>
      )}

      {/* Secondary revert button */}
      {revertAction && (
        <Pressable
          onPress={() => setRevertModalVisible(true)}
          className="border border-amber-600/50 rounded-xl items-center active:bg-amber-900/20 mt-3"
          style={{ paddingVertical: 14, paddingHorizontal: 24 }}
        >
          <Text className="text-amber-500 text-base font-semibold">{revertAction.label}</Text>
        </Pressable>
      )}

      {/* Forward status confirmation modal */}
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
            Confirm: {action?.label}
          </Text>

          {/* Load summary */}
          <Text className="text-slate-400 text-base mb-1">
            Load #{load.loadNumber}
          </Text>
          <Text className="text-slate-500 text-sm mb-8">
            {load.origin} {'->'} {load.destination}
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

      {/* Revert confirmation modal */}
      <Modal
        visible={revertModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !isReverting && setRevertModalVisible(false)}
      >
        {/* Backdrop */}
        <Pressable
          className="flex-1 bg-black/60"
          onPress={() => !isReverting && setRevertModalVisible(false)}
        />

        {/* Bottom card */}
        <View className="bg-slate-800 rounded-t-3xl px-6 pt-6 pb-10 border-t border-slate-700">
          {/* Handle */}
          <View className="self-center w-12 h-1 bg-slate-600 rounded-full mb-6" />

          {/* Title */}
          <Text className="text-xl font-bold text-white mb-2">
            Confirm: {revertAction?.label}
          </Text>

          {/* Warning */}
          <Text className="text-slate-400 text-base mb-1">
            Load #{load.loadNumber}
          </Text>
          <Text className="text-amber-400/80 text-sm mb-8">
            This will move the load back to its previous status.
          </Text>

          {/* Action buttons */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => !isReverting && setRevertModalVisible(false)}
              className="flex-1 border border-slate-600 rounded-xl py-4 items-center active:bg-slate-700/50"
              disabled={isReverting}
            >
              <Text className="text-slate-300 font-semibold text-base">Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleRevert}
              className="flex-1 bg-amber-600 rounded-xl py-4 items-center active:bg-amber-700"
              disabled={isReverting}
            >
              {isReverting ? (
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
