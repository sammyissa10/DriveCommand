import React, { useCallback, useRef, useState } from 'react'
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { captureRef } from 'react-native-view-shot'
import { useThemeColors } from '../../../constants/tokens'
import { haptic } from '../../../lib/haptics'
import { putToPresignedUrl, requestPresignedUpload } from '../../../lib/upload'

// ---------------------------------------------------------------------------
// SignaturePad — the ONE signature capture in this app.
//
// Lifted verbatim out of `SignatureScreen.tsx` (PanResponder → SVG Path →
// captureRef → presigned PUT) so the trip inspection's final screen and the
// task-list signature step share one implementation rather than diverging.
//
// One behaviour deliberately changed on the way out, and it is the reason this
// extraction happened now. The original had this, and said so:
//
//     // NOTE: this path has always ignored the PUT result and set s3Key
//     // regardless, so a failed upload completes the step with a key whose
//     // object was never written. Behaviour preserved deliberately — fixing
//     // it changes driver signature submission, which is Phase 9's flow.
//     try { await putToPresignedUrl(uploadUrl, blob, 'application/json') }
//     catch { /* swallowed, as before */ }
//     s3Key = key
//
// A signed DVIR whose signature object was never written is precisely the
// artifact a roadside inspection asks for. `uploadSignature` now returns a key
// ONLY when bytes actually landed, and every failure carries its name and
// message instead of a bare comment.
// ---------------------------------------------------------------------------

const CANVAS_HEIGHT = 220

interface Point {
  x: number
  y: number
}

