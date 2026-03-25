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
import { getInfoAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy'
import Toast from 'react-native-toast-message'
import { ChevronLeft, Image, X, File } from 'lucide-react-native'
import { driverApi, type DocumentType } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'

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

      const base64 = await readAsStringAsync(selectedFile.uri, { encoding: EncodingType.Base64 })
      setProgress(55)

      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.mimeType },
        body: bytes,
      })

      if (!uploadRes.ok) throw new Error(`Upload failed: HTTP ${uploadRes.status}`)

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
            backgroundColor: '#1e293b',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: '#334155',
          }}
        >
          {/* Handle */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-slate-600" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-700">
            <Text className="text-white text-lg font-bold">Upload Document</Text>
            <Pressable onPress={handleClose} className="p-1 active:opacity-60" disabled={isSubmitting}>
              <X color="#94a3b8" size={20} />
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
              <Text className="text-slate-300 font-semibold text-sm mb-2">
                Document Type <Text className="text-red-400">*</Text>
              </Text>
              <Pressable
                onPress={() => setTypePickerVisible(true)}
                disabled={isSubmitting}
                className="flex-row items-center justify-between bg-slate-800 border border-slate-600 rounded-xl px-4 py-3.5 active:opacity-80"
              >
                <Text className={selectedTypeOption ? 'text-white text-sm' : 'text-slate-500 text-sm'}>
                  {selectedTypeOption ? selectedTypeOption.label : 'Select document type...'}
                </Text>
                <ChevronLeft color="#64748b" size={16} style={{ transform: [{ rotate: '-90deg' }] }} />
              </Pressable>
              {errors.docType ? <Text className="text-red-500 text-xs mt-1">{errors.docType}</Text> : null}
            </View>

            {/* Document Name */}
            <View className="mb-4">
              <Text className="text-slate-300 font-semibold text-sm mb-2">
                Document Name <Text className="text-red-400">*</Text>
              </Text>
              <TextInput
                value={docName}
                onChangeText={(v) => { setDocName(v); setErrors((p) => ({ ...p, docName: '' })) }}
                placeholder="e.g. CDL Class A"
                placeholderTextColor="#475569"
                editable={!isSubmitting}
                className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm"
              />
              {errors.docName ? <Text className="text-red-500 text-xs mt-1">{errors.docName}</Text> : null}
            </View>

            {/* Expiry Date */}
            <View className="mb-4">
              <Text className="text-slate-300 font-semibold text-sm mb-2">
                Expiry Date <Text className="text-slate-500 font-normal">(optional)</Text>
              </Text>
              <TextInput
                value={expiryDate}
                onChangeText={(v) => { setExpiryDate(v); setErrors((p) => ({ ...p, expiryDate: '' })) }}
                placeholder="YYYY-MM-DD (e.g. 2027-01-15)"
                placeholderTextColor="#475569"
                keyboardType="numbers-and-punctuation"
                editable={!isSubmitting}
                className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm"
              />
              {errors.expiryDate ? <Text className="text-red-500 text-xs mt-1">{errors.expiryDate}</Text> : null}
            </View>

            {/* File — single tap to open native picker */}
            <View className="mb-5">
              <Text className="text-slate-300 font-semibold text-sm mb-2">
                File <Text className="text-red-400">*</Text>
              </Text>

              {selectedFile ? (
                <View className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 flex-row items-center">
                  <File color="#38bdf8" size={18} style={{ flexShrink: 0 }} />
                  <View className="flex-1 ml-3 min-w-0">
                    <Text className="text-white text-sm font-medium" numberOfLines={1}>{selectedFile.name}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5">{formatBytes(selectedFile.size)}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedFile(null)} disabled={isSubmitting} className="p-1 ml-2 active:opacity-60">
                    <X color="#64748b" size={16} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handleAddFile}
                  disabled={isSubmitting}
                  style={{
                    borderWidth: 1.5,
                    borderColor: errors.file ? '#ef4444' : '#334155',
                    borderStyle: 'dashed',
                    borderRadius: 14,
                    paddingVertical: 28,
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: '#0f172a',
                  }}
                  className="active:opacity-70"
                >
                  <Image color="#38bdf8" size={28} />
                  <Text style={{ color: '#38bdf8', fontWeight: '600', fontSize: 15 }}>Add Photo or File</Text>
                  <Text style={{ color: '#475569', fontSize: 12 }}>Tap to choose from library, camera, or files</Text>
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
                  <Text className="text-slate-400 text-xs">{progressLabel}</Text>
                  <Text className="text-slate-400 text-xs">{progress}%</Text>
                </View>
                <View className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <View style={{ width: `${progress}%` }} className="h-full bg-sky-500 rounded-full" />
                </View>
              </View>
            )}

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={{
                backgroundColor: isSubmitting ? '#0c4a6e' : '#0ea5e9',
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
            backgroundColor: '#1e293b',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: '#334155',
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 40,
          }}
        >
          <View className="self-center w-12 h-1 bg-slate-600 rounded-full mb-5" />
          <Text className="text-white text-xl font-bold mb-4">Document Type</Text>
          {DOC_TYPES.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => handleTypeSelect(option)}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 12,
                borderRadius: 12,
                marginBottom: 2,
                backgroundColor: docType === option.key ? '#334155' : 'transparent',
              }}
              className="active:bg-slate-700/50"
            >
              <Text style={{ color: docType === option.key ? '#ffffff' : '#cbd5e1', fontSize: 15, fontWeight: docType === option.key ? '600' : '400' }}>
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
            backgroundColor: '#1e293b',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: '#334155',
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 40,
          }}
        >
          <View className="self-center w-12 h-1 bg-slate-600 rounded-full mb-5" />
          <Text className="text-white text-xl font-bold mb-4">Add Document</Text>

          {[
            { label: 'Choose from Gallery', action: () => { setMediaPickerVisible(false); setTimeout(launchGallery, 300) } },
            { label: 'Take Photo', action: () => { setMediaPickerVisible(false); setTimeout(launchCamera, 300) } },
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={item.action}
              style={{ paddingVertical: 16, paddingHorizontal: 12, borderRadius: 12, marginBottom: 2 }}
              className="active:bg-slate-700/50"
            >
              <Text style={{ color: '#cbd5e1', fontSize: 16 }}>{item.label}</Text>
            </Pressable>
          ))}

          <Pressable
            onPress={() => setMediaPickerVisible(false)}
            style={{ marginTop: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#334155', alignItems: 'center' }}
            className="active:opacity-80"
          >
            <Text style={{ color: '#94a3b8', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  )
}
