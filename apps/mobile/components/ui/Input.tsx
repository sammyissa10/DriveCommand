import React from 'react'
import { KeyboardTypeOptions, ReturnKeyTypeOptions, Text, TextInput, View } from 'react-native'

interface InputProps {
  label?: string
  placeholder?: string
  value: string
  onChangeText: (text: string) => void
  error?: string
  secureTextEntry?: boolean
  keyboardType?: KeyboardTypeOptions
  autoFocus?: boolean
  returnKeyType?: ReturnKeyTypeOptions
  onSubmitEditing?: () => void
  blurOnSubmit?: boolean
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  secureTextEntry = false,
  keyboardType = 'default',
  autoFocus = false,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
}: InputProps) {
  return (
    <View className="mb-4">
      {label && (
        <Text className="text-slate-300 text-sm font-medium mb-1.5">{label}</Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        className={`h-12 bg-slate-800 border rounded-xl px-4 text-white text-base ${
          error ? 'border-red-500' : 'border-slate-600'
        }`}
      />
      {error && (
        <Text className="text-red-400 text-xs mt-1">{error}</Text>
      )}
    </View>
  )
}
