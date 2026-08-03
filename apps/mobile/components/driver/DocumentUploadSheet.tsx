// TODO(quick-348-followup): Mirror Lock icon + Restricted badge + confirm dialog
// from apps/web/src/app/(driver)/documents/document-list.tsx for restricted DocumentTypes.
// Server-side RBAC + 15-min presigned URL enforcement is already active regardless of client UI.
import React, { useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { getInfoAsync } from 'expo-file-system/legacy'
import { putToPresignedUrl, readFileAsBytes } from '../../lib/upload'
import Toast from 'react-native-toast-message'
import { ChevronLeft, Image, X, File } from 'lucide-react-native'
import { driverApi, type DocumentType } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'
import { useThemeColors } from '../../constants/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocTypeOption {
  key: DocumentType
  label: string
  defaultName: string
}

const DOC_TYPES: DocTypeOption[] = [
  { key: 'CDL', label: 'Commercial Driver License', defaultName: 'CDL' },
  { key: 'MEDICAL_CARD', label: 'Medical Certificate', defaultName: 'Medical Card' },
  { key: 'HAZMAT', label: 'HazMat Certification', defaultName: 'HazMat Certificate' },
  { key: 'INSURANCE', label: 'Insurance', defaultName: 'Insurance Card' },
  { key: 'REGISTRATION', label: 'Registration', defaultName: 'Vehicle Registration' },
  { key: 'INSPECTION', label: 'Inspection Report', defaultName: 'Inspection Report' },
  { key: 'OTHER', label: 'Other Document', defaultName: 'Document' },
]

