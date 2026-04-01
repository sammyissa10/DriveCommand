import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthContext } from '../../context/AuthContext'
import { DCChevronIcon } from './DCLogo'
import { colors, radii, typography } from '../../constants/tokens'

/**
 * Persistent top bar shown on every screen.
 * - Left: company name (from auth user)
 * - Right: avatar button → profile popup with name, email, sign out
 */
export function AppHeader() {
  const { user, logout } = useAuthContext()
  const [showProfile, setShowProfile] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const { top } = useSafeAreaInsets()

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

  return (
    <>
      <View
        style={[
          styles.header,
          { paddingTop: top + 8 },
        ]}
      >
        {/* Chevron icon + company name */}
        <View style={styles.titleRow}>
          <DCChevronIcon size={26} variant="light" />
          <Text
            style={styles.companyName}
            numberOfLines={1}
          >
            {user?.companyName ?? 'DriveCommand'}
          </Text>
        </View>

        {/* Avatar button */}
        <Pressable
          onPress={() => setShowProfile(true)}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </Pressable>
      </View>

      {/* Sign out confirmation modal */}
      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignOutConfirm(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            {/* Icon */}
            <View style={styles.confirmIconWrap}>
              <View style={styles.confirmIconBg}>
                {/* Power/logout icon using simple shapes */}
                <Text style={styles.confirmIconGlyph}>⏻</Text>
              </View>
            </View>

            {/* Title + body */}
            <Text style={styles.confirmTitle}>Sign Out</Text>
            <Text style={styles.confirmBody}>
              Are you sure you want to sign out of DriveCommand?
            </Text>

            {/* Actions */}
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setShowSignOutConfirm(false)}
                android_ripple={{ color: 'rgba(148,163,184,0.12)', borderless: false }}
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
              >
                <Text style={styles.confirmBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmSignOut}
                android_ripple={{ color: 'rgba(239,68,68,0.2)', borderless: false }}
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
              >
                <Text style={styles.confirmBtnDangerText}>Sign Out</Text>
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
        <View style={StyleSheet.absoluteFillObject}>
          {/* Backdrop */}
          <Pressable
            style={[StyleSheet.absoluteFillObject, styles.backdrop]}
            onPress={() => setShowProfile(false)}
          />

          {/* Card — anchored top-right */}
          <View style={styles.profileCard}>
            {/* User info */}
            <View style={styles.profileUserRow}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{initials}</Text>
              </View>
              <View style={styles.profileUserInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {user?.name ?? 'User'}
                </Text>
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {user?.email ?? ''}
                </Text>
                <Text style={styles.profileRole} numberOfLines={1}>
                  {user?.role?.toLowerCase() ?? ''}
                </Text>
              </View>
            </View>

            {/* Company row */}
            <View style={styles.divider} />
            <View style={styles.companyRow}>
              <Text style={styles.companyLabel}>Company</Text>
              <Text style={styles.companyValue} numberOfLines={1}>
                {user?.companyName ?? '—'}
              </Text>
            </View>

            {/* Divider + Sign Out */}
            <View style={styles.divider} />
            <View style={styles.signOutWrapper}>
              <Pressable
                onPress={handleSignOut}
                android_ripple={{ color: 'rgba(248,113,113,0.15)', borderless: false }}
                style={styles.signOutButton}
              >
                <Text style={styles.signOutText}>Sign Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  companyName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSubtle,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.brandLight,
    fontSize: 13,
    fontWeight: '700',
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  profileCard: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCard,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  profileUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandSubtle,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileAvatarText: {
    color: colors.brandLight,
    fontSize: 13,
    fontWeight: '700',
  },
  profileUserInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  profileEmail: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  profileRole: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  companyRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  companyLabel: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  companyValue: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  signOutWrapper: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
  },
  signOutButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },

  // Sign-out confirmation dialog
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  confirmCard: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
  },
  confirmIconWrap: {
    marginBottom: 16,
  },
  confirmIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.dangerBg,
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmIconGlyph: {
    fontSize: 22,
    color: colors.danger,
  },
  confirmTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  confirmBtnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  confirmBtnCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtnDanger: {
    backgroundColor: colors.danger,
  },
  confirmBtnDangerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
