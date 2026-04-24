import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { useThemeColors } from '../../../constants/tokens'
import { haptic } from '../../../lib/haptics'
import type { StepInstance } from './MyTasksScreen'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormField {
  id: string
  label: string
  type: 'boolean' | 'text' | 'date' | 'select' | 'number' | string
  required?: boolean
  options?: string[]
}

interface FormFillScreenProps {
  stepInstance: StepInstance
}

// ---------------------------------------------------------------------------
// Field renderers
// ---------------------------------------------------------------------------

interface FieldProps {
  field: FormField
  value: string | boolean | null
  onChange: (id: string, value: string | boolean | null) => void
  error?: string
  c: ReturnType<typeof useThemeColors>
}

function BooleanField({ field, value, onChange, error, c }: FieldProps) {
  const isYes = value === true
  const isNo = value === false

  return (
    <View style={fieldStyles.fieldContainer}>
      <Text style={[fieldStyles.label, { color: c.textPrimary }]}>
        {field.label}
        {field.required && <Text style={{ color: c.danger }}> *</Text>}
      </Text>
      <View style={fieldStyles.booleanRow}>
        <TouchableOpacity
          onPress={() => onChange(field.id, true)}
          style={[
            fieldStyles.booleanBtn,
            { borderColor: isYes ? c.success : c.border },
            isYes && { backgroundColor: c.successBg },
          ]}
          accessibilityLabel={`${field.label} - Yes`}
          accessibilityRole="button"
        >
          <Text style={[fieldStyles.booleanBtnText, { color: isYes ? c.success : c.textSecondary }]}>
            YES
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onChange(field.id, false)}
          style={[
            fieldStyles.booleanBtn,
            { borderColor: isNo ? c.danger : c.border },
            isNo && { backgroundColor: c.dangerBg },
          ]}
          accessibilityLabel={`${field.label} - No`}
          accessibilityRole="button"
        >
          <Text style={[fieldStyles.booleanBtnText, { color: isNo ? c.danger : c.textSecondary }]}>
            NO
          </Text>
        </TouchableOpacity>
      </View>
      {error && <Text style={[fieldStyles.errorText, { color: c.danger }]}>{error}</Text>}
    </View>
  )
}

function TextField({ field, value, onChange, error, c }: FieldProps) {
  return (
    <View style={fieldStyles.fieldContainer}>
      <Text style={[fieldStyles.label, { color: c.textPrimary }]}>
        {field.label}
        {field.required && <Text style={{ color: c.danger }}> *</Text>}
      </Text>
      <TextInput
        value={typeof value === 'string' ? value : ''}
        onChangeText={(text) => onChange(field.id, text)}
        style={[
          fieldStyles.textInput,
          { color: c.textPrimary, backgroundColor: c.surfaceInput, borderColor: error ? c.danger : c.border },
        ]}
        placeholderTextColor={c.textMuted}
        placeholder={field.label}
        multiline={false}
      />
      {error && <Text style={[fieldStyles.errorText, { color: c.danger }]}>{error}</Text>}
    </View>
  )
}

function NumberField({ field, value, onChange, error, c }: FieldProps) {
  return (
    <View style={fieldStyles.fieldContainer}>
      <Text style={[fieldStyles.label, { color: c.textPrimary }]}>
        {field.label}
        {field.required && <Text style={{ color: c.danger }}> *</Text>}
      </Text>
      <TextInput
        value={typeof value === 'string' ? value : ''}
        onChangeText={(text) => onChange(field.id, text)}
        keyboardType="numeric"
        style={[
          fieldStyles.textInput,
          { color: c.textPrimary, backgroundColor: c.surfaceInput, borderColor: error ? c.danger : c.border },
        ]}
        placeholderTextColor={c.textMuted}
        placeholder="Enter number"
      />
      {error && <Text style={[fieldStyles.errorText, { color: c.danger }]}>{error}</Text>}
    </View>
  )
}

