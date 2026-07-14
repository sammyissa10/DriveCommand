import React from 'react'
import { View, Modal, KeyboardAvoidingView, Platform, Pressable as RNPressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from './Text'
import { Pressable } from './Pressable'

export interface SheetContainerProps {
  visible: boolean
  onCancel: () => void
  title: string
  /** One-line purpose subtitle that sets expectations. */
  subtitle?: string
  /** Cancel label — defaults to "Cancel". */
  cancelLabel?: string
  children: React.ReactNode
}

/**
 * Bottom sheet for Quick Create: dimmed 45% backdrop, `ds.sheet` fill, top
 * radius 24, 36×5 grabber, Cancel top-left, centered title, one-line subtitle.
 * The single PrimaryButton lives in `children`. No FAB anywhere in the app.
 */
export function SheetContainer({
  visible,
  onCancel,
  title,
  subtitle,
  cancelLabel = 'Cancel',
  children,
}: SheetContainerProps) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View className="flex-1 justify-end">
        {/* Dimmed backdrop — tap to dismiss */}
        <RNPressable
          className="absolute inset-0 bg-black/45"
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            className="rounded-t-[24px] bg-ds-sheet px-5 pt-2.5"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            {/* Grabber */}
            <View className="mb-2 h-[5px] w-9 self-center rounded-full bg-ds-txt3" />

            {/* Header: Cancel left, centered title */}
            <View className="h-11 flex-row items-center justify-between">
              <View className="min-w-[64px] items-start">
                <Pressable
                  onPress={onCancel}
                  haptic="none"
                  accessibilityRole="button"
                  accessibilityLabel={cancelLabel}
                  hitSlop={10}
                  className="min-h-[44px] justify-center"
                >
                  <Text variant="rowTitle" className="font-normal text-ds-accent">
                    {cancelLabel}
                  </Text>
                </Pressable>
              </View>
              <Text variant="rowTitle" numberOfLines={1} className="flex-1 text-center">
                {title}
              </Text>
              <View className="min-w-[64px]" />
            </View>

            {subtitle ? (
              <Text variant="caption" className="pb-4 text-center">
                {subtitle}
              </Text>
            ) : (
              <View className="pb-2" />
            )}

            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}
