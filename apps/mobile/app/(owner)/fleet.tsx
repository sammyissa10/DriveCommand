import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Send, User, X } from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import {
  ownerApi,
  type DriverOption,
  type FleetMessageSummary,
} from '@drivecommand/api-client'
import RecipientSelector, {
  type RecipientOption,
} from '../../components/owner/RecipientSelector'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'compose' | 'history'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  if (diffMs < 60_000) return 'just now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

const MAX_LENGTH = 500
const WARN_THRESHOLD = 450

// ---------------------------------------------------------------------------
// MessageHistoryRow
// ---------------------------------------------------------------------------

interface MessageHistoryRowProps {
  message: FleetMessageSummary
  onPress: () => void
}

function MessageHistoryRow({ message, onPress }: MessageHistoryRowProps) {
  const preview =
    message.body.length > 80
      ? message.body.slice(0, 80) + '…'
      : message.body

  return (
    <TouchableOpacity style={styles.historyRow} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.historyRowLeft}>
        <View style={styles.historyIconWrap}>
          {message.isBroadcast ? (
            <Megaphone size={16} color="#38bdf8" />
          ) : (
            <User size={16} color="#94a3b8" />
          )}
        </View>
        <View style={styles.historyRowContent}>
          <Text style={styles.historyRecipient} numberOfLines={1}>
            {message.recipientName}
          </Text>
          <Text style={styles.historyPreview} numberOfLines={2}>
            {preview}
          </Text>
        </View>
      </View>
      <Text style={styles.historyTime}>{timeAgo(message.createdAt)}</Text>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function OwnerFleetScreen() {
  const { token } = useAuthContext()
  const queryClient = useQueryClient()
  const { driverId } = useLocalSearchParams<{ driverId?: string }>()

  const [activeTab, setActiveTab] = useState<TabKey>('compose')
  const [recipient, setRecipient] = useState<RecipientOption | null>(null)
  const [body, setBody] = useState('')
  const [selectorVisible, setSelectorVisible] = useState(false)

  // Pre-select driver from navigation params
  const didPreSelect = useRef(false)

  // Fetch active drivers (for RecipientSelector)
  const { data: driversData, isLoading: driversLoading } = useQuery({
    queryKey: ['active-drivers'],
    queryFn: () => ownerApi.getActiveDrivers(token!),
    enabled: !!token,
  })

  const drivers: DriverOption[] = driversData ?? []

  // Pre-select driver when driverId param is present
  useEffect(() => {
    if (!driverId || didPreSelect.current) return
    if (drivers.length === 0) return

    const found = drivers.find((d) => d.id === driverId)
    if (found) {
      setRecipient({ id: found.id, name: found.name, isBroadcast: false })
      setActiveTab('compose')
      didPreSelect.current = true
    }
  }, [driverId, drivers])

  // Fetch message history
  const {
    data: messagesData,
    isLoading: messagesLoading,
    refetch: refetchMessages,
    isRefetching,
  } = useQuery({
    queryKey: ['fleet-messages'],
    queryFn: () => ownerApi.getFleetMessages(token!),
    enabled: !!token,
  })

  const messages: FleetMessageSummary[] = messagesData?.messages ?? []

  // Send mutation
  const { mutate: sendMessage, isPending: isSending } = useMutation({
    mutationFn: () => {
      if (!recipient) throw new Error('No recipient selected')
      return ownerApi.sendFleetMessage(token!, {
        body,
        isBroadcast: recipient.isBroadcast || undefined,
        recipientId: recipient.isBroadcast ? undefined : (recipient.id ?? undefined),
      })
    },
    onSuccess: () => {
      Alert.alert('Message sent!', `Message delivered to ${recipient?.name}.`)
      setRecipient(null)
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['fleet-messages'] })
    },
    onError: (err: Error) => {
      Alert.alert('Send failed', err.message ?? 'Could not send message. Try again.')
    },
  })

  const canSend = !!recipient && body.trim().length > 0 && !isSending

  function handleSend() {
    if (!canSend) return
    sendMessage()
  }

  function handleRecipientSelect(r: RecipientOption) {
    setRecipient(r)
    setSelectorVisible(false)
  }

  function handleClearRecipient() {
    setRecipient(null)
  }

  function handleMessageRowPress(message: FleetMessageSummary) {
    Alert.alert(
      message.recipientName,
      `${message.body}\n\nSent: ${new Date(message.createdAt).toLocaleString()}`,
      [{ text: 'OK' }]
    )
  }

  const charCount = body.length
  const charCountColor =
    charCount >= WARN_THRESHOLD ? '#f97316' : '#64748b'

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Page header */}
        <Text style={styles.pageTitle}>Fleet Messages</Text>

        {/* Toggle bar */}
        <View style={styles.toggleBar}>
          {(['compose', 'history'] as TabKey[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.toggleBtn,
                activeTab === tab && styles.toggleBtnActive,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.toggleBtnText,
                  activeTab === tab && styles.toggleBtnTextActive,
                ]}
              >
                {tab === 'compose' ? 'Compose' : 'History'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Compose panel */}
        {activeTab === 'compose' && (
          <View style={styles.composePanel}>
            {/* Recipient field */}
            <Text style={styles.fieldLabel}>Recipient</Text>
            {recipient ? (
              <View style={styles.recipientChip}>
                {recipient.isBroadcast ? (
                  <Megaphone size={14} color="#38bdf8" />
                ) : (
                  <User size={14} color="#94a3b8" />
                )}
                <Text style={styles.recipientChipText} numberOfLines={1}>
                  {recipient.name}
                </Text>
                <TouchableOpacity onPress={handleClearRecipient} hitSlop={8}>
                  <X size={14} color="#64748b" />
                </TouchableOpacity>
              </View>
            ) : (
              <Pressable
                style={styles.recipientPlaceholder}
                onPress={() => setSelectorVisible(true)}
              >
                <Text style={styles.recipientPlaceholderText}>
                  Select recipient...
                </Text>
              </Pressable>
            )}
            {!recipient && (
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => setSelectorVisible(true)}
              >
                <Text style={styles.selectBtnText}>Choose Recipient</Text>
              </TouchableOpacity>
            )}

            {/* Message body */}
            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Message</Text>
            <TextInput
              style={styles.messageInput}
              value={body}
              onChangeText={setBody}
              placeholder="Type your message..."
              placeholderTextColor="#475569"
              multiline
              numberOfLines={4}
              maxLength={MAX_LENGTH}
              textAlignVertical="top"
            />
            <Text style={[styles.charCounter, { color: charCountColor }]}>
              {charCount} / {MAX_LENGTH}
            </Text>

            {/* Send button */}
            <TouchableOpacity
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator color="#0f172a" size="small" />
              ) : (
                <>
                  <Send size={16} color={canSend ? '#0f172a' : '#64748b'} />
                  <Text
                    style={[
                      styles.sendBtnText,
                      !canSend && styles.sendBtnTextDisabled,
                    ]}
                  >
                    Send Message
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* History panel */}
        {activeTab === 'history' && (
          <View style={styles.historyPanel}>
            {messagesLoading ? (
              <View style={styles.centerWrap}>
                <ActivityIndicator color="#38bdf8" />
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.centerWrap}>
                <Text style={styles.emptyText}>No messages sent yet</Text>
              </View>
            ) : (
              <FlatList
                data={messages}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefetching}
                    onRefresh={refetchMessages}
                    tintColor="#38bdf8"
                    colors={['#38bdf8']}
                  />
                }
                renderItem={({ item }) => (
                  <MessageHistoryRow
                    message={item}
                    onPress={() => handleMessageRowPress(item)}
                  />
                )}
                contentContainerStyle={styles.historyList}
              />
            )}
          </View>
        )}
      </View>

      {/* Recipient selector bottom sheet */}
      <RecipientSelector
        visible={selectorVisible}
        onSelect={handleRecipientSelect}
        onClose={() => setSelectorVisible(false)}
        drivers={drivers}
        loading={driversLoading}
      />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f1f5f9',
    marginBottom: 16,
  },

  // Toggle bar
  toggleBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#38bdf8',
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  toggleBtnTextActive: {
    color: '#0f172a',
  },

  // Compose panel
  composePanel: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  recipientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  recipientChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e8f0',
    flex: 1,
  },
  recipientPlaceholder: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  recipientPlaceholderText: {
    fontSize: 14,
    color: '#475569',
  },
  selectBtn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#38bdf8',
    marginTop: 8,
  },
  selectBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#38bdf8',
  },
  messageInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    fontSize: 15,
    color: '#e2e8f0',
    minHeight: 110,
    textAlignVertical: 'top',
  },
  charCounter: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
    marginBottom: 20,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#38bdf8',
    paddingVertical: 15,
    borderRadius: 12,
  },
  sendBtnDisabled: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  sendBtnTextDisabled: {
    color: '#64748b',
  },

  // History panel
  historyPanel: {
    flex: 1,
  },
  historyList: {
    paddingBottom: 24,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  historyRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  historyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  historyRowContent: {
    flex: 1,
  },
  historyRecipient: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 2,
  },
  historyPreview: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  historyTime: {
    fontSize: 11,
    color: '#475569',
    flexShrink: 0,
  },

  // Shared
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#475569',
  },
})
