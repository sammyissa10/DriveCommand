import { View, Text, Modal, Pressable, StyleSheet } from 'react-native'
import * as Notifications from 'expo-notifications'
import { kvStorage } from '../../lib/storage'

const PROMPTED_KEY = 'notifications_prompted'

interface NotificationPermissionModalProps {
  visible: boolean
  onDismiss: () => void
}

/**
 * First-launch modal explaining what push notifications are used for.
 *
 * Shown once after login when 'notifications_prompted' MMKV flag is not set.
 * After the user makes a choice (allow or later), the flag is written so
 * the modal is never shown again unless explicitly triggered from settings.
 */
export function NotificationPermissionModal({
  visible,
  onDismiss,
}: NotificationPermissionModalProps) {
  async function handleAllow() {
    await Notifications.requestPermissionsAsync()
    kvStorage.setString(PROMPTED_KEY, 'true')
    onDismiss()
  }

  function handleLater() {
    kvStorage.setString(PROMPTED_KEY, 'true')
    onDismiss()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>🔔</Text>
          </View>

          <Text style={styles.title}>Stay in the loop</Text>

          <Text style={styles.body}>
            DriveCommand uses notifications to alert you when:{'\n\n'}
            • A dispatcher sends you a message{'\n'}
            • A new load is assigned to you{'\n'}
            • Your documents are expiring{'\n\n'}
            You can change this at any time in your device settings.
          </Text>

          <Pressable style={styles.allowButton} onPress={handleAllow}>
            <Text style={styles.allowButtonText}>Allow Notifications</Text>
          </Pressable>

          <Pressable style={styles.laterButton} onPress={handleLater}>
            <Text style={styles.laterButtonText}>Maybe Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

/**
 * Check whether the notification permission modal should be shown.
 * Returns true if the user has never been prompted.
 */
export function shouldShowNotificationModal(): boolean {
  return kvStorage.getString(PROMPTED_KEY) !== 'true'
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconText: {
    fontSize: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 14,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 22,
    textAlign: 'left',
    marginBottom: 24,
    width: '100%',
  },
  allowButton: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  allowButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  laterButton: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  laterButtonText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '500',
  },
})
