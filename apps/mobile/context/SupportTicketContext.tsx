import React, { createContext, useContext, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { usePathname } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { ImagePlus, X } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { BottomSheet } from '../components/ui/BottomSheet'
import { createSupportTicket } from '@drivecommand/api-client'
import { useAuthContext } from './AuthContext'

// ─── Pathname → human-readable label ─────────────────────────────────────────

type RouteEntry = { pattern: RegExp; label: string }

const ROUTE_MAP: RouteEntry[] = [
  // Owner — specific before general
  { pattern: /^\/(owner)\/more\/settings\/account$/, label: 'Account Settings' },
  { pattern: /^\/(owner)\/more\/settings\/team$/, label: 'Team Settings' },
  { pattern: /^\/(owner)\/more\/settings(\/index)?$/, label: 'Settings' },
  { pattern: /^\/(owner)\/more\/trucks\/new$/, label: 'New Truck' },
  { pattern: /^\/(owner)\/more\/trucks\/[^/]+$/, label: 'Truck Details' },
  { pattern: /^\/(owner)\/more\/trucks(\/index)?$/, label: 'Trucks' },
  { pattern: /^\/(owner)\/more\/invoices\/new$/, label: 'New Invoice' },
  { pattern: /^\/(owner)\/more\/invoices\/[^/]+$/, label: 'Invoice Details' },
  { pattern: /^\/(owner)\/more\/invoices(\/index)?$/, label: 'Invoices' },
  { pattern: /^\/(owner)\/more\/crm\/new$/, label: 'New Customer' },
  { pattern: /^\/(owner)\/more\/crm(\/index)?$/, label: 'CRM' },
  { pattern: /^\/(owner)\/more\/fleet$/, label: 'Fleet' },
  { pattern: /^\/(owner)\/more\/compliance$/, label: 'Compliance' },
  { pattern: /^\/(owner)\/more\/payroll$/, label: 'Payroll' },
  { pattern: /^\/(owner)\/more\/ai-documents$/, label: 'AI Documents' },
  { pattern: /^\/(owner)\/more(\/index)?$/, label: 'More' },
  { pattern: /^\/(owner)\/loads\/[^/]+$/, label: 'Load Details' },
  { pattern: /^\/(owner)\/loads(\/index)?$/, label: 'Loads' },
  { pattern: /^\/(owner)\/drivers\/invite$/, label: 'Invite Driver' },
  { pattern: /^\/(owner)\/drivers\/[^/]+$/, label: 'Driver Details' },
  { pattern: /^\/(owner)\/drivers(\/index)?$/, label: 'Drivers' },
  { pattern: /^\/(owner)\/map$/, label: 'Map' },
  { pattern: /^\/(owner)(\/index)?$/, label: 'Dashboard' },
  // Driver — specific before general
  { pattern: /^\/(driver)\/loads\/my-route$/, label: 'My Route' },
  { pattern: /^\/(driver)\/loads\/[^/]+$/, label: 'Load Details' },
  { pattern: /^\/(driver)\/loads(\/index)?$/, label: 'Loads' },
  { pattern: /^\/(driver)\/documents$/, label: 'Documents' },
  { pattern: /^\/(driver)\/hos$/, label: 'Hours of Service' },
  { pattern: /^\/(driver)\/incidents\/new$/, label: 'New Incident' },
  { pattern: /^\/(driver)\/incidents(\/index)?$/, label: 'Incidents' },
  { pattern: /^\/(driver)\/messages$/, label: 'Messages' },
  { pattern: /^\/(driver)(\/index)?$/, label: 'Dashboard' },
]

function getPageLabel(pathname: string): string {
  for (const entry of ROUTE_MAP) {
    if (entry.pattern.test(pathname)) {
      return entry.label
    }
  }

  // Fallback: strip group prefix, capitalize each segment, join with " > "
  const stripped = pathname
    .replace(/^\/(owner|driver)\//, '')
    .replace(/^\/(owner|driver)$/, '')
  if (!stripped) return 'Dashboard'

  return stripped
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '))
    .join(' > ')
}

// ─── S3 upload helper ─────────────────────────────────────────────────────────

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL
  return 'http://localhost:3000'
}

async function uploadScreenshot(uri: string, token: string): Promise<string> {
  const fileName = uri.split('/').pop() ?? 'screenshot.jpg'
  const mimeType = fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'

  // Read the file as base64 and send as JSON — fetch with JSON body is the
  // most reliable transport from React Native (same path used for ticket submit).
  // uploadAsync MULTIPART silently fails to reach the local dev server.
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 })

  const res = await fetch(`${getBaseUrl()}/api/mobile/support/upload-screenshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ base64, mimeType, fileName }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Screenshot upload failed: HTTP ${res.status} ${text}`)
  }

  const { s3Key } = (await res.json()) as { s3Key: string }
  return s3Key
}

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
  screenshotUri: string | null
}

