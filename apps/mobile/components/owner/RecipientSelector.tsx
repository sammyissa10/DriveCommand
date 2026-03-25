import React from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Megaphone, Radio, X } from 'lucide-react-native'
import type { DriverOption } from '@drivecommand/api-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecipientOption {
  id: string | null
  name: string
  isBroadcast: boolean
}

interface RecipientSelectorProps {
  visible: boolean
  onSelect: (recipient: RecipientOption) => void
  onClose: () => void
  drivers: DriverOption[]
  loading?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecipientSelector({
  visible,
  onSelect,
  onClose,
  drivers,
  loading = false,
}: RecipientSelectorProps) {
  function handleSelectBroadcast() {
    onSelect({ id: null, name: 'All Drivers', isBroadcast: true })
  }

  function handleSelectDriver(driver: DriverOption) {
    onSelect({ id: driver.id, name: driver.name, isBroadcast: false })
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop — tap to close */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <View style={styles.sheet}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Select Recipient</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* All Drivers broadcast option */}
        <TouchableOpacity
          style={styles.broadcastRow}
          onPress={handleSelectBroadcast}
          activeOpacity={0.75}
        >
          <View style={styles.broadcastIconWrap}>
            <Megaphone size={18} color="#38bdf8" />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.broadcastLabel}>All Drivers</Text>
            <Text style={styles.broadcastSub}>Broadcast to entire fleet</Text>
          </View>
          <Radio size={16} color="#38bdf8" />
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Individual drivers */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#38bdf8" />
          </View>
        ) : drivers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No active drivers</Text>
          </View>
        ) : (
          <FlatList
            data={drivers}
            keyExtractor={(item) => item.id}
            style={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.driverRow}
                onPress={() => handleSelectDriver(item)}
                activeOpacity={0.75}
              >
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {getInitials(item.name)}
                  </Text>
                </View>
                <Text style={styles.driverName}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 8,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#475569',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
    borderRadius: 16,
  },
  broadcastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  broadcastIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e3a5f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
  },
  broadcastLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  broadcastSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 14,
  },
  list: {
    maxHeight: 280,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  driverName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e2e8f0',
    flex: 1,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
  },
})
