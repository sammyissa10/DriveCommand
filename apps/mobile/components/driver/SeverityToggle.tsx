import React from 'react'
import { Pressable, Text, View } from 'react-native'
import type { IncidentSeverity } from '@drivecommand/api-client'

interface SeverityToggleProps {
  value: IncidentSeverity | null
  onChange: (severity: IncidentSeverity) => void
}

interface SeverityOption {
  key: IncidentSeverity
  label: string
}

const OPTIONS: SeverityOption[] = [
  { key: 'LOW', label: 'Low' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'HIGH', label: 'High' },
]

function getSelectedStyle(key: IncidentSeverity, selected: boolean) {
  if (!selected) return { bg: '#1e293b', text: '#94a3b8' } // slate-800, slate-400

  switch (key) {
    case 'LOW':
      return { bg: '#16a34a', text: '#ffffff' } // green-600
    case 'MEDIUM':
      return { bg: '#eab308', text: '#000000' } // yellow-500, black text for contrast
    case 'HIGH':
      return { bg: '#dc2626', text: '#ffffff' } // red-600
  }
}

export function SeverityToggle({ value, onChange }: SeverityToggleProps) {
  return (
    <View style={{ flexDirection: 'row', borderRadius: 12, overflow: 'hidden' }}>
      {OPTIONS.map((option, index) => {
        const selected = value === option.key
        const colors = getSelectedStyle(option.key, selected)
        const isFirst = index === 0
        const isLast = index === OPTIONS.length - 1
        const isMiddle = !isFirst && !isLast

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={{
              flex: 1,
              paddingVertical: 14,
              alignItems: 'center',
              backgroundColor: colors.bg,
              borderTopLeftRadius: isFirst ? 12 : 0,
              borderBottomLeftRadius: isFirst ? 12 : 0,
              borderTopRightRadius: isLast ? 12 : 0,
              borderBottomRightRadius: isLast ? 12 : 0,
              borderRightWidth: isMiddle || isFirst ? 1 : 0,
              borderRightColor: '#334155', // slate-700
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontWeight: selected ? '700' : '500',
                fontSize: 14,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
