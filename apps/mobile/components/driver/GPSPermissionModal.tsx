import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native'
import * as Location from 'expo-location'
import type { GPSStatus } from '../../hooks/useBackgroundGPS'

interface GPSPermissionModalProps {
  visible: boolean
  onAllow: () => void
  onDismiss: () => void
}

/**
 * Shown before requesting background location permission.
 * Explains why DriveCommand needs background location access.
 */
export function GPSPermissionModal({ visible, onAllow, onDismiss }: GPSPermissionModalProps) {
  const handleAllow = async () => {
    const { status: fg } = await Location.requestForegroundPermissionsAsync()
    if (fg !== 'granted') {
      onDismiss()
      return
    }
    const { status: bg } = await Location.requestBackgroundPermissionsAsync()
    if (bg !== 'granted') {
      onDismiss()
      return
    }
    onAllow()
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
          {/* Icon placeholder */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>📍</Text>
          </View>

          <Text style={styles.title}>Location Access</Text>

          <Text style={styles.body}>
            DriveCommand needs to track your location in the background so dispatchers can see your
            position during deliveries. This only runs while you're on duty.
          </Text>

          <TouchableOpacity style={styles.allowButton} onPress={handleAllow} activeOpacity={0.8}>
            <Text style={styles.allowText}>Allow</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.dismissText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconContainer: {
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  allowButton: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  allowText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  dismissText: {
    color: '#64748b',
    fontSize: 15,
  },
})