function DateField({ field, value, onChange, error, c }: FieldProps) {
  return (
    <View style={fieldStyles.fieldContainer}>
      <Text style={[fieldStyles.label, { color: c.textPrimary }]}>
        {field.label}
        {field.required && <Text style={{ color: c.danger }}> *</Text>}
      </Text>
      <TextInput
        value={typeof value === 'string' ? value : ''}
        onChangeText={(text) => onChange(field.id, text)}
        style={[
          fieldStyles.textInput,
          { color: c.textPrimary, backgroundColor: c.surfaceInput, borderColor: error ? c.danger : c.border },
        ]}
        placeholderTextColor={c.textMuted}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
      />
      {error && <Text style={[fieldStyles.errorText, { color: c.danger }]}>{error}</Text>}
    </View>
  )
}

interface SelectFieldProps extends FieldProps {
  onOpenSelect: (fieldId: string, options: string[]) => void
}

function SelectField({ field, value, error, onOpenSelect, c }: SelectFieldProps) {
  const displayValue = typeof value === 'string' && value ? value : 'Select an option'
  const hasValue = typeof value === 'string' && value

  return (
    <View style={fieldStyles.fieldContainer}>
      <Text style={[fieldStyles.label, { color: c.textPrimary }]}>
        {field.label}
        {field.required && <Text style={{ color: c.danger }}> *</Text>}
      </Text>
      <TouchableOpacity
        onPress={() => onOpenSelect(field.id, field.options ?? [])}
        style={[
          fieldStyles.selectTrigger,
          { backgroundColor: c.surfaceInput, borderColor: error ? c.danger : c.border },
        ]}
        accessibilityLabel={`Select ${field.label}`}
        accessibilityRole="button"
      >
        <Text
          style={[
            fieldStyles.selectTriggerText,
            { color: hasValue ? c.textPrimary : c.textMuted },
          ]}
        >
          {displayValue}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 12 }}>▼</Text>
      </TouchableOpacity>
      {error && <Text style={[fieldStyles.errorText, { color: c.danger }]}>{error}</Text>}
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  fieldContainer: {
    gap: 8,
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  booleanRow: {
    flexDirection: 'row',
    gap: 12,
  },
  booleanBtn: {
    flex: 1,
    height: 56,
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  booleanBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  textInput: {
    height: 56,
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  selectTrigger: {
    height: 56,
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectTriggerText: {
    fontSize: 15,
    flex: 1,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
  },
})

// ---------------------------------------------------------------------------
// Inline select bottom sheet (simple modal)
// ---------------------------------------------------------------------------

interface SelectSheetProps {
  fieldId: string
  options: string[]
  current: string | null
  onSelect: (fieldId: string, value: string) => void
  onDismiss: () => void
  c: ReturnType<typeof useThemeColors>
}

function SelectSheet({ fieldId, options, current, onSelect, onDismiss, c }: SelectSheetProps) {
  return (
    <View style={[sheetStyles.overlay]}>
      <TouchableOpacity style={sheetStyles.backdrop} onPress={onDismiss} activeOpacity={1} />
      <View style={[sheetStyles.sheet, { backgroundColor: c.surfaceCard }]}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            onPress={() => {
              onSelect(fieldId, opt)
              onDismiss()
            }}
            style={[
              sheetStyles.option,
              { borderBottomColor: c.border },
              current === opt && { backgroundColor: c.brandSubtle },
            ]}
            accessibilityLabel={opt}
            accessibilityRole="button"
          >
            <Text
              style={[
                sheetStyles.optionText,
                { color: current === opt ? c.brand : c.textPrimary },
              ]}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={onDismiss}
          style={[sheetStyles.cancelBtn, { borderTopColor: c.border }]}
          accessibilityLabel="Cancel"
          accessibilityRole="button"
        >
          <Text style={[sheetStyles.cancelText, { color: c.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const sheetStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 16,
  },
  cancelBtn: {
    paddingVertical: 18,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
})

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function FormFillScreen({ stepInstance }: FormFillScreenProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectSheet, setSelectSheet] = useState<{ fieldId: string; options: string[] } | null>(null)

  const stepSnapshot = stepInstance.stepSnapshot
  const formSchema: FormField[] = (stepSnapshot.formSchema as FormField[] | undefined) ?? []

  // Initialize form values — all null
  const [formValues, setFormValues] = useState<Record<string, string | boolean | null>>(
    () =>
      Object.fromEntries(formSchema.map((f) => [f.id, null]))
  )

  function handleChange(fieldId: string, value: string | boolean | null) {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }))
    // Clear error when user touches the field
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    for (const field of formSchema) {
      if (field.required) {
        const val = formValues[field.id]
        if (val === null || val === '' || val === undefined) {
          newErrors[field.id] = `${field.label} is required`
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) {
      haptic.warning()
      return
    }
    if (!token) return
    setIsSubmitting(true)
    haptic.medium()
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mobile/driver/tasks/${stepInstance.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ result: { formData: formValues } }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!res.ok) throw new Error('Failed to submit form')

      haptic.success()
      Toast.show({ type: 'success', text1: 'Form submitted' })
      router.back()
    } catch (err) {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Submission Failed',
        text2: err instanceof Error ? err.message : 'Please try again',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function renderField(field: FormField) {
    const value = formValues[field.id] ?? null
    const error = errors[field.id]

    switch (field.type) {
      case 'boolean':
        return (
          <BooleanField
            key={field.id}
            field={field}
            value={value}
            onChange={handleChange}
            error={error}
            c={c}
          />
        )
      case 'number':
        return (
          <NumberField
            key={field.id}
            field={field}
            value={value}
            onChange={handleChange}
            error={error}
            c={c}
          />
        )
      case 'date':
        return (
          <DateField
            key={field.id}
            field={field}
            value={value}
            onChange={handleChange}
            error={error}
            c={c}
          />
        )
      case 'select':
        return (
          <SelectField
            key={field.id}
            field={field}
            value={value}
            onChange={handleChange}
            error={error}
            c={c}
            onOpenSelect={(fieldId, options) => setSelectSheet({ fieldId, options })}
          />
        )
      case 'text':
      default:
        return (
          <TextField
            key={field.id}
            field={field}
            value={value}
            onChange={handleChange}
            error={error}
            c={c}
          />
        )
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.headerRow, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft color={c.textSecondary} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {stepSnapshot.name}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step name */}
          <Text style={[styles.stepName, { color: c.textPrimary }]}>{stepSnapshot.name}</Text>

          {/* Instruction */}
          {stepSnapshot.description ? (
            <Text style={[styles.instruction, { color: c.textSecondary }]}>
              {stepSnapshot.description}
            </Text>
          ) : null}

          {/* Form fields */}
          <View style={styles.fields}>
            {formSchema.length > 0 ? (
              formSchema.map(renderField)
            ) : (
              <Text style={{ color: c.textMuted, fontSize: 14 }}>
                No form fields defined for this task.
              </Text>
            )}
          </View>

          {/* Submit button (inline at bottom of scroll for short forms) */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[
              styles.submitBtn,
              { backgroundColor: c.brand },
              isSubmitting && styles.submitBtnDisabled,
            ]}
            accessibilityLabel="Submit form"
            accessibilityRole="button"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Form</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Inline select bottom sheet */}
      {selectSheet && (
        <SelectSheet
          fieldId={selectSheet.fieldId}
          options={selectSheet.options}
          current={
            typeof formValues[selectSheet.fieldId] === 'string'
              ? (formValues[selectSheet.fieldId] as string)
              : null
          }
          onSelect={handleChange}
          onDismiss={() => setSelectSheet(null)}
          c={c}
        />
      )}
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
  flex: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  stepName: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    marginBottom: 8,
  },
  instruction: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  fields: {
    marginTop: 8,
  },
  submitBtn: {
    height: 56,
    minHeight: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
})
