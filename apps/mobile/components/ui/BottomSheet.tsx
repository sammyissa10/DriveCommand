import React from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  snapPoint?: '40%' | '60%' | '80%' | 'full'
}

const snapPointHeights: Record<string, string> = {
  '40%': 'h-[40%]',
  '60%': 'h-[60%]',
  '80%': 'h-[80%]',
  full: 'h-full',
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  snapPoint = '60%',
}: BottomSheetProps) {
  const heightClass = snapPointHeights[snapPoint]

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Backdrop */}
        <Pressable className="flex-1 bg-black/60" onPress={onClose} />

        {/* Sheet */}
        <View
          className={`${heightClass} bg-slate-800 rounded-t-2xl border-t border-slate-700`}
        >
          {/* Handle */}
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full bg-slate-600" />
          </View>

          {/* Header */}
          {title && (
            <View className="flex-row items-center justify-between px-4 pb-3 border-b border-slate-700">
              <Text
                style={{ fontFamily: 'Poppins-SemiBold' }}
                className="text-white text-lg"
              >
                {title}
              </Text>
              <Pressable onPress={onClose} className="p-1">
                <Text className="text-slate-400 text-base">✕</Text>
              </Pressable>
            </View>
          )}

          {/* Content */}
          <View className="flex-1 px-4 pt-4">{children}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
