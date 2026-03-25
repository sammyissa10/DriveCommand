import { View, Text } from 'react-native'
import Svg, { Path } from 'react-native-svg'

interface DCChevronIconProps {
  size?: number
  variant?: 'dark' | 'light'
}

/**
 * DCChevronIcon — React Native port of the web SVG mark.
 *
 * Bold D (navy) + bold C (electric blue) facing each other.
 * The negative space between their curved edges forms a right-pointing chevron.
 * 'light' variant uses white for both letters (for dark backgrounds).
 */
export function DCChevronIcon({ size = 32, variant = 'light' }: DCChevronIconProps) {
  const dColor = variant === 'light' ? '#FFFFFF' : '#1E3A5F'
  const cColor = variant === 'light' ? '#FFFFFF' : '#2563EB'

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
    >
      {/* Letter D — left side */}
      <Path
        d="M4 5h7c4.97 0 8 3.13 8 8v6c0 4.87-3.03 8-8 8H4V5zm4 4v14h3c2.76 0 4-1.62 4-4v-6c0-2.38-1.24-4-4-4H8z"
        fill={dColor}
      />
      {/* Letter C — right side */}
      <Path
        d="M28 10.5c-1.1-.97-2.56-1.5-4-1.5-3.31 0-5 2.24-5 5v4c0 2.76 1.69 5 5 5 1.44 0 2.9-.53 4-1.5v4.5c-1.2.67-2.56 1-4 1-5.52 0-9-3.58-9-9v-4c0-5.42 3.48-9 9-9 1.44 0 2.8.33 4 1v4.5z"
        fill={cColor}
      />
    </Svg>
  )
}

interface DCLogoProps {
  iconSize?: number
  variant?: 'dark' | 'light'
  /** Show "DriveCommand" wordmark next to the icon */
  showWordmark?: boolean
  wordmarkColor?: string
}

/**
 * DCLogo — icon + optional wordmark, matching the web AppLogo.
 * Defaults to 'light' variant (white letters) for dark backgrounds.
 */
export function DCLogo({
  iconSize = 36,
  variant = 'light',
  showWordmark = false,
  wordmarkColor,
}: DCLogoProps) {
  const textColor = wordmarkColor ?? (variant === 'light' ? '#ffffff' : '#0f172a')

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <DCChevronIcon size={iconSize} variant={variant} />
      {showWordmark && (
        <Text
          style={{
            color: textColor,
            fontSize: iconSize * 0.5,
            fontWeight: '600',
            letterSpacing: -0.5,
          }}
        >
          <Text style={{ fontWeight: '800' }}>D</Text>
          {'riveCommand'}
        </Text>
      )}
    </View>
  )
}
