import React, { useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { ArrowLeft, Upload, Camera } from 'lucide-react-native'
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

interface SelectedFile {
  uri: string
  fileName?: string | null
  mimeType?: string | null
}

interface DocumentUploadScreenProps {
  stepInstance: StepInstance
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function DocumentUploadScreen({ stepInstance }: DocumentUploadScreenProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const stepSnapshot = stepInstance.stepSnapshot
  const docTypeName = (stepSnapshot.documentTypeName as string | undefined) ?? 'Document'

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'mixed' as unknown as ImagePicker.MediaType,
      allowsEditing: false,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setSelectedFile({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      })
    }
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Toast.show({ type: 'error', text1: 'Camera permission denied' })
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setSelectedFile({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      })
    }
  }

  async function handleSubmit() {
    if (!selectedFile || !token) return
    setIsSubmitting(true)
    haptic.medium()
    try {
      // 1. Get presigned upload URL
      const presignedRes = await fetch(
        `${API_BASE_URL}/api/mobile/driver/documents/upload-url`,
        {
          method: 'POST',
          body: JSON.stringify({
            fileName: selectedFile.fileName ?? 'upload',
            contentType: selectedFile.mimeType ?? 'application/octet-stream',
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!presignedRes.ok) throw new Error('Failed to get upload URL')
      const { uploadUrl, s3Key } = await presignedRes.json() as { uploadUrl: string; s3Key: string }

      // 2. Upload file to S3
      const fileBlob = await fetch(selectedFile.uri).then((r) => r.blob())
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: fileBlob,
        headers: {
          'Content-Type': selectedFile.mimeType ?? 'application/octet-stream',
        },
      })
      if (!uploadRes.ok) throw new Error('File upload failed')

      // 3. Complete step
      const completeRes = await fetch(
        `${API_BASE_URL}/api/mobile/driver/tasks/${stepInstance.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ result: { fileUrls: [s3Key] } }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!completeRes.ok) throw new Error('Failed to complete task')

      haptic.success()
      Toast.show({ type: 'success', text1: 'Document submitted' })
      router.back()
    } catch (err) {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Upload Failed',
        text2: err instanceof Error ? err.message : 'Please try again',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = selectedFile !== null && !isSubmitting

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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step name (large) */}
        <Text style={[styles.stepName, { color: c.textPrimary }]}>{stepSnapshot.name}</Text>

        {/* Instruction */}
        {stepSnapshot.description ? (
          <Text style={[styles.instruction, { color: c.textSecondary }]}>
            {stepSnapshot.description}
          </Text>
        ) : null}

        {/* Document type label */}
        <Text style={[styles.docTypeLabel, { color: c.textTertiary }]}>
          Document type: {docTypeName}
        </Text>

        {/* Upload area */}
        {!selectedFile ? (
          <View style={styles.uploadAreaRow}>
            <TouchableOpacity
              onPress={pickFromLibrary}
              style={[styles.uploadArea, { borderColor: c.brand, backgroundColor: c.surfaceCard }]}
              accessibilityLabel="Choose from library"
              accessibilityRole="button"
            >
              <Upload color={c.brand} size={32} />
              <Text style={[styles.uploadAreaText, { color: c.brand }]}>
                Choose from Library
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={pickFromCamera}
              style={[styles.uploadArea, { borderColor: c.border, backgroundColor: c.surfaceCard }]}
              accessibilityLabel="Take a photo"
              accessibilityRole="button"
            >
              <Camera color={c.textSecondary} size={32} />
              <Text style={[styles.uploadAreaText, { color: c.textSecondary }]}>
                Take a Photo
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.previewSection}>
            {/* Thumbnail preview */}
            <Image
              source={{ uri: selectedFile.uri }}
              style={styles.thumbnail}
              contentFit="cover"
            />
            <Text style={[styles.fileName, { color: c.textSecondary }]} numberOfLines={1}>
              {selectedFile.fileName ?? 'Selected file'}
            </Text>
            {/* Replace button */}
            <TouchableOpacity
              onPress={pickFromLibrary}
              style={[styles.replaceBtn, { borderColor: c.border }]}
              accessibilityLabel="Replace document"
              accessibilityRole="button"
            >
              <Text style={[styles.replaceBtnText, { color: c.textSecondary }]}>
                Replace
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Sticky Submit button */}
      <View
        style={[
          styles.footer,
          { borderTopColor: c.border, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[
            styles.submitBtn,
            { backgroundColor: c.brand },
            !canSubmit && styles.submitBtnDisabled,
          ]}
          accessibilityLabel="Submit document"
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Document</Text>
          )}
        </TouchableOpacity>
      </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
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
    gap: 12,
  },
  stepName: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  instruction: {
    fontSize: 15,
    lineHeight: 22,
  },
  docTypeLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  uploadAreaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  uploadArea: {
    flex: 1,
    height: 200,
    minHeight: 200,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  uploadAreaText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewSection: {
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  thumbnail: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#1e293b',
  },
  fileName: {
    fontSize: 13,
    maxWidth: '100%',
  },
  replaceBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
  },
  replaceBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submitBtn: {
    height: 56,
    minHeight: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
})
