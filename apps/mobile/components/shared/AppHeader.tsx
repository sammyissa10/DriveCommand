import { useState } from 'react'
import { Alert, Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthContext } from '../../context/AuthContext'
import { DCChevronIcon } from './DCLogo'

/**
 * Persistent top bar shown on every screen.
 * - Left: company name (from auth user)
 * - Right: avatar button → profile popup with name, email, sign out
 */
export function AppHeader() {
  const { user, logout } = useAuthContext()
  const [showProfile, setShowProfile] = useState(false)
  const { top } = useSafeAreaInsets()

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  function handleSignOut() {
    setShowProfile(false)
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    )
  }

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: top + 8,
          paddingBottom: 10,
          backgroundColor: '#0f172a',
          borderBottomWidth: 1,
          borderBottomColor: '#1e293b',
        }}
      >
        {/* Chevron icon + company name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <DCChevronIcon size={26} variant="light" />
          <Text
            style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '600', letterSpacing: 0.2, flexShrink: 1 }}
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
            backgroundColor: '#0c4a6e',
            borderWidth: 2,
            borderColor: '#0ea5e9',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#38bdf8', fontSize: 13, fontWeight: '700' }}>{initials}</Text>
        </Pressable>
      </View>

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
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.35)',
            }}
            onPress={() => setShowProfile(false)}
          />

          {/* Card — anchored top-right */}
          <View
            style={{
              position: 'absolute',
              top: 56,
              right: 16,
              width: 220,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#334155',
              backgroundColor: '#1e293b',
              elevation: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.5,
              shadowRadius: 16,
            }}
          >
            {/* User info */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 12,
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#0c4a6e',
                  borderWidth: 2,
                  borderColor: '#0ea5e9',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Text style={{ color: '#38bdf8', fontSize: 13, fontWeight: '700' }}>{initials}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}
                  numberOfLines={1}
                >
                  {user?.name ?? 'User'}
                </Text>
                <Text
                  style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {user?.email ?? ''}
                </Text>
                <Text
                  style={{ color: '#475569', fontSize: 10, marginTop: 2, textTransform: 'capitalize' }}
                  numberOfLines={1}
                >
                  {user?.role?.toLowerCase() ?? ''}
                </Text>
              </View>
            </View>

            {/* Company row */}
            <View style={{ height: 1, backgroundColor: '#334155' }} />
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Company
              </Text>
              <Text
                style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}
                numberOfLines={1}
              >
                {user?.companyName ?? '—'}
              </Text>
            </View>

            {/* Divider + Sign Out */}
            <View style={{ height: 1, backgroundColor: '#334155' }} />
            <View style={{ borderBottomLeftRadius: 14, borderBottomRightRadius: 14, overflow: 'hidden' }}>
              <Pressable
                onPress={handleSignOut}
                android_ripple={{ color: 'rgba(248,113,113,0.15)', borderless: false }}
                style={{ paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#f87171', fontSize: 13, fontWeight: '600' }}>Sign Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}
