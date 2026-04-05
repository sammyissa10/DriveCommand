import React from 'react'
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { carrierDriverApi, type CarrierDispatchDetailStop } from '@drivecommand/api-client'
import { useThemeColors } from '@/constants/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopStatusButtonsProps {
  stop: CarrierDispatchDetailStop
  token: string
  dispatchId: string
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StopStatusButtons({ stop, token, dispatchId, onSuccess }: StopStatusButtonsProps) {
  const c = useThemeColors()
  const queryClient = useQueryClient()

  // ---------------------------------------------------------------------------
  // Arrive mutation
  // ---------------------------------------------------------------------------
  const arriveMutation = useMutation({
    mutationFn: () => carrierDriverApi.markStopArrived(token, stop.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carrier-dispatch', dispatchId] })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onSuccess()
    },
    onError: () => {
      Alert.alert('Error', 'Could not mark stop as arrived. Please try again.')
    },
  })

  // ---------------------------------------------------------------------------
  // Complete mutation
  // ---------------------------------------------------------------------------
  const completeMutation = useMutation({
    mutationFn: () => carrierDriverApi.completeStop(token, stop.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carrier-dispatch', dispatchId] })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onSuccess()
    },
    onError: (error: unknown) => {
      // Surface API's 422 error message if present
      if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 422) {
        const message =
          'message' in error
            ? String((error as { message: string }).message)
            : 'Cannot complete stop at this time.'
        Alert.alert('Cannot Complete', message)
      } else {
        Alert.alert('Error', 'Could not complete stop. Please try again.')
      }
    },
  })

  // ---------------------------------------------------------------------------
  // Document completion checks
  // ---------------------------------------------------------------------------
  const bolMissing = stop.bolRequired && !stop.bolUploaded
  const podMissing = stop.podRequired && !stop.podUploaded
  const isCompleteDisabled = bolMissing || podMissing

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* Arrived button — only visible when status is pending */}
      {stop.status === 'pending' && (
        <Pressable
          onPress={() => arriveMutation.mutate()}
          disabled={arriveMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Mark as arrived"
          style={[
            styles.button,
            { backgroundColor: c.info, opacity: arriveMutation.isPending ? 0.7 : 1 },
          ]}
        >
          {arriveMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Mark Arrived</Text>
          )}
        </Pressable>
      )}

      {/* Complete Stop button — only visible when status is arrived */}
      {stop.status === 'arrived' && (
        <View style={styles.completeGroup}>
          <Pressable
            onPress={() => completeMutation.mutate()}
            disabled={isCompleteDisabled || completeMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Complete stop"
            style={[
              styles.button,
              {
                backgroundColor: c.success,
                opacity: isCompleteDisabled || completeMutation.isPending ? 0.5 : 1,
              },
            ]}
          >
            {completeMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Complete Stop</Text>
            )}
          </Pressable>

          {/* Document warnings */}
          {bolMissing && (
            <Text style={[styles.warningText, { color: c.danger }]}>Upload BOL first</Text>
          )}
          {podMissing && (
            <Text style={[styles.warningText, { color: c.danger }]}>Upload POD first</Text>
          )}
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  button: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  completeGroup: {
    gap: 6,
  },
  warningText: {
    fontSize: 12,
    textAlign: 'center',
  },
})
