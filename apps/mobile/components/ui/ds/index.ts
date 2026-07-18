/**
 * DriveCommand Mobile Design System — shared kit.
 *
 * Apple-language (iOS Health / Wallet / Things 3, dark) primitives. NativeWind
 * only: no StyleSheet, no hex literals — every color is a `ds.*` token from
 * tailwind.config.js. Import from `@/components/ui/ds`.
 *
 * Contract: .planning/mobile-design-system.md
 */

// Tokens & primitives
export * from './tokens'
export { dsColors, type DSColorKey } from './colors'
export { Icon, type IconProps } from './Icon'
export { Pressable, type PressableProps } from './Pressable'
export { Text, type DSTextProps, type TextVariant } from './Text'

// Layout & headers
export { Screen, type ScreenProps } from './Screen'
export {
  LargeTitleHeader,
  NavHeader,
  AddButton,
  HeaderTextButton,
  type LargeTitleHeaderProps,
  type NavHeaderProps,
} from './Header'
export { SectionHeader, type SectionHeaderProps } from './SectionHeader'

// Overview building blocks
export { SearchField, type SearchFieldProps } from './SearchField'
export { SegmentedControl, type SegmentedControlProps, type SegmentOption } from './SegmentedControl'
export { KPICard, KPIRow, type KPICardProps, type KPIRowProps } from './KPICard'
export { EntityRow, type EntityRowProps, type MetaTone } from './EntityRow'

// Identity & status
export { MonogramAvatar, type MonogramAvatarProps } from './MonogramAvatar'
export { UnitChip, type UnitChipProps } from './UnitChip'
export { StatusPill, type StatusPillProps, type StatusTone } from './StatusPill'
export { VIPTag } from './VIPTag'

// Detail & forms
export { FieldGroup, type FieldGroupProps, type FieldDef } from './FieldGroup'
export { ParentStrip, type ParentStripProps, type ParentChip } from './ParentStrip'
export { ContactActionsRow, type ContactActionsRowProps } from './ContactActionsRow'

// Sheets & inputs
export { SheetContainer, type SheetContainerProps } from './SheetContainer'
export { SheetInput, type SheetInputProps } from './SheetInput'
export { PrimaryButton, type PrimaryButtonProps } from './PrimaryButton'

// States
export { EmptyState, type EmptyStateProps } from './EmptyState'
export { Skeleton, EntityRowSkeleton, EntityListSkeleton, type SkeletonProps } from './Skeleton'