const DEFAULT_FORM: FormState = {
  category: 'GENERAL',
  priority: 'NORMAL',
  title: '',
  description: '',
  titleTouched: false,
  descriptionTouched: false,
  screenshotUri: null,
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface SupportTicketContextValue {
  open: () => void
}

const SupportTicketContext = createContext<SupportTicketContextValue | null>(null)

export function useSupportTicket(): SupportTicketContextValue {
  const ctx = useContext(SupportTicketContext)
  if (!ctx) {
    throw new Error('useSupportTicket must be used within SupportTicketProvider')
  }
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function SupportTicketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuthContext()
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const uploadPhaseRef = useRef(false)

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
    mutationFn: async () => {
      if (!token) throw new Error('Not authenticated')

      let screenshotKey: string | undefined

      if (form.screenshotUri) {
        uploadPhaseRef.current = true
        screenshotKey = await uploadScreenshot(form.screenshotUri, token)
        uploadPhaseRef.current = false
      }

      const label = getPageLabel(pathname)
      return createSupportTicket(token, {
        category: form.category,
        priority: form.priority,
        title: form.title.trim(),
        description: form.description.trim(),
        fromPage: `${pathname} (${label})`,
        ...(screenshotKey ? { screenshotKey } : {}),
      })
    },
    onSuccess: (data) => {
      const label = getPageLabel(pathname)
      Toast.show({
        type: 'success',
        text1: `Ticket #${data.ticketNumber} submitted!`,
        text2: `Submitted from ${label}`,
      })
      setVisible(false)
      setForm(DEFAULT_FORM)
      uploadPhaseRef.current = false
    },
    onError: () => {
      uploadPhaseRef.current = false
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

  const open = () => {
    setVisible(true)
  }

  const pickScreenshot = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'Permission required',
        text2: 'Allow photo access to attach a screenshot.',
        visibilityTime: 3000,
      })
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setForm((f) => ({ ...f, screenshotUri: result.assets[0].uri }))
    }
  }

  const getSubmitLabel = () => {
    if (!isPending) return 'Submit Ticket'
    return uploadPhaseRef.current ? 'Uploading...' : 'Submitting...'
  }

  return (
    <SupportTicketContext.Provider value={{ open }}>
      {children}

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

          {/* Screenshot attachment */}
          {form.screenshotUri ? (
            <View style={styles.previewContainer}>
              <Image
                source={{ uri: form.screenshotUri }}
                style={styles.previewImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <Pressable
                style={styles.removeButton}
                onPress={() => setForm((f) => ({ ...f, screenshotUri: null }))}
                accessibilityLabel="Remove screenshot"
              >
                <X color="#ffffff" size={14} />
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.attachButton} onPress={pickScreenshot}>
              <ImagePlus color="#94a3b8" size={16} />
              <Text style={styles.attachButtonText}>Attach Screenshot</Text>
            </Pressable>
          )}

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
              {getSubmitLabel()}
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>
    </SupportTicketContext.Provider>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
  previewContainer: {
    marginTop: 12,
    position: 'relative',
  },
  previewImage: {
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  attachButtonText: {
    color: '#94a3b8',
    fontSize: 14,
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
