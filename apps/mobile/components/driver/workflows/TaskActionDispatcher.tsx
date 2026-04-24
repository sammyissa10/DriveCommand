import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator as AI,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, AlertCircle } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { useThemeColors } from '../../../constants/tokens'
import { haptic } from '../../../lib/haptics'
import { DocumentUploadScreen } from './DocumentUploadScreen'
import { FormFillScreen } from './FormFillScreen'
import { SignatureScreen } from './SignatureScreen'
import type { StepInstance } from './MyTasksScreen'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TaskActionScreenProps {
  stepInstanceId: string
}

// ---------------------------------------------------------------------------
// Training Ack screen (inline — simple)
// ---------------------------------------------------------------------------

interface TrainingAckScreenProps {
  stepInstance: StepInstance
}

function TrainingAckScreen({ stepInstance }: TrainingAckScreenProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const stepSnapshot = stepInstance.stepSnapshot

  async function handleAcknowledge() {
    if (!token) return
    setIsSubmitting(true)
    haptic.medium()
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mobile/driver/tasks/${stepInstance.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ result: { acknowledged: true } }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!res.ok) throw new Error('Failed to complete task')
      haptic.success()
      Toast.show({ type: 'success', text1: 'Task acknowledged' })
      router.back()
    } catch (err) {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Failed',
        text2: err instanceof Error ? err.message : 'Please try again',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={[ackStyles.container, { backgroundColor: c.background }]} edges={['bottom', 'left', 'right']}>
      <View style={[ackStyles.headerRow, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={ackStyles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft color={c.textSecondary} size={22} />
        </TouchableOpacity>
        <Text style={[ackStyles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {stepSnapshot.name}
        </Text>
      </View>
      <ScrollView contentContainerStyle={[ackStyles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[ackStyles.stepName, { color: c.textPrimary }]}>{stepSnapshot.name}</Text>
        {stepSnapshot.description ? (
          <Text style={[ackStyles.instruction, { color: c.textSecondary }]}>{stepSnapshot.description}</Text>
        ) : null}
        <TouchableOpacity
          onPress={handleAcknowledge}
          disabled={isSubmitting}
          style={[ackStyles.btn, { backgroundColor: c.brand }, isSubmitting && { opacity: 0.6 }]}
          accessibilityLabel="I acknowledge"
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <AI color="#fff" size="small" />
          ) : (
            <Text style={ackStyles.btnText}>I acknowledge</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const ackStyles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingTop: 24, gap: 16 },
  stepName: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  instruction: { fontSize: 15, lineHeight: 22 },
  btn: {
    height: 56,
    minHeight: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})

// ---------------------------------------------------------------------------
// Generic Note screen (THIRD_PARTY, CUSTOM_NOTE, APPROVAL, and fallback)
// ---------------------------------------------------------------------------

interface GenericNoteScreenProps {
  stepInstance: StepInstance
  actionLabel: string
}

function GenericNoteScreen({ stepInstance, actionLabel }: GenericNoteScreenProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const stepSnapshot = stepInstance.stepSnapshot

  async function handleSubmit() {
    if (!token) return
    setIsSubmitting(true)
    haptic.medium()
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mobile/driver/tasks/${stepInstance.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ result: { note } }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!res.ok) throw new Error('Failed to complete task')
      haptic.success()
      Toast.show({ type: 'success', text1: 'Task completed' })
      router.back()
    } catch (err) {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Failed',
        text2: err instanceof Error ? err.message : 'Please try again',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={[noteStyles.container, { backgroundColor: c.background }]} edges={['bottom', 'left', 'right']}>
      <View style={[noteStyles.headerRow, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={noteStyles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft color={c.textSecondary} size={22} />
        </TouchableOpacity>
        <Text style={[noteStyles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {stepSnapshot.name}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={[noteStyles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[noteStyles.stepName, { color: c.textPrimary }]}>{stepSnapshot.name}</Text>
        {stepSnapshot.description ? (
          <Text style={[noteStyles.instruction, { color: c.textSecondary }]}>{stepSnapshot.description}</Text>
        ) : null}
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          style={[
            noteStyles.noteInput,
            { color: c.textPrimary, backgroundColor: c.surfaceInput, borderColor: c.border },
          ]}
          placeholderTextColor={c.textMuted}
          placeholder="Add a note (optional)"
          textAlignVertical="top"
        />
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isSubmitting}
          style={[noteStyles.btn, { backgroundColor: c.brand }, isSubmitting && { opacity: 0.6 }]}
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <AI color="#fff" size="small" />
          ) : (
            <Text style={noteStyles.btnText}>{actionLabel}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const noteStyles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingTop: 24, gap: 16 },
  stepName: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  instruction: { fontSize: 15, lineHeight: 22 },
  noteInput: {
    minHeight: 120,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  btn: {
    height: 56,
    minHeight: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})

// ---------------------------------------------------------------------------
// Inspection placeholder screen
// ---------------------------------------------------------------------------

function InspectionPlaceholderScreen() {
  const c = useThemeColors()
  const router = useRouter()

  return (
    <SafeAreaView style={[inspStyles.container, { backgroundColor: c.background }]} edges={['bottom', 'left', 'right']}>
      <View style={[inspStyles.headerRow, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={inspStyles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft color={c.textSecondary} size={22} />
        </TouchableOpacity>
        <Text style={[inspStyles.headerTitle, { color: c.textPrimary }]}>Inspection</Text>
      </View>
      <View style={inspStyles.content}>
        <AlertCircle size={48} color={c.textTertiary} />
        <Text style={[inspStyles.title, { color: c.textSecondary }]}>
          Full inspection mode coming soon.
        </Text>
        <Text style={[inspStyles.subtitle, { color: c.textTertiary }]}>
          Use the web dashboard to manage this task.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const inspStyles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
})

// ---------------------------------------------------------------------------
// Main Dispatcher
// ---------------------------------------------------------------------------

export function TaskActionScreen({ stepInstanceId }: TaskActionScreenProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const [stepInstance, setStepInstance] = useState<StepInstance | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTask = useCallback(async () => {
    if (!token || !stepInstanceId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile/driver/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to fetch tasks')
      const data = await res.json() as { stepInstances: StepInstance[] }
      const found = data.stepInstances.find((si) => si.id === stepInstanceId) ?? null
      if (!found) {
        setError('Task not found or already completed.')
      } else {
        setStepInstance(found)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task')
    } finally {
      setIsLoading(false)
    }
  }, [token, stepInstanceId])

  useEffect(() => {
    fetchTask()
  }, [fetchTask])

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]} edges={['bottom']}>
        <ActivityIndicator size="large" color={c.brand} />
      </SafeAreaView>
    )
  }

  // Error state
  if (error || !stepInstance) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]} edges={['bottom']}>
        <AlertCircle size={40} color={c.danger} />
        <Text style={[styles.errorText, { color: c.textSecondary }]}>
          {error ?? 'Task not found'}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backLink, { backgroundColor: c.surfaceElevated }]}
        >
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const stepType = stepInstance.stepSnapshot.stepType

  // Dispatch to the correct screen
  switch (stepType) {
    case 'DOCUMENT_UPLOAD':
      return <DocumentUploadScreen stepInstance={stepInstance} />
    case 'FORM_FILL':
      return <FormFillScreen stepInstance={stepInstance} />
    case 'SIGNATURE':
      return <SignatureScreen stepInstance={stepInstance} />
    case 'TRAINING_ACK':
      return <TrainingAckScreen stepInstance={stepInstance} />
    case 'INSPECTION_ITEM':
      return <InspectionPlaceholderScreen />
    case 'APPROVAL':
      return <GenericNoteScreen stepInstance={stepInstance} actionLabel="Review & Approve" />
    case 'THIRD_PARTY':
    case 'CUSTOM_NOTE':
    default:
      return <GenericNoteScreen stepInstance={stepInstance} actionLabel="Add Note" />
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 15,
    textAlign: 'center',
  },
  backLink: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
})
