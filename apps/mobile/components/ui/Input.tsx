import React from 'react'
import { KeyboardTypeOptions, Platform, ReturnKeyTypeOptions, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, radii, spacing, typography } from '../../constants/tokens'

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
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        clearButtonMode={Platform.select({ ios: 'while-editing', android: 'never' })}
        style={[styles.input, error ? styles.inputError : styles.inputNormal]}
      />
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.footnote,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    height: 48,
    backgroundColor: colors.surfaceInput,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    ...typography.body,
    color: colors.textPrimary,
  },
  inputNormal: {
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.caption1,
    color: colors.danger,
    marginTop: 4,
  },
})
