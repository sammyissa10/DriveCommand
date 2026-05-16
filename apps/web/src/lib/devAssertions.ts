/**
 * Development-only contrast assertions
 *
 * Use these utilities to verify WCAG AA contrast compliance at runtime.
 * Only runs in development mode — no-op in production.
 *
 * RULE: Foreground tokens must always be a distinct tier from their surface token.
 * Run `pnpm contrast-check` before merging.
 */

/**
 * Convert HSL string to RGB values
 * Handles formats: "220 25% 14%" or "220 25% 14% / 0.6"
 */
function hslToRgb(hsl: string): [number, number, number] {
  // Parse HSL values (handle optional alpha)
  const parts = hsl.split("/")[0].trim().split(/\s+/)
  const h = parseFloat(parts[0]) / 360
  const s = parseFloat(parts[1]) / 100
  const l = parseFloat(parts[2]) / 100

  if (s === 0) {
    const gray = Math.round(l * 255)
    return [gray, gray, gray]
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = hue2rgb(p, q, h + 1 / 3)
  const g = hue2rgb(p, q, h)
  const b = hue2rgb(p, q, h - 1 / 3)

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/**
 * Calculate relative luminance per WCAG 2.1
 */
function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const sRGB = c / 255
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Calculate contrast ratio between two colors
 * Returns ratio like 4.5 or 7.0
 */
function contrastRatio(fg: string, bg: string): number {
  const fgLum = relativeLuminance(hslToRgb(fg))
  const bgLum = relativeLuminance(hslToRgb(bg))
  const lighter = Math.max(fgLum, bgLum)
  const darker = Math.min(fgLum, bgLum)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Assert that foreground and background have sufficient contrast
 *
 * @param fg - Foreground HSL value (e.g., "0 0% 98%")
 * @param bg - Background HSL value (e.g., "228 25% 14%")
 * @param label - Human-readable label for the element
 * @param minRatio - Minimum contrast ratio (default 4.5 for AA text)
 */
export function assertContrast(
  fg: string,
  bg: string,
  label: string,
  minRatio: number = 4.5
): void {
  // Only run in development
  if (process.env.NODE_ENV !== "development") return

  try {
    const ratio = contrastRatio(fg, bg)
    if (ratio < minRatio) {
      console.warn(
        `[Contrast Warning] ${label}: ratio ${ratio.toFixed(2)}:1 is below ${minRatio}:1 minimum\n` +
        `  Foreground: hsl(${fg})\n` +
        `  Background: hsl(${bg})\n` +
        `  Fix: Use a foreground from a different tier than the background.`
      )
    }
  } catch (error) {
    // Silently ignore parsing errors in development
    if (process.env.NODE_ENV === "development") {
      console.debug(`[Contrast Check] Could not parse colors for ${label}:`, error)
    }
  }
}

/**
 * Hook to run contrast assertion on mount (client-side only)
 *
 * Usage:
 * ```tsx
 * useContrastCheck("0 0% 98%", "228 25% 14%", "SidebarItem active text")
 * ```
 */
export function useContrastCheck(
  fg: string,
  bg: string,
  label: string,
  minRatio: number = 4.5
): void {
  // Only run in development and on client
  if (process.env.NODE_ENV !== "development") return
  if (typeof window === "undefined") return

  // Run once on mount equivalent
  assertContrast(fg, bg, label, minRatio)
}
