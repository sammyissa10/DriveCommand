import React, { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { captureRef } from 'react-native-view-shot'
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
const CANVAS_HEIGHT = 220

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignatureScreenProps {
  stepInstance: StepInstance
}

interface Point {
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Helpers — build SVG path from a stroke
// ---------------------------------------------------------------------------

function buildPath(points: Point[]): string {
  if (points.length < 2) return ''
  const [first, ...rest] = points
  const d = [`M${first.x.toFixed(1)},${first.y.toFixed(1)}`]
  for (const p of rest) {
    d.push(`L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  }
  return d.join(' ')
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function SignatureScreen({ stepInstance }: SignatureScreenProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [strokes, setStrokes] = useState<Point[][]>([])
  const [currentStroke, setCurrentStroke] = useState<Point[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const canvasRef = useRef<View>(null)
  const canvasOffsetRef = useRef({ x: 0, y: 0 })

  const stepSnapshot = stepInstance.stepSnapshot
  const instruction = stepSnapshot.description ?? 'Sign in the box below'
  const hasSignature = strokes.length > 0 || currentStroke.length > 0

  // Measure canvas position for accurate point mapping
  const measureCanvas = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.measure((_x, _y, _w, _h, pageX, pageY) => {
        canvasOffsetRef.current = { x: pageX, y: pageY }
      })
    }
  }, [])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent
        const point: Point = {
          x: pageX - canvasOffsetRef.current.x,
          y: pageY - canvasOffsetRef.current.y,
        }
        setCurrentStroke([point])
      },
      onPanResponderMove: (evt) => {
        const { pageX, pageY } = evt.nativeEvent
        const point: Point = {
          x: pageX - canvasOffsetRef.current.x,
          y: pageY - canvasOffsetRef.current.y,
        }
        setCurrentStroke((prev) => [...prev, point])
      },
      onPanResponderRelease: () => {
        setStrokes((prev) => {
          const next = currentStroke.length > 0 ? [...prev, currentStroke] : prev
          return next
        })
        setCurrentStroke([])
      },
    })
  ).current

  function handleClear() {
    haptic.light()
    setStrokes([])
    setCurrentStroke([])
  }

  async function handleSubmit() {
    if (!hasSignature || !token) return
    setIsSubmitting(true)
    haptic.medium()

    try {
      let s3Key: string | null = null

      // Try to capture SVG canvas as PNG
      if (canvasRef.current) {
        try {
          const imageUri = await captureRef(canvasRef, {
            format: 'png',
            quality: 0.9,
          })

          // Upload PNG to S3
          const presignedRes = await fetch(
            `${API_BASE_URL}/api/mobile/driver/documents/upload-url`,
            {
              method: 'POST',
              body: JSON.stringify({
                fileName: `signature-${stepInstance.id}.png`,
                contentType: 'image/png',
              }),
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          )
          if (presignedRes.ok) {
            const { uploadUrl, s3Key: key } = await presignedRes.json() as { uploadUrl: string; s3Key: string }
            const imageBlob = await fetch(imageUri).then((r) => r.blob())
            const uploadRes = await fetch(uploadUrl, {
              method: 'PUT',
              body: imageBlob,
              headers: { 'Content-Type': 'image/png' },
            })
            if (uploadRes.ok) {
              s3Key = key
            }
          }
        } catch {
          // Fallback to path data if capture fails
        }
      }

      // Fallback: upload SVG path data as JSON if image upload failed
      if (!s3Key) {
        const pathData = JSON.stringify({ strokes })
        const presignedRes = await fetch(
          `${API_BASE_URL}/api/mobile/driver/documents/upload-url`,
          {
            method: 'POST',
            body: JSON.stringify({
              fileName: `signature-${stepInstance.id}.json`,
              contentType: 'application/json',
            }),
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        )
        if (presignedRes.ok) {
          const { uploadUrl, s3Key: key } = await presignedRes.json() as { uploadUrl: string; s3Key: string }
          const blob = new Blob([pathData], { type: 'application/json' })
          await fetch(uploadUrl, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': 'application/json' },
          })
          s3Key = key
        }
      }

      // Complete the step
      const completeRes = await fetch(
        `${API_BASE_URL}/api/mobile/driver/tasks/${stepInstance.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({ result: { signatureUrl: s3Key } }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!completeRes.ok) throw new Error('Failed to complete task')

      haptic.success()
      Toast.show({ type: 'success', text1: 'Signature submitted' })
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
        <TouchableOpacity
          onPress={handleClear}
          style={styles.clearBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Clear signature"
          accessibilityRole="button"
        >
          <Text style={[styles.clearBtnText, { color: c.brand }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Instruction */}
      <View style={styles.instructionContainer}>
        <Text style={[styles.stepName, { color: c.textPrimary }]}>{stepSnapshot.name}</Text>
        <Text style={[styles.instruction, { color: c.textSecondary }]}>{instruction}</Text>
      </View>

      {/* Signature canvas */}
      <View style={styles.canvasWrapper}>
        <View
          ref={canvasRef}
          style={[styles.canvas, { borderColor: c.border, backgroundColor: c.surfaceCard }]}
          onLayout={measureCanvas}
          {...panResponder.panHandlers}
        >
          <Svg
            style={StyleSheet.absoluteFill}
            width="100%"
            height={CANVAS_HEIGHT}
          >
            {/* Completed strokes */}
            {strokes.map((stroke, index) => {
              const d = buildPath(stroke)
              return d ? (
                <Path
                  key={index}
                  d={d}
                  stroke={c.textPrimary}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ) : null
            })}
            {/* Current stroke */}
            {currentStroke.length > 1 && (
              <Path
                d={buildPath(currentStroke)}
                stroke={c.textPrimary}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
          </Svg>

          {/* Hint text when empty */}
          {!hasSignature && (
            <View style={styles.canvasHint} pointerEvents="none">
              <Text style={[styles.canvasHintText, { color: c.textMuted }]}>
                Sign here
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Submit button */}
      <View
        style={[
          styles.footer,
          { borderTopColor: c.border, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!hasSignature || isSubmitting}
          style={[
            styles.submitBtn,
            { backgroundColor: c.brand },
            (!hasSignature || isSubmitting) && styles.submitBtnDisabled,
          ]}
          accessibilityLabel="I confirm and sign"
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>I confirm and sign</Text>
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
    marginHorizontal: 8,
  },
  clearBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  clearBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  instructionContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 8,
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
  canvasWrapper: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  canvas: {
    height: CANVAS_HEIGHT,
    minHeight: CANVAS_HEIGHT,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  canvasHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasHintText: {
    fontSize: 16,
    fontStyle: 'italic',
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
