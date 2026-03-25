import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { MessageSquare, Send } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { useAuthContext } from '../../context/AuthContext'
import { driverApi, type FleetMessage } from '@drivecommand/api-client'
import { kvStorage } from '../../lib/storage'

const POLL_INTERVAL_MS = 30_000
const LAST_READ_KEY = 'messages_last_read_at'

function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getRoleLabel(senderRole: string): string {
  switch (senderRole.toUpperCase()) {
    case 'DRIVER':
      return 'You'
    case 'OWNER':
      return 'Owner'
    case 'MANAGER':
      return 'Manager'
    case 'DISPATCHER':
      return 'Dispatcher'
    default:
      return senderRole
  }
}

interface MessageBubbleProps {
  message: FleetMessage
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isDriver = message.senderRole.toUpperCase() === 'DRIVER'

  return (
    <View className={`mb-3 px-4 ${isDriver ? 'items-end' : 'items-start'}`}>
      <Text className="text-xs text-slate-400 mb-1">
        {getRoleLabel(message.senderRole)}
      </Text>
      <View
        className={`max-w-[80%] px-4 py-3 ${
          isDriver
            ? 'bg-sky-600 rounded-2xl rounded-br-sm'
            : 'bg-slate-700 rounded-2xl rounded-bl-sm'
        }`}
      >
        <Text className="text-white text-sm leading-5">{message.body}</Text>
      </View>
      <Text className="text-xs text-slate-500 mt-1">
        {formatTime(message.createdAt)}
      </Text>
    </View>
  )
}

export default function DriverMessages() {
  const { token } = useAuthContext()
  const [messages, setMessages] = useState<FleetMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const flatListRef = useRef<FlashList<FleetMessage>>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const markAllRead = useCallback(async () => {
    if (!token) return
    // Store current timestamp as last-read in MMKV
    kvStorage.setString(LAST_READ_KEY, new Date().toISOString())
    // Best-effort server acknowledgement
    driverApi.markMessagesRead(token).catch(() => { /* ignore */ })
  }, [token])

  const fetchMessages = useCallback(
    async (showLoading = false) => {
      if (!token) return
      if (showLoading) setLoading(true)
      try {
        const data = await driverApi.getMessages(token)
        setMessages(data)
        setFetchError(null)
      } catch {
        setFetchError('Could not load messages.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [token]
  )

  // Initial fetch
  useEffect(() => {
    fetchMessages(true)
  }, [fetchMessages])

  // Poll every 30s for new messages
  useEffect(() => {
    pollTimerRef.current = setInterval(() => {
      fetchMessages(false)
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [fetchMessages])

  // Mark all as read when screen gains focus
  useFocusEffect(
    useCallback(() => {
      markAllRead()
    }, [markAllRead])
  )

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [messages.length])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    fetchMessages(false)
  }, [fetchMessages])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || !token || sending) return

    setSending(true)
    setInputText('')

    // Attach loadId from the active conversation so replies appear in the owner's load detail
    const activeLoadId = messages.find((m) => m.loadId)?.loadId ?? undefined

    try {
      const newMessage = await driverApi.sendMessage(token, text, activeLoadId)
      setMessages((prev) => [...prev, newMessage])
    } catch {
      // Restore input text on failure
      setInputText(text)
      Alert.alert('Send Failed', 'Could not send your message. Please try again.')
    } finally {
      setSending(false)
    }
  }, [inputText, token, sending, messages])

  const isEmpty = messages.length === 0

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View className="px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-white">Messages</Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Loading state */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#0ea5e9" />
          </View>
        ) : isEmpty ? (
          /* Empty state */
          <View className="flex-1 items-center justify-center px-8">
            <MessageSquare color="#334155" size={52} />
            <Text className="text-white text-lg font-semibold mt-4 text-center">
              No messages yet
            </Text>
            <Text className="text-slate-500 text-sm mt-2 text-center">
              Messages from your dispatcher will appear here.
            </Text>
          </View>
        ) : (
          /* Message list */
          <FlashList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            estimatedItemSize={60}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#94a3b8"
              />
            }
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: false })
            }}
          />
        )}

        {/* Subtle fetch error */}
        {fetchError && !loading && (
          <View className="px-4 py-2">
            <Text className="text-slate-500 text-xs text-center">{fetchError}</Text>
          </View>
        )}

        {/* Input area */}
        <View className="px-4 py-3 border-t border-slate-800 flex-row items-end gap-2">
          <TextInput
            className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-3 text-sm"
            placeholder="Type a message..."
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            className={`rounded-xl p-3 ${
              inputText.trim() && !sending ? 'bg-sky-500' : 'bg-slate-700'
            }`}
          >
            <Send
              size={20}
              color={inputText.trim() && !sending ? '#ffffff' : '#475569'}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
