import React from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
} from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated'
import { colors, radii, spacing, typography } from '../../constants/tokens'

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  snapPoint?: '40%' | '60%' | '80%' | 'full'
}

const snapPointValues: Record<string, number> = {
  '40%': 0.4,
  '60%': 0.6,
  '80%': 0.8,
  full: 1,
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  snapPoint = '60%',
}: BottomSheetProps) {
  const snapFraction = snapPointValues[snapPoint]

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        {/* Backdrop with fade */}
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        {/* Sheet with spring slide-up */}
        <Animated.View
          entering={SlideInDown.springify().damping(32).stiffness(200)}
          exiting={SlideOutDown.duration(200)}
          style={{
            height: snapFraction === 1 ? '100%' : `${Math.round(snapFraction * 100)}%` as any,
            backgroundColor: colors.surfaceCard,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Handle */}
          <Animated.View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
            <Animated.View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.textMuted,
              }}
            />
          </Animated.View>

          {/* Header */}
          {title && (
            <Animated.View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: spacing.lg,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Poppins-SemiBold',
                  color: colors.textPrimary,
                  ...typography.title3,
                }}
              >
                {title}
              </Text>
              <Pressable onPress={onClose} style={{ padding: 4 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 16 }}>✕</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Content */}
          <Animated.View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
            {children}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
