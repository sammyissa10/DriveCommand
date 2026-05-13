/**
 * ReceiptCapture — Full-flow receipt photo capture for pay component attachments.
 *
 * Modes:
 *   'choose'    → Initial screen: "Take Photo" / "Choose from Library" / "Cancel"
 *   'camera'    → Launches native camera via ImagePicker.launchCameraAsync (RN 0.76 pattern)
 *   'preview'   → Full-screen preview with "Retake" / "Use" buttons
 *   'uploading' → Preview dimmed with ActivityIndicator + "Uploading receipt…" text
 *
 * Note: This component uses ImagePicker.launchCameraAsync for camera capture
 * (consistent with IncidentPhotoCapture, DocumentUploadSheet, and all other camera
 * uses in this codebase). Direct CameraView is not used as it introduces an
 * inconsistent pattern for a capture-and-submit flow.
 *
 * // USAGE:
 * // Wire into the driver "add reimbursement" flow (follow-up quick task):
 * //
 * //   const [showCapture, setShowCapture] = useState(false);
 * //
 * //   {showCapture && (
 * //     <Modal visible animationType="slide">
 * //       <ReceiptCapture
 * //         assignmentId={assignment.id}
 * //         componentId={component.id}
 * //         token={token}
 * //         onUploaded={(result) => {
 * //           setShowCapture(false);
 * //           // result: { id: string; filename: string }
 * //         }}
 * //         onCancel={() => setShowCapture(false)}
 * //       />
 * //     </Modal>
 * //   )}
 */

import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useThemeColors } from '../../constants/tokens'
import { haptic } from '../../lib/haptics'
import { uploadReceipt } from '../../lib/driver-pay/uploadReceipt'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReceiptCaptureProps {
  assignmentId: string
  componentId: string
  /** Bearer token for API auth */
  token: string
  onUploaded: (result: { id: string; filename: string }) => void
  onCancel: () => void
}

type Mode = 'choose' | 'camera' | 'preview' | 'uploading'

// ---------------------------------------------------------------------------
// ReceiptCapture
// ---------------------------------------------------------------------------

