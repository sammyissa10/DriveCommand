import { useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColorScheme } from 'nativewind'
import { Sun, Moon, Smartphone } from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { DCChevronIcon } from './DCLogo'
import { useThemeColors, radii } from '../../constants/tokens'
import { saveAppearance, getSavedAppearance, type AppearanceMode } from '../../lib/appearance'

const APPEARANCE_CYCLE: AppearanceMode[] = ['dark', 'light', 'system']

const APPEARANCE_ICONS = {
  light: Sun,
  dark: Moon,
  system: Smartphone,
} as const

const APPEARANCE_LABELS = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
} as const

/**
 * Persistent top bar shown on every screen.
 * - Left: company name (from auth user)
 * - Right: avatar button → profile popup with name, email, appearance toggle, sign out
 */
export function AppHeader() {
  const { user, logout } = useAuthContext()
  const { setColorScheme } = useColorScheme()
  const [showProfile, setShowProfile] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [appearance, setAppearanceState] = useState<AppearanceMode>(getSavedAppearance)
  const { top } = useSafeAreaInsets()
  const c = useThemeColors()

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  function handleSignOut() {
    setShowProfile(false)
    setShowSignOutConfirm(true)
  }

  function confirmSignOut() {
    setShowSignOutConfirm(false)
    logout()
  }

  function cycleAppearance() {
    const currentIndex = APPEARANCE_CYCLE.indexOf(appearance)
    const nextMode = APPEARANCE_CYCLE[(currentIndex + 1) % APPEARANCE_CYCLE.length]
    setAppearanceState(nextMode)
    saveAppearance(nextMode)
    setColorScheme(nextMode)
  }

  const AppearanceIcon = APPEARANCE_ICONS[appearance]

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingBottom: 10,
          paddingTop: top + 8,
          backgroundColor: c.background,
          borderBottomWidth: 1,
          borderBottomColor: c.borderLight,
        }}
      >
        {/* Chevron icon + company name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <DCChevronIcon size={26} variant="light" />
          <Text
            style={{
              color: c.textPrimary,
              fontSize: 15,
              fontWeight: '600',
              letterSpacing: 0.2,
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {user?.companyName ?? 'DriveCommand'}
          </Text>
        </View>

        {/* Avatar button */}
        <Pressable
          onPress={() => setShowProfile(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.brandSubtle,
            borderWidth: 2,
            borderColor: c.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: c.brandLight, fontSize: 13, fontWeight: '700' }}>{initials}</Text>
        </Pressable>
      </View>

      {/* Sign out confirmation modal */}
      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignOutConfirm(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 32,
          }}
        >
          <View
            style={{
              width: '100%',
              backgroundColor: c.surfaceElevated,
              borderRadius: radii.xl,
              borderWidth: 1,
              borderColor: c.border,
              paddingHorizontal: 24,
              paddingTop: 28,
              paddingBottom: 20,
              alignItems: 'center',
              elevation: 24,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.6,
              shadowRadius: 24,
            }}
          >
            {/* Icon */}
            <View style={{ marginBottom: 16 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: c.dangerBg,
                  borderWidth: 1.5,
                  borderColor: 'rgba(239,68,68,0.3)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22, color: c.danger }}>⏻</Text>
              </View>
            </View>

            <Text
              style={{
                color: c.textPrimary,
                fontSize: 18,
                fontWeight: '700',
                letterSpacing: 0.2,
                marginBottom: 8,
                textAlign: 'center',
              }}
            >
              Sign Out
            </Text>
            <Text
              style={{
                color: c.textSecondary,
                fontSize: 14,
                lineHeight: 20,
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              Are you sure you want to sign out of DriveCommand?
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <Pressable
                onPress={() => setShowSignOutConfirm(false)}
                android_ripple={{ color: 'rgba(148,163,184,0.12)', borderless: false }}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  backgroundColor: 'transparent',
                  borderWidth: 1.5,
                  borderColor: c.border,
                }}
              >
                <Text style={{ color: c.textSecondary, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmSignOut}
                android_ripple={{ color: 'rgba(239,68,68,0.2)', borderless: false }}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  backgroundColor: c.danger,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.2 }}>Sign Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Profile popup modal */}
      <Modal
        visible={showProfile}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProfile(false)}
      >
        <View style={{ flex: 1 }}>
          {/* Backdrop */}
          <Pressable
            style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, { backgroundColor: 'rgba(0,0,0,0.35)' }]}
            onPress={() => setShowProfile(false)}
          />

          {/* Card — anchored top-right */}
          <View
            style={{
              position: 'absolute',
              top: 56,
              right: 16,
              width: 240,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.surfaceCard,
              elevation: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.5,
              shadowRadius: 16,
            }}
          >
            {/* User info */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: c.brandSubtle,
                  borderWidth: 2,
                  borderColor: c.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Text style={{ color: c.brandLight, fontSize: 13, fontWeight: '700' }}>{initials}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                  {user?.name ?? 'User'}
                </Text>
                <Text style={{ color: c.textTertiary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                  {user?.email ?? ''}
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 10, marginTop: 2, textTransform: 'capitalize' }} numberOfLines={1}>
                  {user?.role?.toLowerCase() ?? ''}
                </Text>
              </View>
            </View>

            {/* Company row */}
            <View style={{ height: 1, backgroundColor: c.border }} />
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: c.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Company</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                {user?.companyName ?? '—'}
              </Text>
            </View>

            {/* Appearance toggle row */}
            <View style={{ height: 1, backgroundColor: c.border }} />
            <Pressable
              onPress={cycleAppearance}
              android_ripple={{ color: 'rgba(14,165,233,0.1)', borderless: false }}
              style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: 'rgba(14,165,233,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppearanceIcon color="#0ea5e9" size={14} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Appearance</Text>
                <Text style={{ color: c.textPrimary, fontSize: 12, marginTop: 1, fontWeight: '500' }}>
                  {APPEARANCE_LABELS[appearance]}
                </Text>
              </View>
              <Text style={{ color: c.textMuted, fontSize: 10 }}>Tap to cycle</Text>
            </Pressable>

            {/* Divider + Sign Out */}
            <View style={{ height: 1, backgroundColor: c.border }} />
            <View style={{ borderBottomLeftRadius: 14, borderBottomRightRadius: 14, overflow: 'hidden' }}>
              <Pressable
                onPress={handleSignOut}
                android_ripple={{ color: 'rgba(248,113,113,0.15)', borderless: false }}
                style={{ paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: c.danger, fontSize: 13, fontWeight: '600' }}>Sign Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}