interface SelectedFile {
  uri: string
  name: string
  size: number
  mimeType: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface DocumentUploadSheetProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DocumentUploadSheet({ visible, onClose, onSuccess }: DocumentUploadSheetProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()

  const [docType, setDocType] = useState<DocumentType | null>(null)
  const [docName, setDocName] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [typePickerVisible, setTypePickerVisible] = useState(false)
  // Android media picker sheet
  const [mediaPickerVisible, setMediaPickerVisible] = useState(false)

  const selectedTypeOption = DOC_TYPES.find((t) => t.key === docType) ?? null

  function handleTypeSelect(option: DocTypeOption) {
    setDocType(option.key)
    if (!docName || DOC_TYPES.some((t) => t.defaultName === docName)) {
      setDocName(option.defaultName)
    }
    setErrors((prev) => ({ ...prev, docType: '' }))
    setTypePickerVisible(false)
  }

  // ---------------------------------------------------------------------------
  // File picking — native action sheet
  // ---------------------------------------------------------------------------

  function handleAddFile() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) launchCamera()
          else if (index === 2) launchGallery()
        }
      )
    } else {
      setMediaPickerVisible(true)
    }
  }

  async function launchGallery() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Allow photo access in Settings.' })
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.85,
        allowsEditing: false,
        allowsMultipleSelection: false,
      })

      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset) return

      const fileInfo = await getInfoAsync(asset.uri)
      const size = fileInfo.exists ? fileInfo.size : 0
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
      const name = `document-${Date.now()}.${ext}`

      setSelectedFile({ uri: asset.uri, name, size, mimeType })
      setErrors((prev) => ({ ...prev, file: '' }))
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not open photo library.' })
    }
  }

  async function launchCamera() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Allow camera access in Settings.' })
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.85,
        allowsEditing: false,
      })

      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset) return

      const fileInfo = await getInfoAsync(asset.uri)
      const size = fileInfo.exists ? fileInfo.size : 0
      const name = `document-photo-${Date.now()}.jpg`

      setSelectedFile({ uri: asset.uri, name, size, mimeType: 'image/jpeg' })
      setErrors((prev) => ({ ...prev, file: '' }))
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not open camera.' })
    }
  }

  // ---------------------------------------------------------------------------
  // Validation + submit
  // ---------------------------------------------------------------------------

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!docType) newErrors.docType = 'Select a document type'
    if (!docName.trim()) newErrors.docName = 'Document name is required'
    if (expiryDate.trim()) {
      const parsed = new Date(expiryDate.trim())
      if (isNaN(parsed.getTime())) newErrors.expiryDate = 'Use format: YYYY-MM-DD'
    }
    if (!selectedFile) newErrors.file = 'Add a photo or file'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    if (!token || !selectedFile || !docType) return

    setIsSubmitting(true)
    setProgress(5)

    try {
      setProgressLabel('Preparing upload...')
      setProgress(15)

      const { uploadUrl, s3Key } = await driverApi.getDocumentUploadUrl(token, {
        fileName: selectedFile.name,
        contentType: selectedFile.mimeType,
        sizeBytes: selectedFile.size,
      })

      setProgressLabel('Uploading file...')
      setProgress(30)

      const bytes = await readFileAsBytes(selectedFile.uri)
      setProgress(55)

      await putToPresignedUrl(uploadUrl, bytes, selectedFile.mimeType)

      setProgress(80)
      setProgressLabel('Saving document...')

      const expiryDateParsed = expiryDate.trim() ? new Date(expiryDate.trim()).toISOString() : undefined

      await driverApi.uploadDocument(token, {
        type: docType,
        name: docName.trim(),
        expiryDate: expiryDateParsed,
        s3Key,
        contentType: selectedFile.mimeType,
        sizeBytes: selectedFile.size,
      })

      setProgress(100)
      setProgressLabel('Done!')
      setDocType(null)
      setDocName('')
      setExpiryDate('')
      setSelectedFile(null)
      setErrors({})
      onSuccess()
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Upload Failed',
        text2: err instanceof Error ? err.message : 'An unexpected error occurred',
      })
    } finally {
      setIsSubmitting(false)
      setProgress(0)
      setProgressLabel('')
    }
  }

  function handleClose() {
    if (isSubmitting) return
    setDocType(null)
    setDocName('')
    setExpiryDate('')
    setSelectedFile(null)
    setErrors({})
    onClose()
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Main upload sheet */}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={handleClose} />

        <View
          style={{
            height: '80%',
            backgroundColor: c.surfaceCard,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: c.border,
          }}
        >
          {/* Handle */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full" style={{ backgroundColor: c.border }} />
          </View>

          {/* Header */}
          <View
            className="flex-row items-center justify-between px-4 py-3"
            style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
          >
            <Text className="text-lg font-bold" style={{ color: c.textPrimary }}>Upload Document</Text>
            <Pressable onPress={handleClose} className="p-1 active:opacity-60" disabled={isSubmitting}>
              <X color={c.textSecondary} size={20} />
            </Pressable>
          </View>

          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Document Type */}
            <View className="mb-4">
              <Text className="font-semibold text-sm mb-2" style={{ color: c.textSecondary }}>
                Document Type <Text className="text-red-400">*</Text>
              </Text>
              <Pressable
                onPress={() => setTypePickerVisible(true)}
                disabled={isSubmitting}
                className="flex-row items-center justify-between rounded-xl px-4 py-3.5 active:opacity-80"
                style={{ backgroundColor: c.surfaceInput, borderWidth: 1, borderColor: c.border }}
              >
                <Text style={{ color: selectedTypeOption ? c.textPrimary : c.textMuted, fontSize: 14 }}>
                  {selectedTypeOption ? selectedTypeOption.label : 'Select document type...'}
                </Text>
                <ChevronLeft color={c.textTertiary} size={16} style={{ transform: [{ rotate: '-90deg' }] }} />
              </Pressable>
              {errors.docType ? <Text className="text-red-500 text-xs mt-1">{errors.docType}</Text> : null}
            </View>

            {/* Document Name */}
            <View className="mb-4">
              <Text className="font-semibold text-sm mb-2" style={{ color: c.textSecondary }}>
                Document Name <Text className="text-red-400">*</Text>
              </Text>
              <TextInput
                value={docName}
                onChangeText={(v) => { setDocName(v); setErrors((p) => ({ ...p, docName: '' })) }}
                placeholder="e.g. CDL Class A"
                placeholderTextColor={c.textMuted}
                editable={!isSubmitting}
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: c.surfaceInput,
                  borderWidth: 1,
                  borderColor: errors.docName ? '#ef4444' : c.border,
                  color: c.textPrimary,
                }}
              />
              {errors.docName ? <Text className="text-red-500 text-xs mt-1">{errors.docName}</Text> : null}
            </View>

            {/* Expiry Date */}
            <View className="mb-4">
              <Text className="font-semibold text-sm mb-2" style={{ color: c.textSecondary }}>
                Expiry Date <Text style={{ color: c.textTertiary }} className="font-normal">(optional)</Text>
              </Text>
              <TextInput
                value={expiryDate}
                onChangeText={(v) => { setExpiryDate(v); setErrors((p) => ({ ...p, expiryDate: '' })) }}
                placeholder="YYYY-MM-DD (e.g. 2027-01-15)"
                placeholderTextColor={c.textMuted}
                keyboardType="numbers-and-punctuation"
                editable={!isSubmitting}
                className="rounded-xl px-4 py-3 text-sm"
                style={{ backgroundColor: c.surfaceInput, borderWidth: 1, borderColor: c.border, color: c.textPrimary }}
              />
              {errors.expiryDate ? <Text className="text-red-500 text-xs mt-1">{errors.expiryDate}</Text> : null}
            </View>

            {/* File — single tap to open native picker */}
            <View className="mb-5">
              <Text className="font-semibold text-sm mb-2" style={{ color: c.textSecondary }}>
                File <Text className="text-red-400">*</Text>
              </Text>

              {selectedFile ? (
                <View
                  className="rounded-xl px-4 py-3 flex-row items-center"
                  style={{ backgroundColor: c.surfaceInput, borderWidth: 1, borderColor: c.border }}
                >
                  <File color={c.brand} size={18} style={{ flexShrink: 0 }} />
                  <View className="flex-1 ml-3 min-w-0">
                    <Text className="text-sm font-medium" style={{ color: c.textPrimary }} numberOfLines={1}>{selectedFile.name}</Text>
                    <Text className="text-xs mt-0.5" style={{ color: c.textSecondary }}>{formatBytes(selectedFile.size)}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedFile(null)} disabled={isSubmitting} className="p-1 ml-2 active:opacity-60">
                    <X color={c.textTertiary} size={16} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handleAddFile}
                  disabled={isSubmitting}
                  style={{
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderRadius: 14,
                    paddingVertical: 28,
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: c.background,
                    borderColor: errors.file ? '#ef4444' : c.border,
                  }}
                  className="active:opacity-70"
                >
                  <Image color={c.brand} size={28} />
                  <Text style={{ color: c.brand, fontWeight: '600', fontSize: 15 }}>Add Photo or File</Text>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>Tap to choose from library, camera, or files</Text>
                </Pressable>
              )}

              {selectedFile ? (
                <Pressable onPress={handleAddFile} disabled={isSubmitting} className="mt-2 active:opacity-60">
                  <Text className="text-sky-400 text-xs text-center">Change file</Text>
                </Pressable>
              ) : null}

              {errors.file ? <Text className="text-red-500 text-xs mt-1">{errors.file}</Text> : null}
            </View>

            {/* Upload Progress */}
            {isSubmitting && (
              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-xs" style={{ color: c.textSecondary }}>{progressLabel}</Text>
                  <Text className="text-xs" style={{ color: c.textSecondary }}>{progress}%</Text>
                </View>
                <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: c.border }}>
                  <View style={{ width: `${progress}%`, height: '100%', backgroundColor: c.brand, borderRadius: 9999 }} />
                </View>
              </View>
            )}

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={{
                backgroundColor: isSubmitting ? c.brandDark : c.brand,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              {isSubmitting ? (
                <>
                  <ActivityIndicator color="#ffffff" size="small" />
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 15 }}>{progressLabel || 'Uploading...'}</Text>
                </>
              ) : (
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 15 }}>Upload Document</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Document Type Picker */}
      <Modal visible={typePickerVisible} transparent animationType="slide" onRequestClose={() => setTypePickerVisible(false)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setTypePickerVisible(false)} />
        <View
          style={{
            backgroundColor: c.surfaceCard,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: c.border,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 40,
          }}
        >
          <View className="self-center w-12 h-1 rounded-full mb-5" style={{ backgroundColor: c.border }} />
          <Text className="text-xl font-bold mb-4" style={{ color: c.textPrimary }}>Document Type</Text>
          {DOC_TYPES.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => handleTypeSelect(option)}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 12,
                borderRadius: 12,
                marginBottom: 2,
                backgroundColor: docType === option.key ? c.surfaceElevated : 'transparent',
              }}
              className="active:opacity-75"
            >
              <Text style={{ color: docType === option.key ? c.textPrimary : c.textSecondary, fontSize: 15, fontWeight: docType === option.key ? '600' : '400' }}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Android media source picker */}
      <Modal visible={mediaPickerVisible} transparent animationType="slide" onRequestClose={() => setMediaPickerVisible(false)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setMediaPickerVisible(false)} />
        <View
          style={{
            backgroundColor: c.surfaceCard,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: c.border,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 40,
          }}
        >
          <View className="self-center w-12 h-1 rounded-full mb-5" style={{ backgroundColor: c.border }} />
          <Text className="text-xl font-bold mb-4" style={{ color: c.textPrimary }}>Add Document</Text>

          {[
            { label: 'Choose from Gallery', action: () => { setMediaPickerVisible(false); setTimeout(launchGallery, 300) } },
            { label: 'Take Photo', action: () => { setMediaPickerVisible(false); setTimeout(launchCamera, 300) } },
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={item.action}
              style={{ paddingVertical: 16, paddingHorizontal: 12, borderRadius: 12, marginBottom: 2 }}
              className="active:opacity-75"
            >
              <Text style={{ color: c.textSecondary, fontSize: 16 }}>{item.label}</Text>
            </Pressable>
          ))}

          <Pressable
            onPress={() => setMediaPickerVisible(false)}
            style={{ marginTop: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: c.surfaceElevated, alignItems: 'center' }}
            className="active:opacity-80"
          >
            <Text style={{ color: c.textSecondary, fontSize: 15, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  )
}