export function ReceiptCapture({
  assignmentId,
  componentId,
  token,
  onUploaded,
  onCancel,
}: ReceiptCaptureProps) {
  const c = useThemeColors()
  const [mode, setMode] = useState<Mode>('choose')
  const [capturedUri, setCapturedUri] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // Camera — launches native camera via ImagePicker (consistent with rest of codebase)
  // -------------------------------------------------------------------------
  async function handleTakePhoto() {
    haptic.medium()

    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(
        'Camera Access Required',
        'Please allow camera access in your device settings to take receipt photos.',
        [{ text: 'OK' }],
      )
      return
    }

    setMode('camera')
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    })

    if (result.canceled || !result.assets[0]) {
      // User cancelled native camera → back to choose
      setMode('choose')
      return
    }

    setCapturedUri(result.assets[0].uri)
    setMode('preview')
  }

  // -------------------------------------------------------------------------
  // Library
  // -------------------------------------------------------------------------
  async function handleChooseFromLibrary() {
    haptic.medium()

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) return

    setCapturedUri(result.assets[0].uri)
    setMode('preview')
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------
  async function handleUse() {
    if (!capturedUri) return
    haptic.medium()
    setMode('uploading')

    const filename = `receipt-${Date.now()}.jpg`
    const contentType = 'image/jpeg'

    try {
      const result = await uploadReceipt({
        assignmentId,
        componentId,
        uri: capturedUri,
        filename,
        contentType,
        token,
      })
      haptic.success()
      onUploaded(result)
    } catch (err) {
      setMode('preview')
      Alert.alert(
        'Upload Failed',
        'Something went wrong while saving the receipt. Try again in a moment.',
        [{ text: 'OK' }],
      )
    }
  }

  function handleRetake() {
    haptic.light()
    setCapturedUri(null)
    setMode('choose')
  }

  // -------------------------------------------------------------------------
  // Render: 'choose' mode
  // -------------------------------------------------------------------------
  if (mode === 'choose') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          padding: 24,
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <Text
          style={{
            color: c.textPrimary,
            fontSize: 22,
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          Add Receipt
        </Text>
        <Text
          style={{
            color: c.textSecondary,
            fontSize: 14,
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          Take a photo or choose from your library
        </Text>

        {/* Take Photo button — ≥44px touch target */}
        <Pressable
          onPress={handleTakePhoto}
          style={{
            backgroundColor: c.brand,
            borderRadius: 14,
            paddingVertical: 16,
            paddingHorizontal: 24,
            alignItems: 'center',
            minHeight: 54, // ≥44px touch target
          }}
          className="active:opacity-80"
        >
          <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>Take Photo</Text>
        </Pressable>

        {/* Choose from Library button — ≥44px touch target */}
        <Pressable
          onPress={handleChooseFromLibrary}
          style={{
            backgroundColor: c.surfaceElevated,
            borderRadius: 14,
            paddingVertical: 16,
            paddingHorizontal: 24,
            alignItems: 'center',
            minHeight: 54, // ≥44px touch target
            borderWidth: 1,
            borderColor: c.border,
          }}
          className="active:opacity-80"
        >
          <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 16 }}>
            Choose from Library
          </Text>
        </Pressable>

        {/* Cancel — ≥44px touch target */}
        <Pressable
          onPress={() => { haptic.light(); onCancel() }}
          style={{
            paddingVertical: 16,
            alignItems: 'center',
            minHeight: 54, // ≥44px touch target
          }}
          className="active:opacity-60"
        >
          <Text style={{ color: c.textSecondary, fontSize: 15 }}>Cancel</Text>
        </Pressable>
      </View>
    )
  }

  // -------------------------------------------------------------------------
  // Render: 'camera' mode (transitional — native camera is open; show loading)
  // -------------------------------------------------------------------------
  if (mode === 'camera') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <ActivityIndicator color={c.brand} size="large" />
        <Text style={{ color: c.textSecondary, fontSize: 14 }}>Opening camera…</Text>
      </View>
    )
  }

  // -------------------------------------------------------------------------
  // Render: 'preview' mode
  // -------------------------------------------------------------------------
  if (mode === 'preview' && capturedUri) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {/* Full-screen preview */}
        <Image
          source={{ uri: capturedUri }}
          contentFit="contain"
          style={{ flex: 1 }}
        />

        {/* Bottom action buttons */}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            padding: 20,
            paddingBottom: 36,
            backgroundColor: 'rgba(0,0,0,0.7)',
          }}
        >
          {/* Retake — ≥44px touch target */}
          <Pressable
            onPress={handleRetake}
            style={{
              flex: 1,
              backgroundColor: c.surfaceCard,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              minHeight: 54, // ≥44px touch target
              borderWidth: 1,
              borderColor: c.border,
            }}
            className="active:opacity-80"
          >
            <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 16 }}>Retake</Text>
          </Pressable>

          {/* Use — ≥44px touch target */}
          <Pressable
            onPress={handleUse}
            style={{
              flex: 1,
              backgroundColor: c.brand,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              minHeight: 54, // ≥44px touch target
            }}
            className="active:opacity-80"
          >
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>Use</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // -------------------------------------------------------------------------
  // Render: 'uploading' mode
  // -------------------------------------------------------------------------
  if (mode === 'uploading' && capturedUri) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {/* Dimmed preview */}
        <Image
          source={{ uri: capturedUri }}
          contentFit="contain"
          style={{ flex: 1, opacity: 0.4 }}
        />

        {/* Centered overlay */}
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <ActivityIndicator color="#ffffff" size="large" />
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>
            Uploading receipt…
          </Text>
        </View>
      </View>
    )
  }

  // Fallback (should not reach)
  return null
}