function buildPath(points: Point[]): string {
  if (points.length < 2) return ''
  const [first, ...rest] = points
  const d = [`M${first.x.toFixed(1)},${first.y.toFixed(1)}`]
  for (const p of rest) d.push(`L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  return d.join(' ')
}

/** What went wrong, in a sentence a driver can act on. */
export class SignatureUploadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'SignatureUploadError'
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

/**
 * Capture the pad as a PNG and upload it. Resolves with the s3Key, or THROWS.
 *
 * Two attempts, in order: the rendered PNG, then the raw stroke data as JSON if
 * the device could not rasterise the view. Both go through the shared presigned
 * PUT, and a failure of the second is a failure of the call — not a shrug and a
 * key pointing at nothing.
 */
export async function uploadSignature(args: {
  viewRef: React.RefObject<View | null>
  strokes: Point[][]
  token: string
  fileBaseName: string
  /** Which mobile endpoint issues the grant. */
  presignEndpoint: string
}): Promise<{ s3Key: string; format: 'png' | 'strokes' }> {
  const { viewRef, strokes, token, fileBaseName, presignEndpoint } = args

  let pngError: unknown = null
  if (viewRef.current) {
    try {
      const imageUri = await captureRef(viewRef as React.RefObject<View>, {
        format: 'png',
        quality: 0.9,
      })
      const grant = await requestPresignedUpload(presignEndpoint, token, {
        fileName: `${fileBaseName}.png`,
        contentType: 'image/png',
      })
      const imageBlob = await fetch(imageUri).then((r) => r.blob())
      await putToPresignedUrl(grant.uploadUrl, imageBlob, 'image/png')
      return { s3Key: grant.s3Key, format: 'png' }
    } catch (err) {
      // Kept, not discarded — if the JSON fallback also fails, the driver is
      // told what actually happened first.
      pngError = err
    }
  }

  try {
    const grant = await requestPresignedUpload(presignEndpoint, token, {
      fileName: `${fileBaseName}.json`,
      contentType: 'application/json',
    })
    const blob = new Blob([JSON.stringify({ strokes })], { type: 'application/json' })
    await putToPresignedUrl(grant.uploadUrl, blob, 'application/json')
    return { s3Key: grant.s3Key, format: 'strokes' }
  } catch (err) {
    throw new SignatureUploadError(
      pngError
        ? `Signature upload failed (${describe(pngError)}; fallback ${describe(err)})`
        : `Signature upload failed (${describe(err)})`,
      err
    )
  }
}

interface SignaturePadProps {
  /** Printed beneath the pad, per item 2. */
  driverName: string | null
  /** Printed beneath the pad. Pass a stable value so it does not tick. */
  signedAt: Date
  onChange: (hasSignature: boolean) => void
  /** Handed back so the caller can capture it. */
  padRef: React.RefObject<View | null>
  strokesRef: React.MutableRefObject<Point[][]>
}

export function SignaturePad({
  driverName,
  signedAt,
  onChange,
  padRef,
  strokesRef,
}: SignaturePadProps) {
  const c = useThemeColors()
  const [strokes, setStrokes] = useState<Point[][]>([])
  const [currentStroke, setCurrentStroke] = useState<Point[]>([])
  const canvasOffsetRef = useRef({ x: 0, y: 0 })
  const currentStrokeRef = useRef<Point[]>([])

  const hasSignature = strokes.length > 0 || currentStroke.length > 0

  const measureCanvas = useCallback(() => {
    padRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      canvasOffsetRef.current = { x: pageX, y: pageY }
    })
  }, [padRef])

  const toPoint = useCallback((pageX: number, pageY: number): Point => {
    return {
      x: pageX - canvasOffsetRef.current.x,
      y: pageY - canvasOffsetRef.current.y,
    }
  }, [])

  // PanResponder is created once. `currentStrokeRef` mirrors the state because
  // the original read `currentStroke` out of a closure captured at creation —
  // which is why its release handler could commit a stale stroke.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const p = toPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY)
        currentStrokeRef.current = [p]
        setCurrentStroke([p])
      },
      onPanResponderMove: (evt) => {
        const p = toPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY)
        currentStrokeRef.current = [...currentStrokeRef.current, p]
        setCurrentStroke(currentStrokeRef.current)
      },
      onPanResponderRelease: () => {
        const finished = currentStrokeRef.current
        currentStrokeRef.current = []
        setCurrentStroke([])
        if (finished.length > 0) {
          setStrokes((prev) => {
            const next = [...prev, finished]
            strokesRef.current = next
            onChange(true)
            return next
          })
        }
      },
    })
  ).current

  function handleClear() {
    haptic.light()
    setStrokes([])
    setCurrentStroke([])
    currentStrokeRef.current = []
    strokesRef.current = []
    onChange(false)
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: c.textSecondary }]}>Sign below</Text>
        <TouchableOpacity
          onPress={handleClear}
          disabled={!hasSignature}
          style={styles.clearBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Clear signature"
          accessibilityRole="button"
        >
          <Text style={[styles.clearText, { color: hasSignature ? c.brand : c.textMuted }]}>
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      <View
        ref={padRef}
        style={[styles.canvas, { borderColor: c.border, backgroundColor: c.surfaceCard }]}
        onLayout={measureCanvas}
        {...panResponder.panHandlers}
      >
        <Svg style={StyleSheet.absoluteFill} width="100%" height={CANVAS_HEIGHT}>
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

        {!hasSignature && (
          <View style={styles.hint} pointerEvents="none">
            <Text style={[styles.hintText, { color: c.textMuted }]}>Sign here</Text>
          </View>
        )}
      </View>

      {/* Item 2: driver name and timestamp printed beneath the signature.
          `flexShrink: 1` before `numberOfLines` — RN defaults flexShrink to 0,
          unlike web, so a long name would size the row to its full width and
          push the card past 360pt instead of ellipsising (quick-519, mobile
          half). Shrink first, then ellipsise. */}
      <View style={styles.attribution}>
        <Text
          style={[styles.attributionName, { color: c.textPrimary }]}
          numberOfLines={1}
        >
          {driverName ?? 'Driver'}
        </Text>
        <Text style={[styles.attributionTime, { color: c.textSecondary }]} numberOfLines={1}>
          {signedAt.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontSize: 15, fontWeight: '500', flexShrink: 1 },
  clearBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  clearText: { fontSize: 16, fontWeight: '600' },
  canvas: {
    height: CANVAS_HEIGHT,
    minHeight: CANVAS_HEIGHT,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  hint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: { fontSize: 16, fontStyle: 'italic' },
  attribution: { gap: 2, paddingTop: 4 },
  attributionName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  attributionTime: { fontSize: 13, flexShrink: 1 },
})

export type { Point as SignaturePoint }
