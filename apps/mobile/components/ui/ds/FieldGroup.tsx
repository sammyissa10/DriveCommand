import React from 'react'
import { View } from 'react-native'
import { Text } from './Text'
import type { StatusTone } from './StatusPill'

const VALUE_TINT: Record<StatusTone, string> = {
  success: 'text-ds-success',
  accent: 'text-ds-accent',
  warning: 'text-ds-warning',
  danger: 'text-ds-danger',
  neutral: 'text-ds-txt',
  vip: 'text-ds-vip',
}

export interface FieldDef {
  key: string
  /** Owner's words, never a column name. */
  label: string
  /** View-mode value. Empty/undefined renders as an em dash. */
  value?: string | null
  /** Tints the value (status / expiry fields) in view mode. */
  tone?: StatusTone
  /**
   * The edit control (SheetInput, picker, etc.) supplied by the page.
   * Omit + `editable: false` for computed fields (e.g. status).
   */
  renderInput?: () => React.ReactNode
  /** Computed/immutable fields: shown locked in edit mode, never an input. */
  editable?: boolean
  /** One-line reason shown under a locked field in edit mode. */
  lockReason?: string
}

export interface FieldGroupProps {
  fields: FieldDef[]
  isEditing: boolean
}

/**
 * The view/edit parity primitive. Same fields, same order, same card in both
 * modes — the ONLY difference is layout:
 *  - view: 52-high rows, label left / value right, hairline dividers inset 18.
 *  - edit: 13pt label stacked above a full-width input, no hairlines.
 * Field order and grouping are identical by construction (one `fields` array).
 */
export function FieldGroup({ fields, isEditing }: FieldGroupProps) {
  return (
    <View className="overflow-hidden rounded-[20px] bg-ds-card">
      {fields.map((f, i) => {
        const last = i === fields.length - 1

        if (isEditing) {
          const editable = f.editable !== false
          return (
            <View key={f.key} className="gap-1.5 px-4 py-2.5">
              <Text className="text-[13px] text-ds-txt2">{f.label}</Text>
              {editable && f.renderInput ? (
                f.renderInput()
              ) : (
                <>
                  <Text variant="body" className={f.tone ? VALUE_TINT[f.tone] : 'text-ds-txt2'}>
                    {f.value && f.value.length > 0 ? f.value : '—'}
                  </Text>
                  {f.lockReason ? (
                    <Text variant="caption" className="text-ds-txt3">
                      {f.lockReason}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          )
        }

        return (
          <View key={f.key}>
            <View className="h-[52px] flex-row items-center justify-between px-4">
              <Text variant="body" className="text-[15px] text-ds-txt2">
                {f.label}
              </Text>
              <Text
                variant="body"
                numberOfLines={1}
                className={`ml-4 shrink text-right font-medium ${
                  f.tone ? VALUE_TINT[f.tone] : 'text-ds-txt'
                }`}
              >
                {f.value && f.value.length > 0 ? f.value : '—'}
              </Text>
            </View>
            {last ? null : <View className="ml-[18px] h-px bg-ds-hairline" />}
          </View>
        )
      })}
    </View>
  )
}
