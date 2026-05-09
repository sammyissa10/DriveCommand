import React from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { BottomSheet } from '../ui/BottomSheet'
import { MAINTENANCE_SERVICE_TYPES } from '../../constants/maintenance'
import { haptic } from '../../lib/haptics'
import { useThemeColors } from '../../constants/tokens'

interface MaintenanceServicePickerProps {
  visible: boolean
  onClose: () => void
  onSelect: (type: string) => void
  selectedType?: string
}

export function MaintenanceServicePicker({
  visible,
  onClose,
  onSelect,
  selectedType,
}: MaintenanceServicePickerProps) {
  const c = useThemeColors()

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Service Type" snapPoint="80%">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {MAINTENANCE_SERVICE_TYPES.map((type, index) => {
          const isSelected = type === selectedType
          return (
            <View key={type}>
              {index > 0 && (
                <View className="h-px" style={{ backgroundColor: c.border }} />
              )}
              <Pressable
                onPress={() => {
                  haptic.light()
                  onSelect(type)
                  onClose()
                }}
                className="flex-row items-center justify-between py-3.5 active:opacity-70"
                style={isSelected ? { backgroundColor: `${c.brand}15`, borderRadius: 8, paddingHorizontal: 8, marginHorizontal: -8 } : undefined}
              >
                <Text
                  className="text-[15px] font-medium"
                  style={{ color: isSelected ? c.brand : c.textPrimary }}
                >
                  {type}
                </Text>
                {isSelected && (
                  <Check color={c.brand} size={18} />
                )}
              </Pressable>
            </View>
          )
        })}
      </ScrollView>
    </BottomSheet>
  )
}
