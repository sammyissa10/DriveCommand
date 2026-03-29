import React, { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { usePathname } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { LifeBuoy } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { BottomSheet } from '../ui/BottomSheet'
import { createSupportTicket } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = 'BILLING' | 'BUG' | 'FEATURE' | 'GENERAL'
type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'GENERAL', label: 'General' },
  { value: 'BUG', label: 'Bug Report' },
  { value: 'BILLING', label: 'Billing' },
  { value: 'FEATURE', label: 'Feature Request' },
]

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
]

// ─── Default form state ──────────────────────────────────────────────────────

interface FormState {
  category: Category
  priority: Priority
  title: string
  description: string
  titleTouched: boolean
  descriptionTouched: boolean
}

const DEFAULT_FORM: FormState = {
  category: 'GENERAL',
  priority: 'NORMAL',
  title: '',
  description: '',
  titleTouched: false,
  descriptionTouched: false,
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SupportTicketFAB() {
  const { token } = useAuthContext()
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)

  const titleError =
    form.titleTouched && form.title.trim().length < 3
      ? 'Title must be at least 3 characters'
      : null

  const descriptionError =
    form.descriptionTouched && form.description.trim().length < 10
      ? 'Description must be at least 10 characters'
      : null

  const isFormValid =
    form.title.trim().length >= 3 && form.description.trim().length >= 10

  const { mutate: submitTicket, isPending } = useMutation<
    { ticketNumber: string },
    Error,
    void
  >({
    mutationFn: () => {
      if (!token) throw new Error('Not authenticated')
      return createSupportTicket(token, {
        category: form.category,
        priority: form.priority,
        title: form.title.trim(),
        description: form.description.trim(),
        fromPage: pathname,
      })
    },
    onSuccess: (data) => {
      Toast.show({
        type: 'success',
        text1: `Ticket #${data.ticketNumber} submitted!`,
        text2: "We'll be in touch soon.",
      })
      setVisible(false)
      setForm(DEFAULT_FORM)
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Failed to submit ticket',
        text2: 'Please try again.',
      })
    },
  })

  const handleClose = () => {
    setVisible(false)
    setForm(DEFAULT_FORM)
  }

  return (
    <>
      {/* Floating action button */}
      <Pressable
        style={styles.fab}
        onPress={() => setVisible(true)}
        accessibilityLabel="Open support ticket form"
        accessibilityRole="button"
      >
        <LifeBuoy color="#ffffff" size={22} />
      </Pressable>

      {/* Support ticket form bottom sheet */}
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title="Submit Support Ticket"
        snapPoint="80%"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Category picker */}
          <Text style={styles.label}>Category</Text>
          <View style={styles.pillRow}>
            {CATEGORIES.map(({ value, label }) => (
              <Pressable
                key={value}
                style={[
                  styles.pill,
                  form.category === value ? styles.pillActive : styles.pillInactive,
                ]}
                onPress={() => setForm((f) => ({ ...f, category: value }))}
              >
                <Text
                  style={[
                    styles.pillText,
                    form.category === value ? styles.pillTextActive : styles.pillTextInactive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Priority picker */}
          <Text style={[styles.label, styles.labelSpaced]}>Priority</Text>
          <View style={styles.pillRow}>
            {PRIORITIES.map(({ value, label }) => (
              <Pressable
                key={value}
                style={[
                  styles.pill,
                  form.priority === value ? styles.pillActive : styles.pillInactive,
                ]}
                onPress={() => setForm((f) => ({ ...f, priority: value }))}
              >
                <Text
                  style={[
                    styles.pillText,
                    form.priority === value ? styles.pillTextActive : styles.pillTextInactive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Title input */}
          <Text style={[styles.label, styles.labelSpaced]}>Title</Text>
          <TextInput
            style={[styles.input, titleError ? styles.inputError : null]}
            placeholder="Brief summary"
            placeholderTextColor="#64748b"
            value={form.title}
            onChangeText={(text) => setForm((f) => ({ ...f, title: text }))}
            onBlur={() => setForm((f) => ({ ...f, titleTouched: true }))}
            maxLength={200}
            returnKeyType="next"
          />
          {titleError ? (
            <Text style={styles.errorText}>{titleError}</Text>
          ) : null}

          {/* Description input */}
          <Text style={[styles.label, styles.labelSpaced]}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline, descriptionError ? styles.inputError : null]}
            placeholder="Describe your issue in detail..."
            placeholderTextColor="#64748b"
            value={form.description}
            onChangeText={(text) =>
              setForm((f) => ({ ...f, description: text.slice(0, 2000) }))
            }
            onBlur={() => setForm((f) => ({ ...f, descriptionTouched: true }))}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <View style={styles.charCountRow}>
            {descriptionError ? (
              <Text style={styles.errorText}>{descriptionError}</Text>
            ) : (
              <View />
            )}
            <Text style={styles.charCount}>
              {form.description.length}/2000
            </Text>
          </View>

          {/* Submit button */}
          <Pressable
            style={[
              styles.submitButton,
              (!isFormValid || isPending) ? styles.submitButtonDisabled : null,
            ]}
            onPress={() => submitTicket()}
            disabled={!isFormValid || isPending}
          >
            <Text style={styles.submitButtonText}>
              {isPending ? 'Submitting...' : 'Submit Ticket'}
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>
    </>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 88,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    // Android shadow
    elevation: 4,
    // iOS shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  labelSpaced: {
    marginTop: 16,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillActive: {
    backgroundColor: '#0284c7',
  },
  pillInactive: {
    backgroundColor: '#334155',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#ffffff',
  },
  pillTextInactive: {
    color: '#94a3b8',
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: 10,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  charCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  charCount: {
    color: '#64748b',
    fontSize: 11,
  },
  submitButton: {
    marginTop: 24,
    backgroundColor: '#0284c7',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
})
