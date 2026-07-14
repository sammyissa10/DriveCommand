/**
 * Type shim for lucide-react-native.
 *
 * In this install `LucideProps extends SvgProps` from react-native-svg, but the
 * resolved `SvgProps` comes through nearly empty — so lucide icons are missing
 * the standard visual props (`color`, `strokeWidth`, `style`, …) as well as
 * NativeWind's `className`. Every one of these is valid at runtime (color/stroke
 * forward to the SVG; className is wired through NativeWind's cssInterop). This
 * augmentation restores the missing prop types, clearing the app-wide
 * icon-typing baseline without changing any component.
 */
import 'lucide-react-native'
import type { StyleProp, ViewStyle } from 'react-native'

declare module 'lucide-react-native' {
  interface LucideProps {
    color?: string
    className?: string
    strokeWidth?: string | number
    fill?: string
    stroke?: string
    opacity?: string | number
    style?: StyleProp<ViewStyle>
    testID?: string
    accessibilityLabel?: string
  }
}
