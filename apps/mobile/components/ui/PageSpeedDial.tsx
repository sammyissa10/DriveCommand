import React, { useState } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { LifeBuoy, Plus, X } from 'lucide-react-native'
import { useSupportTicket } from '../../context/SupportTicketContext'
import { haptic } from '../../lib/haptics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageSpeedDialProps {
  primaryLabel: string
  primaryIcon: React.ComponentType<{ color: string; size: number }>
  primaryColor: string
  onPrimaryPress: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PageSpeedDial({
  primaryLabel,
  primaryIcon: PrimaryIcon,
  primaryColor,
  onPrimaryPress,
}: PageSpeedDialProps) {
  const { open: openSupport } = useSupportTicket()
  const [open, setOpen] = useState(false)
  const fadeAnim = React.useRef(new Animated.Value(0)).current

  function openSpeedDial() {
    haptic.medium()
    setOpen(true)
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start()
  }

  function closeSpeedDial() {
    Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(() =>
      setOpen(false)
    )
  }

  function handlePrimaryPress() {
    closeSpeedDial()
    haptic.light()
    onPrimaryPress()
  }

  function handleSupportPress() {
    closeSpeedDial()
    haptic.light()
    setTimeout(() => openSupport(), 160)
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <Pressable
          onPress={closeSpeedDial}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Animated.View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.55)',
              opacity: fadeAnim,
            }}
          />
        </Pressable>
      )}

      {/* Speed dial action items */}
      {open && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 88,
            right: 20,
            gap: 10,
            alignItems: 'flex-end',
            opacity: fadeAnim,
            transform: [
              {
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          }}
        >
          {/* Primary action row */}
          <Pressable
            onPress={handlePrimaryPress}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View
              style={{
                backgroundColor: '#1e293b',
                borderRadius: 8,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: '#334155',
              }}
            >
              <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>
                {primaryLabel}
              </Text>
            </View>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: primaryColor + '22',
                borderWidth: 1,
                borderColor: primaryColor + '55',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PrimaryIcon color={primaryColor} size={18} />
            </View>
          </Pressable>

          {/* Separator */}
          <View
            style={{
              height: 1,
              backgroundColor: '#475569',
              width: 160,
              alignSelf: 'flex-end',
              marginVertical: 2,
            }}
          />

          {/* Get Support row */}
          <Pressable
            onPress={handleSupportPress}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View
              style={{
                backgroundColor: '#1e293b',
                borderRadius: 8,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: '#334155',
              }}
            >
              <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>
                Get Support
              </Text>
            </View>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: '#f59e0b22',
                borderWidth: 1,
                borderColor: '#f59e0b55',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LifeBuoy color="#f59e0b" size={18} />
            </View>
          </Pressable>
        </Animated.View>
      )}

      {/* FAB — toggle speed dial */}
      <Pressable
        accessibilityLabel="Quick actions"
        accessibilityRole="button"
        onPress={open ? closeSpeedDial : openSpeedDial}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: open ? '#475569' : '#0ea5e9',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#0ea5e9',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        {open ? <X color="#ffffff" size={22} /> : <Plus color="#ffffff" size={24} />}
      </Pressable>
    </>
  )
}
