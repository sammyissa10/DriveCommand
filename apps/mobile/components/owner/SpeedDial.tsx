import React, { useRef, useState } from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LifeBuoy, Plus, X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { haptic } from '../../lib/haptics'
import { colors, radii, spacing, typography } from '../../constants/tokens'

interface SpeedDialAction {
  key: string
  label: string
  icon: React.ComponentType<{ color: string; size: number }>
  route: string
  color: string
}

interface SpeedDialProps {
  actions: ReadonlyArray<SpeedDialAction>
  onAction: (route: string) => void
  onSupportPress: () => void
}

export function SpeedDial({ actions, onAction, onSupportPress }: SpeedDialProps) {
  const insets = useSafeAreaInsets()
  const [menuOpen, setMenuOpen] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current

  function openMenu() {
    haptic.medium()
    setMenuOpen(true)
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start()
  }

  function closeMenu() {
    Animated.timing(fadeAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(() =>
      setMenuOpen(false)
    )
  }

  function handleAction(route: string) {
    closeMenu()
    onAction(route)
  }

  const fabBottom = insets.bottom + spacing.lg
  const itemsBottom = fabBottom + 52 + spacing.md

  return (
    <>
      {/* Backdrop */}
      {menuOpen && (
        <Pressable
          onPress={closeMenu}
          style={StyleSheet.absoluteFillObject}
        >
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        </Pressable>
      )}

      {/* Speed-dial action items */}
      {menuOpen && (
        <Animated.View
          style={[
            styles.itemsContainer,
            {
              bottom: itemsBottom,
              right: spacing.xl,
              opacity: fadeAnim,
              transform: [
                {
                  translateY: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <Pressable
                key={action.key}
                onPress={() => handleAction(action.route)}
                style={styles.actionRow}
              >
                <View style={styles.actionLabel}>
                  <Text style={styles.actionLabelText} numberOfLines={1}>{action.label}</Text>
                </View>
                <View
                  style={[
                    styles.actionIcon,
                    {
                      backgroundColor: action.color + '22',
                      borderColor: action.color + '55',
                    },
                  ]}
                >
                  <Icon color={action.color} size={18} />
                </View>
              </Pressable>
            )
          })}

          {/* Separator above Get Support */}
          <View style={styles.separator} />

          {/* Get Support */}
          <Pressable
            onPress={() => { closeMenu(); haptic.light(); setTimeout(onSupportPress, 160) }}
            style={styles.actionRow}
          >
            <View style={styles.actionLabel}>
              <Text style={styles.actionLabelText}>Get Support</Text>
            </View>
            <View
              style={[
                styles.actionIcon,
                {
                  backgroundColor: colors.warning + '22',
                  borderColor: colors.warning + '55',
                },
              ]}
            >
              <LifeBuoy color={colors.warning} size={18} />
            </View>
          </Pressable>
        </Animated.View>
      )}

      {/* FAB */}
      <Pressable
        accessibilityLabel="Quick create"
        accessibilityRole="button"
        onPress={menuOpen ? closeMenu : openMenu}
        style={[
          styles.fab,
          {
            bottom: fabBottom,
            right: spacing.xl,
            backgroundColor: menuOpen ? colors.textMuted : colors.brand,
          },
        ]}
      >
        {menuOpen ? (
          <X color={colors.textPrimary} size={22} />
        ) : (
          <Plus color={colors.textPrimary} size={24} />
        )}
      </Pressable>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  itemsContainer: {
    position: 'absolute',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionLabel: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionLabelText: {
    ...typography.callout,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.textMuted,
    width: 160,
    alignSelf: 'flex-end',
    marginVertical: spacing.xs,
  },
  fab: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
})
