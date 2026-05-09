import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { getInfoAsync } from 'expo-file-system/legacy'
import * as Haptics from 'expo-haptics'
import NetInfo from '@react-native-community/netinfo'
import Toast from 'react-native-toast-message'
import { Camera, ImageIcon, FileText, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useAuthContext } from '@/context/AuthContext'
import { carrierDriverApi } from '@drivecommand/api-client'
import { useThemeColors } from '@/constants/tokens'
import { kvStorage } from '@/lib/storage'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocSource = 'camera' | 'gallery' | 'document'
type UploadStep = 'select' | 'preview' | 'uploading' | 'success' | 'error'

interface SelectedFile {
  uri: string
  name: string
  size: number
  mimeType: string
}

interface PendingCarrierUpload {
  uri: string
  name: string
  size: number
  mimeType: string
  stopId: string
  documentType: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StopDocumentUploadProps {
  stopId: string
  dispatchId: string
  documentType: 'bol' | 'pod'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function pendingUploadKey(stopId: string, documentType: string): string {
  return `carrier_pending_upload_${stopId}_${documentType}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StopDocumentUpload({ stopId, dispatchId, documentType }: StopDocumentUploadProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()

  const [step, setStep] = useState<UploadStep>('select')
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const docLabel = documentType === 'bol' ? 'BOL' : 'POD'

  // ---------------------------------------------------------------------------
  // Offline flush: on reconnect, attempt any saved upload for this stop
  // ---------------------------------------------------------------------------

  const attemptFlushPending = useCallback(async () => {
    const key = pendingUploadKey(stopId, documentType)
    const pending = kvStorage.getObject<PendingCarrierUpload>(key)
    if (!pending || !token) return

    try {
      const formData = new FormData()
      formData.append('file', {
        uri: pending.uri,
        name: pending.name,
        type: pending.mimeType,
      } as unknown as Blob)
      formData.append('documentType', pending.documentType)

      await carrierDriverApi.uploadStopDocument(token, stopId, documentType, formData)
      kvStorage.delete(key)
      Toast.show({
        type: 'success',
        text1: 'Upload Complete',
        text2: `${docLabel} was uploaded after reconnecting.`,
      })
    } catch {
      // Leave pending record — will retry next time connection returns
    }
  }, [stopId, documentType, token, docLabel])

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        attemptFlushPending()
      }
    })
    return () => unsubscribe()
  }, [attemptFlushPending])

  // ---------------------------------------------------------------------------
  // Source selection
  // ---------------------------------------------------------------------------

  async function handleTakePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        Toast.show({
          type: 'error',
          text1: 'Permission Denied',
          text2: 'Allow camera access in Settings.',
        })
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsEditing: false,
      })

      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset) return

      const fileInfo = await getInfoAsync(asset.uri)
      const size = fileInfo.exists ? (fileInfo as { size?: number }).size ?? 0 : 0
      const name = `${documentType}-photo-${Date.now()}.jpg`

      setSelectedFile({ uri: asset.uri, name, size, mimeType: 'image/jpeg' })
      setStep('preview')
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not open camera.' })
    }
  }

  async function handleChooseGallery() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Toast.show({
          type: 'error',
          text1: 'Permission Denied',
          text2: 'Allow photo access in Settings.',
        })
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsEditing: false,
        allowsMultipleSelection: false,
      })

      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset) return

      const fileInfo = await getInfoAsync(asset.uri)
      const size = fileInfo.exists ? (fileInfo as { size?: number }).size ?? 0 : 0
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
      const name = `${documentType}-image-${Date.now()}.${ext}`

      setSelectedFile({ uri: asset.uri, name, size, mimeType })
      setStep('preview')
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not open photo library.' })
    }
  }

  async function handleChoosePDF() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })

      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset) return

      const size = asset.size ?? 0
      const name = asset.name || `${documentType}-document-${Date.now()}.pdf`

      setSelectedFile({ uri: asset.uri, name, size, mimeType: 'application/pdf' })
      setStep('preview')
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not open document picker.' })
    }
  }

  // ---------------------------------------------------------------------------
  // Upload
  // ---------------------------------------------------------------------------

  async function handleUpload() {
    if (!selectedFile || !token) return

    const netState = await NetInfo.fetch()
    const isOnline = netState.isConnected && netState.isInternetReachable !== false

    if (!isOnline) {
      // Offline path — save to MMKV
      const key = pendingUploadKey(stopId, documentType)
      const pendingData: PendingCarrierUpload = {
        uri: selectedFile.uri,
        name: selectedFile.name,
        size: selectedFile.size,
        mimeType: selectedFile.mimeType,
        stopId,
        documentType,
        timestamp: Date.now(),
      }
      kvStorage.setObject(key, pendingData)

      Toast.show({
        type: 'info',
        text1: 'Saved Offline',
        text2: `${docLabel} will upload automatically when you reconnect.`,
      })

      setTimeout(() => router.back(), 2000)
      return
    }

    // Online path
    setStep('uploading')
    setProgress(0)
    setProgressLabel('Preparing upload...')
    setErrorMessage('')

    try {
      setProgress(30)
      setProgressLabel('Uploading...')

      const formData = new FormData()
      formData.append('file', {
        uri: selectedFile.uri,
        name: selectedFile.name,
        type: selectedFile.mimeType,
      } as unknown as Blob)
      formData.append('documentType', documentType)

      setProgress(60)
      setProgressLabel('Saving document...')

      await carrierDriverApi.uploadStopDocument(token, stopId, documentType, formData)

      setProgress(100)
      setProgressLabel('Done!')
      setStep('success')

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

      setTimeout(() => router.back(), 1500)
    } catch (err) {
      setStep('error')
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.'
      setErrorMessage(msg)
      Toast.show({ type: 'error', text1: 'Upload Failed', text2: msg })
    }
  }

  function handleRetake() {
    setSelectedFile(null)
    setStep('select')
  }

  function handleRetry() {
    setStep('preview')
    setErrorMessage('')
    setProgress(0)
    setProgressLabel('')
  }

  // ---------------------------------------------------------------------------
  // Render — step: select
  // ---------------------------------------------------------------------------

  if (step === 'select') {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: c.background }]}
        contentContainerStyle={styles.selectContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
          Choose source
        </Text>

        <Pressable
          onPress={handleTakePhoto}
          accessibilityRole="button"
          accessibilityLabel="Take a photo"
          style={[styles.sourceCard, { backgroundColor: c.surfaceCard, borderColor: c.border }]}
        >
          <View style={[styles.sourceIconCircle, { backgroundColor: c.brandSubtle }]}>
            <Camera size={24} color={c.brand} />
          </View>
          <View style={styles.sourceCardText}>
            <Text style={[styles.sourceCardTitle, { color: c.textPrimary }]}>Take Photo</Text>
            <Text style={[styles.sourceCardSub, { color: c.textTertiary }]}>
              Use your camera to capture the {docLabel}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={handleChooseGallery}
          accessibilityRole="button"
          accessibilityLabel="Choose from gallery"
          style={[styles.sourceCard, { backgroundColor: c.surfaceCard, borderColor: c.border }]}
        >
          <View style={[styles.sourceIconCircle, { backgroundColor: c.brandSubtle }]}>
            <ImageIcon size={24} color={c.brand} />
          </View>
          <View style={styles.sourceCardText}>
            <Text style={[styles.sourceCardTitle, { color: c.textPrimary }]}>Choose from Gallery</Text>
            <Text style={[styles.sourceCardSub, { color: c.textTertiary }]}>
              Select an existing photo from your library
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={handleChoosePDF}
          accessibilityRole="button"
          accessibilityLabel="Choose a PDF document"
          style={[styles.sourceCard, { backgroundColor: c.surfaceCard, borderColor: c.border }]}
        >
          <View style={[styles.sourceIconCircle, { backgroundColor: c.brandSubtle }]}>
            <FileText size={24} color={c.brand} />
          </View>
          <View style={styles.sourceCardText}>
            <Text style={[styles.sourceCardTitle, { color: c.textPrimary }]}>Choose PDF</Text>
            <Text style={[styles.sourceCardSub, { color: c.textTertiary }]}>
              Upload a PDF file from your device
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    )
  }

  // ---------------------------------------------------------------------------
  // Render — step: preview
  // ---------------------------------------------------------------------------

  if (step === 'preview' && selectedFile) {
    const isPDF = selectedFile.mimeType === 'application/pdf'

    return (
      <ScrollView
        style={[styles.container, { backgroundColor: c.background }]}
        contentContainerStyle={styles.previewContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>Preview</Text>

        {/* Preview area */}
        <View style={[styles.previewCard, { backgroundColor: c.surfaceCard, borderColor: c.border }]}>
          {isPDF ? (
            <View style={styles.pdfPreview}>
              <FileText size={48} color={c.textTertiary} />
              <Text style={[styles.pdfPreviewLabel, { color: c.textSecondary }]}>PDF Document</Text>
            </View>
          ) : (
            <Image
              source={{ uri: selectedFile.uri }}
              style={styles.imagePreview}
              contentFit="contain"
              accessibilityLabel="Document preview"
            />
          )}
        </View>

        {/* File info */}
        <View style={[styles.fileInfoRow, { borderColor: c.border }]}>
          <Text style={[styles.fileName, { color: c.textPrimary }]} numberOfLines={1}>
            {selectedFile.name}
          </Text>
          <Text style={[styles.fileSize, { color: c.textTertiary }]}>
            {formatBytes(selectedFile.size)}
          </Text>
        </View>

        {/* Retake */}
        <Pressable
          onPress={handleRetake}
          accessibilityRole="button"
          accessibilityLabel="Retake or change file"
          style={[styles.retakeButton, { borderColor: c.border }]}
        >
          <RefreshCw size={15} color={c.textSecondary} />
          <Text style={[styles.retakeButtonText, { color: c.textSecondary }]}>Retake / Change</Text>
        </Pressable>

        {/* Upload button */}
        <Pressable
          onPress={handleUpload}
          accessibilityRole="button"
          accessibilityLabel={`Upload ${docLabel}`}
          style={[styles.uploadButton, { backgroundColor: c.brand }]}
        >
          <Text style={styles.uploadButtonText}>Upload {docLabel}</Text>
        </Pressable>
      </ScrollView>
    )
  }

  // ---------------------------------------------------------------------------
  // Render — step: uploading
  // ---------------------------------------------------------------------------

  if (step === 'uploading') {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.brand} />
        <Text style={[styles.uploadingLabel, { color: c.textPrimary }]}>
          {progressLabel || 'Uploading...'}
        </Text>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: c.brand, width: `${progress}%` },
            ]}
          />
        </View>
        <Text style={[styles.progressPercent, { color: c.textTertiary }]}>{progress}%</Text>
      </View>
    )
  }

  // ---------------------------------------------------------------------------
  // Render — step: success
  // ---------------------------------------------------------------------------

  if (step === 'success') {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: c.background }]}>
        <CheckCircle size={56} color={c.success} />
        <Text style={[styles.successLabel, { color: c.textPrimary }]}>Uploaded successfully</Text>
        <Text style={[styles.successSub, { color: c.textSecondary }]}>
          {docLabel} has been saved to this stop.
        </Text>
      </View>
    )
  }

  // ---------------------------------------------------------------------------
  // Render — step: error
  // ---------------------------------------------------------------------------

  if (step === 'error') {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: c.background }]}>
        <AlertCircle size={56} color={c.danger} />
        <Text style={[styles.errorLabel, { color: c.textPrimary }]}>Upload Failed</Text>
        <Text style={[styles.errorSub, { color: c.textSecondary }]}>{errorMessage}</Text>
        <Pressable
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry upload"
          style={[styles.retryButton, { backgroundColor: c.brand }]}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Select step
  selectContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  sourceIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceCardText: {
    flex: 1,
    gap: 3,
  },
  sourceCardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sourceCardSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  // Preview step
  previewContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  pdfPreview: {
    alignItems: 'center',
    gap: 10,
  },
  pdfPreviewLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  fileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 10,
    gap: 8,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  fileSize: {
    fontSize: 12,
    flexShrink: 0,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  retakeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  uploadButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Uploading + success + error
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
  },
  uploadingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 12,
  },
  successLabel: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  successSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorLabel: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  errorSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 4,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
})
