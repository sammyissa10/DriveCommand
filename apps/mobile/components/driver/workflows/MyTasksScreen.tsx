import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useFocusEffect } from 'expo-router'
import { useRouter } from 'expo-router'
import { CheckSquare } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { useThemeColors } from '../../../constants/tokens'
import { haptic } from '../../../lib/haptics'
import { AnimatedScreen } from '../../ui/AnimatedScreen'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlaybookSnapshot {
  name: string
  [key: string]: unknown
}

interface StepSnapshot {
  name: string
  description?: string | null
  stepType: string
  documentTypeName?: string | null
  formSchema?: Array<{
    id: string
    label: string
    type: string
    required?: boolean
    options?: string[]
  }>
  [key: string]: unknown
}

interface PlaybookInstance {
  id: string
  entityType: string
  entityId: string
  playbookSnapshot: PlaybookSnapshot
}

export interface StepInstance {
  id: string
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
  dueDate?: string | null
  playbookInstance: PlaybookInstance
  stepSnapshot: StepSnapshot
  assignedUserId: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DueBadge = {
  label: string
  color: string
  bgColor: string
}

function getDueBadge(dueDate: string | null | undefined, c: ReturnType<typeof useThemeColors>): DueBadge {
  if (!dueDate) {
    return { label: 'No Due Date', color: c.textMuted, bgColor: c.mutedBg }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)

  if (due < today) {
    return { label: 'Overdue', color: c.danger, bgColor: c.dangerBg }
  }
  if (due.getTime() === today.getTime()) {
    return { label: 'Due Today', color: c.success, bgColor: c.successBg }
  }
  if (due.getTime() === tomorrow.getTime()) {
    return { label: 'Due Tomorrow', color: c.warning, bgColor: c.warningBg }
  }
  return { label: 'No Due Date', color: c.textMuted, bgColor: c.mutedBg }
}

function getActionLabel(stepType: string): string {
  switch (stepType) {
    case 'DOCUMENT_UPLOAD':
      return 'Upload Document'
    case 'FORM_FILL':
      return 'Fill Out Form'
    case 'SIGNATURE':
      return 'Sign Now'
    case 'TRAINING_ACK':
      return 'Acknowledge'
    case 'APPROVAL':
      return 'Review & Approve'
    case 'INSPECTION_ITEM':
      return 'Not available yet'
    case 'THIRD_PARTY':
    case 'CUSTOM_NOTE':
    default:
      return 'Add Note'
  }
}

function isActionDisabled(stepType: string): boolean {
  return stepType === 'INSPECTION_ITEM'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TaskCardSkeleton({ c }: { c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[styles.card, { backgroundColor: c.surfaceCard, borderColor: c.border }]}>
      <View style={[styles.skeletonLine, { backgroundColor: c.border, width: '50%', height: 12 }]} />
      <View style={[styles.skeletonLine, { backgroundColor: c.border, width: '80%', height: 20, marginTop: 8 }]} />
      <View style={[styles.skeletonLine, { backgroundColor: c.border, width: '65%', height: 12, marginTop: 8 }]} />
      <View style={[styles.skeletonBtn, { backgroundColor: c.border }]} />
    </View>
  )
}

interface TaskCardProps {
  item: StepInstance
  onPress: (id: string) => void
  c: ReturnType<typeof useThemeColors>
}

function TaskCard({ item, onPress, c }: TaskCardProps) {
  const contextLabel =
    item.playbookInstance?.playbookSnapshot?.name
      ? `${item.playbookInstance.playbookSnapshot.name} · ${item.playbookInstance.entityType}`
      : item.playbookInstance?.entityType ?? ''

  const dueBadge = getDueBadge(item.dueDate, c)
  const actionLabel = getActionLabel(item.stepSnapshot.stepType)
  const disabled = isActionDisabled(item.stepSnapshot.stepType)

  return (
    <View style={[styles.card, { backgroundColor: c.surfaceCard, borderColor: c.border }]}>
      {/* Context label + due badge row */}
      <View style={styles.cardTopRow}>
        <Text style={[styles.contextLabel, { color: c.textMuted }]} numberOfLines={1}>
          {contextLabel}
        </Text>
        <View style={[styles.dueBadge, { backgroundColor: dueBadge.bgColor }]}>
          <Text style={[styles.dueBadgeText, { color: dueBadge.color }]}>{dueBadge.label}</Text>
        </View>
      </View>

      {/* Step name */}
      <Text style={[styles.stepName, { color: c.textPrimary }]} numberOfLines={2}>
        {item.stepSnapshot.name}
      </Text>

      {/* Instruction */}
      {item.stepSnapshot.description ? (
        <Text style={[styles.instruction, { color: c.textSecondary }]} numberOfLines={1}>
          {item.stepSnapshot.description}
        </Text>
      ) : null}

      {/* Action button */}
      <TouchableOpacity
        style={[
          styles.actionBtn,
          { backgroundColor: disabled ? c.surfaceElevated : c.brand },
          disabled && styles.actionBtnDisabled,
        ]}
        onPress={() => {
          if (disabled) return
          haptic.medium()
          onPress(item.id)
        }}
        activeOpacity={disabled ? 1 : 0.8}
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        disabled={disabled}
      >
        <Text
          style={[
            styles.actionBtnText,
            { color: disabled ? c.textMuted : '#ffffff' },
          ]}
        >
          {actionLabel}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

interface SummaryBarProps {
  open: number
  total: number
  c: ReturnType<typeof useThemeColors>
}

function SummaryBar({ open, total, c }: SummaryBarProps) {
  const completed = total - open
  const pct = total > 0 ? completed / total : 0
  const widthAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 500,
      useNativeDriver: false,
    }).start()
  }, [pct, widthAnim])

  return (
    <View style={[styles.summaryBar, { backgroundColor: c.surfaceCard, borderColor: c.border }]}>
      <Text style={[styles.summaryText, { color: c.textSecondary }]}>
        {completed} of {total} task{total !== 1 ? 's' : ''} complete today
      </Text>
      <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: c.brand,
              width: widthAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function MyTasksScreen() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const [stepInstances, setStepInstances] = useState<StepInstance[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    if (!token) return
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile/driver/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setStepInstances(data.stepInstances ?? [])
    } catch {
      // Best-effort — keep previous data on error
    } finally {
      setIsLoading(false)
    }
  }, [token])

  // Initial load
  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Refetch whenever this tab comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchTasks()
    }, [fetchTasks])
  )

  const handleTaskPress = useCallback(
    (id: string) => {
      router.push(`/(driver)/tasks/${id}` as never)
    },
    [router]
  )

  const renderItem = useCallback(
    ({ item }: { item: StepInstance }) => (
      <TaskCard item={item} onPress={handleTaskPress} c={c} />
    ),
    [handleTaskPress, c]
  )

  const keyExtractor = useCallback((item: StepInstance) => item.id, [])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Screen header */}
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>My Tasks</Text>
        </View>

        {isLoading ? (
          <View style={styles.content}>
            <TaskCardSkeleton c={c} />
            <TaskCardSkeleton c={c} />
            <TaskCardSkeleton c={c} />
          </View>
        ) : (
          <>
            {/* Summary bar — always visible when there are tasks */}
            {stepInstances.length > 0 && (
              <SummaryBar open={stepInstances.length} total={stepInstances.length} c={c} />
            )}

            <FlashList
              data={stepInstances}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <CheckSquare size={48} color={c.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: c.textSecondary }]}>
                    You're all caught up.
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: c.textTertiary }]}>
                    No open tasks right now.
                  </Text>
                </View>
              }
            />
          </>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  summaryBar: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  // Task card
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contextLabel: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  dueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  dueBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stepName: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  instruction: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionBtn: {
    height: 56,
    minHeight: 56,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Skeleton
  skeletonLine: {
    borderRadius: 6,
  },
  skeletonBtn: {
    height: 56,
    minHeight: 56,
    borderRadius: 10,
    marginTop: 4,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
})
