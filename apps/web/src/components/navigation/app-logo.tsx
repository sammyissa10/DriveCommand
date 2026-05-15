interface DCChevronIconProps {
  size?: number
  className?: string
  variant?: "dark" | "light"
}

/**
 * DCChevronIcon — 3D isometric DriveCommand mark.
 *
 * A modern 3D chevron/arrow logo. The 'dark' variant uses navy (#050A44) for the
 * main shape with silver (#B3B4BD) accent for depth. The 'light' variant is all
 * light gray (#F5F5F7) for dark backgrounds. Scales cleanly via viewBox.
 */
export function DCChevronIcon({
  size = 32,
  className,
  variant = "dark",
}: DCChevronIconProps) {
  // Color scheme based on variant
  const mainColor = variant === "light" ? "#F5F5F7" : "#050A44"
  const accentColor = variant === "light" ? "#F5F5F7" : "#B3B4BD"

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 500 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className ?? ""}`}
      aria-label="DriveCommand"
    >
      {/* Main chevron body - navy/light */}
      <path
        d="M 289.529 264.844 L 263.365 250.409 L 246.365 240.409 L 224.365 228.409 L 216.365 223.409 L 215.365 316.409 L 220.365 318.409 L 244.365 331.409 L 295.077 357.314 L 295.619 447.296 L 218.366 408.409 L 193.366 394.409 L 169.366 380.409 L 142.366 365.409 L 138.366 362.409 L 138.366 182.409 L 161.366 169.409 L 176.366 160.409 L 205.366 143.409 L 214.366 138.409 L 218.366 139.409 L 237.366 149.409 L 260.366 162.409 L 289.232 178.335 L 289.887 265.041 L 289.529 264.844 Z"
        fill={mainColor}
      />
      {/* Connector segment */}
      <path
        d="M 292.365 266.409 L 289.887 265.041 L 289.232 178.335 L 289.366 178.409 L 293.911 180.682 L 296.33 181.872 L 297.433 267.407 L 292.365 266.409 Z"
        fill={mainColor}
      />
      {/* 3D depth accent - bottom right */}
      <path
        d="M 297.365 354.409 L 297.365 274.247 L 371.4 241.665 L 372.335 413.906 L 298.363 446.186 L 297.365 354.409 Z"
        fill={accentColor}
      />
      {/* 3D depth accent - top right */}
      <path
        d="M 296.314 175.569 L 296.314 95.407 L 370.349 62.825 L 371.284 235.066 L 297.312 267.346 L 296.314 175.569 Z"
        fill={accentColor}
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
