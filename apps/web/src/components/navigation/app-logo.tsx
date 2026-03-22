interface DCChevronIconProps {
  size?: number
  className?: string
  variant?: "dark" | "light"
}

/**
 * DCChevronIcon — inline SVG mark for DriveCommand.
 *
 * Two letterforms: a bold D on the left (navy) and a bold C on the right (electric blue).
 * They face each other so the negative space between their curved edges forms a
 * right-pointing chevron. For the 'light' variant both letters are white (for dark
 * backgrounds). Scales cleanly via viewBox="0 0 32 32".
 */
export function DCChevronIcon({
  size = 32,
  className,
  variant = "dark",
}: DCChevronIconProps) {
  const dColor = variant === "light" ? "#FFFFFF" : "#1E3A5F"
  const cColor = variant === "light" ? "#FFFFFF" : "#2563EB"

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className ?? ""}`}
      aria-label="DriveCommand"
    >
      {/* Letter D — left side. Vertical left stroke + curved right edge. */}
      <path
        d="M4 5h7c4.97 0 8 3.13 8 8v6c0 4.87-3.03 8-8 8H4V5zm4 4v14h3c2.76 0 4-1.62 4-4v-6c0-2.38-1.24-4-4-4H8z"
        fill={dColor}
      />
      {/* Letter C — right side. Open curved letterform facing left. */}
      <path
        d="M28 10.5c-1.1-.97-2.56-1.5-4-1.5-3.31 0-5 2.24-5 5v4c0 2.76 1.69 5 5 5 1.44 0 2.9-.53 4-1.5v4.5c-1.2.67-2.56 1-4 1-5.52 0-9-3.58-9-9v-4c0-5.42 3.48-9 9-9 1.44 0 2.8.33 4 1v4.5z"
        fill={cColor}
      />
    </svg>
  )
}

interface DriveCommandWordmarkProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

const wordmarkSizeMap = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
}

/**
 * DriveCommandWordmark — typographic logo.
 *
 * The leading "D" is ExtraBold (Poppins 800) — the Forward D concept.
 * "riveCommand" is SemiBold (Poppins 600). Color is inherited from parent.
 */
export function DriveCommandWordmark({
  className,
  size = "md",
}: DriveCommandWordmarkProps) {
  const sizeClass = wordmarkSizeMap[size]
  return (
    <span
      className={`font-[family-name:var(--font-poppins)] ${sizeClass} leading-none tracking-tight ${className ?? ""}`}
    >
      <span className="font-extrabold">D</span>
      <span className="font-semibold">riveCommand</span>
    </span>
  )
}

interface AppLogoProps {
  size?: number
  className?: string
  variant?: "dark" | "light"
  showWordmark?: boolean
  wordmarkSize?: "sm" | "md" | "lg"
}

/**
 * AppLogo — composite component combining icon + optional wordmark.
 * Backward-compatible: when showWordmark=false it renders the icon only.
 */
export function AppLogo({
  size = 40,
  className,
  variant = "dark",
  showWordmark = false,
  wordmarkSize = "md",
}: AppLogoProps) {
  if (showWordmark) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ""}`}>
        <DCChevronIcon size={size} variant={variant} />
        <DriveCommandWordmark size={wordmarkSize} />
      </div>
    )
  }

  return (
    <DCChevronIcon size={size} variant={variant} className={className} />
  )
}
