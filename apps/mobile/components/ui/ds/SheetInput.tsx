import React from 'react'
import { View, TextInput, type TextInputProps } from 'react-native'
import { Text } from './Text'

export interface SheetInputProps extends Omit<TextInputProps, 'style' | 'className'> {
  /** Field label. Omit to render a bare input (e.g. inside a FieldGroup edit row). */
  label?: string
  /** Adds a spelled-out "Required" hint after the label — never an asterisk. */
  required?: boolean
  /** Inline error shown under the field; the input keeps its value. */
  error?: string
  /** 'sheet' = 46-high radius 12 (Quick Create); 'field' = 44-high radius 10 (edit mode). */
  variant?: 'sheet' | 'field'
  multiline?: boolean
}

/**
 * Labelled text input for sheets and edit-mode field groups. Keyboard type,
 * return key, etc. pass straight through. Errors render inline and never clear
 * the value.
 */
export const SheetInput = React.forwardRef<TextInput, SheetInputProps>(function SheetInput(
  { label, required = false, error, variant = 'sheet', multiline = false, ...rest },
  ref,
) {
  const box =
    variant === 'sheet'
      ? 'rounded-[12px]' + (multiline ? ' min-h-[92px] py-3' : ' h-[46px]')
      : 'rounded-[10px]' + (multiline ? ' min-h-[88px] py-3' : ' h-[44px]')

  return (
    <View className="gap-1.5">
      {label ? (
        <View className="flex-row items-center gap-1.5">
          <Text className="text-[13px] text-ds-txt2">{label}</Text>
          {required ? <Text className="text-[13px] text-ds-txt3">Required</Text> : null}
        </View>
      ) : null}
      <TextInput
        ref={ref}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`bg-ds-input px-3 text-[16px] text-ds-txt placeholder:text-ds-txt3 ${box}`}
        {...rest}
      />
      {error ? <Text className="text-[13px] text-ds-danger">{error}</Text> : null}
    </View>
  )
})
