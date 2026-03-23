import React, { useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import Toast from 'react-native-toast-message'
import { driverApi } from '@drivecommand/api-client'
import type { HOSStatus } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'
import { HOSStatusCard } from '../../components/driver/HOSStatusCard'
import { HOSDayBar } from '../../components/driver/HOSDayBar'
import { HOSClock } from '../../components/driver/HOSClock'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'

// --- Status metadata ---

interface StatusMeta {
  label: string
  shortLabel: string
  badgeColor: string
  badgeBg: string
}

const STATUS_META: Record<HOSStatus, StatusMeta> = {
  OFF_DUTY: {
    label: 'Off Duty',
    shortLabel: 'OFF DUTY',
    badgeColor: '#94a3b8',
    badgeBg: '#1e293b',
  },
  SLEEPER_BERTH: {
    label: 'Sleeper Berth',
    shortLabel: 'SLEEPER BERTH',
    badgeColor: '#a78bfa',
    badgeBg: '#2e1065',
  },
  DRIVING: {
    label: 'Driving',
    shortLabel: 'DRIVING',
    badgeColor: '#4ade80',
    badgeBg: '#052e16',
  },
  ON_DUTY: {
    label: 'On Duty',
    shortLabel: 'ON DUTY',
    badgeColor: '#38bdf8',
    badgeBg: '#082f49',
  },
}

const STATUS_ORDER: HOSStatus[] = ['OFF_DUTY', 'SLEEPER_BERTH', 'DRIVING', 'ON_DUTY']

// --- Helpers ---

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// --- Main screen ---

export default function DriverHOS() {
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

  // Modal state
  const [pendingStatus, setPendingStatus] = useState<HOSStatus | null>(null)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['driver-hos'],
    queryFn: () => driverApi.getHOS(token!),
    enabled: !!token,
    refetchInterval: 60_000,
  })

  function handleStatusPress(status: HOSStatus) {
    if (!data) return

    if (status === data.currentStatus) {
      Toast.show({
        type: 'info',
        text1: `Already ${STATUS_META[status].label}`,
      })
      return
    }

    setPendingStatus(status)
    setNotes('')
  }

  function handleCloseModal() {
    if (isSubmitting) return
    setPendingStatus(null)
    setNotes('')
  }

  async function handleConfirm() {
    if (!token || !pendingStatus || isSubmitting) return

    setIsSubmitting(true)
    try {
      await driverApi.updateHOSStatus(token, pendingStatus, notes.trim() || undefined)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setPendingStatus(null)
      setNotes('')
      await queryClient.invalidateQueries({ queryKey: ['driver-hos'] })
      Toast.show({
        type: 'success',
        text1: 'Status Updated',
        text2: `Now: ${STATUS_META[pendingStatus].label}`,
      })
    } catch (err) {
      setPendingStatus(null)
      setNotes('')
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: err instanceof Error ? err.message : 'An unexpected error occurred',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Loading state ---
  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <LoadingSpinner />
          <Text style={{ color: '#94a3b8', fontSize: 14 }}>Loading HOS data...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // --- Error state ---
  if (isError || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 }}>
          <Text style={{ color: '#f87171', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
            Failed to load HOS data
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={{ backgroundColor: '#0ea5e9', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '600' }}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const currentMeta = STATUS_META[data.currentStatus]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen title */}
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#ffffff', marginBottom: 20 }}>
          Hours of Service
        </Text>

        {/* ── 1. Current Status Badge ── */}
        <View
          style={{
            borderRadius: 16,
            backgroundColor: currentMeta.badgeBg,
            borderWidth: 1,
            borderColor: currentMeta.badgeColor + '55',
            padding: 20,
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: '800',
              color: currentMeta.badgeColor,
              letterSpacing: 2,
              marginBottom: 6,
            }}
          >
            {currentMeta.shortLabel}
          </Text>
          <Text style={{ fontSize: 14, color: '#94a3b8' }}>
            for {formatDuration(data.timeInCurrentStatus)}
          </Text>
        </View>

        {/* ── 2. Status Selector Grid ── */}
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Change Status
        </Text>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 28,
          }}
        >
          {STATUS_ORDER.map((status) => (
            <HOSStatusCard
              key={status}
              status={status}
              label={STATUS_META[status].label}
              isActive={status === data.currentStatus}
              onPress={() => handleStatusPress(status)}
            />
          ))}
        </View>

        {/* ── 3. Daily Log ── */}
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Today's Log
        </Text>
        <View style={{ marginBottom: 28 }}>
          <HOSDayBar entries={data.todayEntries} currentStatus={data.currentStatus} />
        </View>

        {/* ── 4. Countdown Clocks ── */}
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Time Remaining
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <HOSClock
            label="14-Hour Limit"
            hoursRemaining={data.hoursUntil14Limit}
            isWarning={data.hoursUntil14Limit < 2}
          />
          <HOSClock
            label="11-Hour Drive"
            hoursRemaining={data.hoursUntil11DriveLimit}
            isWarning={data.hoursUntil11DriveLimit < 2}
          />
        </View>
      </ScrollView>

      {/* ── Status Change Confirmation Modal ── */}
      <Modal
        visible={pendingStatus !== null}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        {/* Backdrop */}
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
          onPress={handleCloseModal}
        />

        {/* Bottom card */}
        <View
          style={{
            backgroundColor: '#1e293b',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 40,
            borderTopWidth: 1,
            borderColor: '#334155',
          }}
        >
          {/* Handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 48,
              height: 4,
              backgroundColor: '#475569',
              borderRadius: 2,
              marginBottom: 24,
            }}
          />

          {/* Title */}
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#ffffff', marginBottom: 16 }}>
            Change Status
          </Text>

          {/* From → To */}
          {pendingStatus && data && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: STATUS_META[data.currentStatus].badgeBg,
                  borderRadius: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: STATUS_META[data.currentStatus].badgeColor + '55',
                }}
              >
                <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>FROM</Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: STATUS_META[data.currentStatus].badgeColor,
                  }}
                >
                  {STATUS_META[data.currentStatus].label}
                </Text>
              </View>

              <Text style={{ color: '#475569', fontSize: 18 }}>→</Text>

              <View
                style={{
                  flex: 1,
                  backgroundColor: STATUS_META[pendingStatus].badgeBg,
                  borderRadius: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: STATUS_META[pendingStatus].badgeColor + '55',
                }}
              >
                <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>TO</Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: STATUS_META[pendingStatus].badgeColor,
                  }}
                >
                  {STATUS_META[pendingStatus].label}
                </Text>
              </View>
            </View>
          )}

          {/* Notes input */}
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes (optional)"
            placeholderTextColor="#475569"
            multiline
            numberOfLines={2}
            style={{
              backgroundColor: '#0f172a',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#334155',
              color: '#ffffff',
              padding: 12,
              fontSize: 14,
              marginBottom: 20,
              minHeight: 64,
              textAlignVertical: 'top',
            }}
          />

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={handleCloseModal}
              disabled={isSubmitting}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#475569',
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#cbd5e1', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleConfirm}
              disabled={isSubmitting}
              style={{
                flex: 1,
                backgroundColor: '#0ea5e9',
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 15 }}>Confirm</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
