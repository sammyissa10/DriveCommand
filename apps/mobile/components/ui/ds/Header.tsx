import React from 'react'
import { View } from 'react-native'
import { Plus, ChevronLeft } from 'lucide-react-native'
import { Text } from './Text'
import { Icon } from './Icon'
import { Pressable } from './Pressable'
import { icon, size } from './tokens'

/** Top-right tinted circle that opens Quick Create. Never a FAB. */
export function AddButton({
  onPress,
  accessibilityLabel,
}: {
  onPress: () => void
  accessibilityLabel: string
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={size.touchMin - size.addButton}
      className="h-8 w-8 items-center justify-center rounded-full bg-ds-accent/[0.16]"
    >
      <Icon icon={Plus} size={icon.md} className="text-ds-accent" />
    </Pressable>
  )
}

/** A tappable text action for nav bars (Edit / Cancel / Save). */
export function HeaderTextButton({
  label,
  onPress,
  emphasized = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  /** Save-style: accent semibold. */
  emphasized?: boolean
  disabled?: boolean
  accessibilityLabel?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={12}
      className="min-h-[48px] justify-center"
    >
      <Text
        variant="rowTitle"
        className={
          emphasized
            ? `font-semibold text-ds-accent ${disabled ? 'opacity-35' : ''}`
            : `font-normal text-ds-accent ${disabled ? 'opacity-35' : ''}`
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

export interface LargeTitleHeaderProps {
  title: string
  /** Live count subtitle, e.g. "24 clients". */
  subtitle?: string
  onAdd?: () => void
  addLabel?: string
}

/**
 * Overview header: large title + live count, add button top-right.
 * Screens that want the collapse-to-nav-title behaviour animate this block
 * themselves; the header renders the expanded state.
 */
export function LargeTitleHeader({ title, subtitle, onAdd, addLabel }: LargeTitleHeaderProps) {
  return (
    <View className="flex-row items-start justify-between pb-4 pt-2">
      <View className="flex-1 pr-3">
        <Text variant="largeTitle">{title}</Text>
        {subtitle ? (
          <Text variant="caption" className="mt-1">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onAdd ? (
        <AddButton onPress={onAdd} accessibilityLabel={addLabel ?? `Add ${title}`} />
      ) : null}
    </View>
  )
}

export interface NavHeaderProps {
  title: string
  onBack?: () => void
  /** Right-side action node — usually a HeaderTextButton. */
  right?: React.ReactNode
  /** Left-side override (e.g. a Cancel button in edit mode). Replaces back chevron. */
  left?: React.ReactNode
}

/** Detail-page nav bar: back chevron, centered title, optional right action. */
export function NavHeader({ title, onBack, right, left }: NavHeaderProps) {
  return (
    <View className="h-12 flex-row items-center justify-between">
      <View className="min-w-[64px] items-start">
        {left ??
          (onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              className="h-12 w-12 items-center justify-center -ml-2"
            >
              <Icon icon={ChevronLeft} size={icon.lg} className="text-ds-accent" />
            </Pressable>
          ) : null)}
      </View>
      <Text variant="rowTitle" numberOfLines={1} className="flex-1 text-center">
        {title}
      </Text>
      <View className="min-w-[64px] items-end">{right}</View>
    </View>
  )
}
