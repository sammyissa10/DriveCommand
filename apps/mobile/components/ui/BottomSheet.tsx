import React, { useEffect } from 'react'
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
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  snapPoint?: '40%' | '60%' | '80%' | 'full'
}

const snapPointHeights: Record<string, `${number}%` | 'full'> = {
  '40%': '40%',
  '60%': '60%',
  '80%': '80%',
  full: 'full',
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
          entering={SlideInDown.springify().damping(18).stiffness(200)}
          exiting={SlideOutDown.duration(200)}
          style={{
            height: snapFraction === 1 ? '100%' : `${Math.round(snapFraction * 100)}%` as any,
            backgroundColor: '#1e293b',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 1,
            borderColor: '#334155',
          }}
        >
          {/* Handle */}
          <Animated.View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
            <Animated.View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: '#475569',
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
                paddingHorizontal: 16,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#334155',
              }}
            >
              <Text
                style={{ fontFamily: 'Poppins-SemiBold', color: '#ffffff', fontSize: 18 }}
              >
                {title}
              </Text>
              <Pressable onPress={onClose} style={{ padding: 4 }}>
                <Text style={{ color: '#94a3b8', fontSize: 16 }}>✕</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Content */}
          <Animated.View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
            {children}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
