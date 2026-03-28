import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, MapPin, Megaphone, MessageSquare, Package, PenSquare, Send } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import {
  ownerApi,
  type ConversationMessage,
  type ConversationSummary,
  type DriverOption,
} from '@drivecommand/api-client'
import RecipientSelector, {
  type RecipientOption,
} from '../../../components/owner/RecipientSelector'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { haptic } from '../../../lib/haptics'
import { MessageSkeleton } from '../../../components/skeletons/MessageSkeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveConversation {
  recipientId: string
  recipientName: string
  isBroadcast: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  if (diffMs < 60_000) return 'just now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d`
  return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ---------------------------------------------------------------------------
// ConversationRow
// ---------------------------------------------------------------------------

interface ConversationRowProps {
  conversation: ConversationSummary
  onPress: () => void
}

function ConversationRow({ conversation, onPress }: ConversationRowProps) {
  const isLoad = typeof conversation.recipientId === 'string' && conversation.recipientId.startsWith('load:')
  const isRoute = typeof conversation.recipientId === 'string' && conversation.recipientId.startsWith('route:')

  let avatarBg = 'bg-slate-700'
  if (conversation.isBroadcast) avatarBg = 'bg-sky-600'
  else if (isLoad) avatarBg = 'bg-emerald-600'
  else if (isRoute) avatarBg = 'bg-amber-600'

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className="flex-row items-center px-4 py-3 border-b border-slate-800"
    >
      {/* Avatar */}
      <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${avatarBg}`}>
        {conversation.isBroadcast ? (
          <Megaphone size={18} color="#ffffff" />
        ) : isLoad ? (
          <Package size={18} color="#ffffff" />
        ) : isRoute ? (
          <MapPin size={18} color="#ffffff" />
        ) : (
          <Text className="text-white text-xs font-bold">
            {getInitials(conversation.recipientName)}
          </Text>
        )}
      </View>

      {/* Content */}
      <View className="flex-1 min-w-0">
        <Text className="text-sm font-semibold text-white" numberOfLines={1}>
          {conversation.recipientName}
        </Text>
        <Text className="text-xs text-slate-400 mt-0.5" numberOfLines={1}>
          {conversation.lastMessage}
        </Text>
      </View>

      {/* Timestamp */}
      <Text className="text-xs text-slate-500 ml-2 flex-shrink-0">
        {timeAgo(conversation.lastMessageAt)}
      </Text>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ConversationMessage
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isOwner = message.senderRole.toUpperCase() === 'OWNER'

  return (
    <View className={`mb-3 px-4 ${isOwner ? 'items-end' : 'items-start'}`}>
      <Text className="text-xs text-slate-400 mb-1">{message.senderName}</Text>
      <View
        className={`max-w-[80%] px-4 py-3 ${
          isOwner
            ? 'bg-sky-600 rounded-2xl rounded-br-sm'
            : 'bg-slate-700 rounded-2xl rounded-bl-sm'
        }`}
      >
        <Text className="text-white text-sm leading-5">{message.body}</Text>
      </View>
      <Text className="text-xs text-slate-500 mt-1">{formatTime(message.createdAt)}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function OwnerFleetScreen() {
  const { token } = useAuthContext()
  const queryClient = useQueryClient()
  const { driverId } = useLocalSearchParams<{ driverId?: string }>()

  const [activeConversation, setActiveConversation] = useState<ActiveConversation | null>(null)
  const [selectorVisible, setSelectorVisible] = useState(false)
  const [inputText, setInputText] = useState('')
  const [threadMessages, setThreadMessages] = useState<ConversationMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)

  const flatListRef = useRef<FlashList<ConversationMessage>>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const didPreSelect = useRef(false)

  // ---------------------------------------------------------------------------
  // Conversation list query
  // ---------------------------------------------------------------------------

  const {
    data: conversationsData,
    isLoading: convsLoading,
    refetch: refetchConvs,
    isRefetching: convsRefetching,
  } = useQuery({
    queryKey: ['fleet-conversations'],
    queryFn: () => ownerApi.getFleetConversations(token!),
    enabled: !!token,
  })

  const conversations: ConversationSummary[] = conversationsData?.conversations ?? []

  // ---------------------------------------------------------------------------
  // Active drivers (for RecipientSelector + driverId pre-select)
  // ---------------------------------------------------------------------------

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
      setActiveConversation({ recipientId: found.id, recipientName: found.name, isBroadcast: false })
      didPreSelect.current = true
    }
  }, [driverId, drivers])

  // ---------------------------------------------------------------------------
  // Thread query (when conversation is open)
  // ---------------------------------------------------------------------------

  const fetchThread = useCallback(async () => {
    if (!token || !activeConversation) return
    setThreadLoading(true)
    try {
      const data = await ownerApi.getConversationThread(token, activeConversation.recipientId)
      setThreadMessages(data.messages)
    } catch {
      // Silent background refresh failure
    } finally {
      setThreadLoading(false)
    }
  }, [token, activeConversation])

  useFocusEffect(
    useCallback(() => {
      if (activeConversation) {
        fetchThread()
      }
    }, [activeConversation, fetchThread])
  )

  // Initial thread load when conversation opens
  useEffect(() => {
    if (activeConversation) {
      setThreadMessages([])
      setThreadLoading(true)
      fetchThread()
    }
  }, [activeConversation?.recipientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom when thread messages change
  useEffect(() => {
    if (threadMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [threadMessages.length])

  // Poll every 15s when in chat view
  useEffect(() => {
    if (!activeConversation) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      return
    }

    pollTimerRef.current = setInterval(() => {
      fetchThread()
    }, 15_000)

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [activeConversation, fetchThread])

  // ---------------------------------------------------------------------------
  // Send mutation
  // ---------------------------------------------------------------------------

  const { mutate: sendMessage, isPending: isSending } = useMutation({
    mutationFn: (body: string) => {
      if (!activeConversation) throw new Error('No active conversation')
      return ownerApi.sendConversationMessage(token!, activeConversation.recipientId, body)
    },
    onSuccess: (data) => {
      haptic.success()
      setThreadMessages((prev) => [...prev, data.message])
      setInputText('')
      queryClient.invalidateQueries({ queryKey: ['fleet-conversations'] })
    },
    onError: (err: Error, variables) => {
      haptic.error()
      setInputText(variables)
      Alert.alert('Send failed', err.message ?? 'Could not send message. Try again.')
    },
  })

  function handleSend() {
    const text = inputText.trim()
    if (!text || isSending) return
    sendMessage(text)
  }

  // ---------------------------------------------------------------------------
  // Recipient selector
  // ---------------------------------------------------------------------------

  function handleRecipientSelect(r: RecipientOption) {
    setSelectorVisible(false)
    setActiveConversation({
      recipientId: r.isBroadcast ? 'broadcast' : (r.id ?? 'broadcast'),
      recipientName: r.name,
      isBroadcast: r.isBroadcast,
    })
  }

  // ---------------------------------------------------------------------------
  // Render: Conversation List
  // ---------------------------------------------------------------------------

  if (!activeConversation) {
    return (
      <SafeAreaView className="flex-1 bg-slate-900" edges={['top']}>
        <AnimatedScreen>
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
            <Text className="text-2xl font-bold text-white">Messages</Text>
            <TouchableOpacity
              accessibilityLabel="Compose message"
              accessibilityRole="button"
              onPress={() => setSelectorVisible(true)}
              className="w-9 h-9 items-center justify-center rounded-xl bg-slate-800"
              hitSlop={8}
            >
              <PenSquare size={18} color="#38bdf8" />
            </TouchableOpacity>
          </View>

          {/* List */}
          {convsLoading ? (
            <View>
              <MessageSkeleton isDriver={false} />
              <MessageSkeleton isDriver={false} />
              <MessageSkeleton isDriver={false} />
              <MessageSkeleton isDriver={false} />
            </View>
          ) : conversations.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <MessageSquare color="#334155" size={52} />
              <Text className="text-white text-lg font-semibold mt-4 text-center">
                No conversations yet
              </Text>
              <Text className="text-slate-500 text-sm mt-2 text-center">
                Tap the compose button to start messaging
              </Text>
            </View>
          ) : (
            <FlashList
              data={conversations}
              keyExtractor={(item) =>
                item.isBroadcast ? 'broadcast' : (item.recipientId ?? 'unknown')
              }
              estimatedItemSize={68}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={convsRefetching}
                  onRefresh={refetchConvs}
                  tintColor="#38bdf8"
                  colors={['#38bdf8']}
                />
              }
              renderItem={({ item }) => (
                <ConversationRow
                  conversation={item}
                  onPress={() =>
                    setActiveConversation({
                      recipientId: item.isBroadcast ? 'broadcast' : (item.recipientId ?? 'broadcast'),
                      recipientName: item.recipientName,
                      isBroadcast: item.isBroadcast,
                    })
                  }
                />
              )}
            />
          )}

          {/* Recipient selector bottom sheet */}
          <RecipientSelector
            visible={selectorVisible}
            onSelect={handleRecipientSelect}
            onClose={() => setSelectorVisible(false)}
            drivers={drivers}
            loading={driversLoading}
          />
        </AnimatedScreen>
      </SafeAreaView>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: Chat Detail
  // ---------------------------------------------------------------------------

  const canSend = inputText.trim().length > 0 && !isSending

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['top']}>
      <AnimatedScreen>
        {/* Header bar */}
        <View className="flex-row items-center bg-slate-900 border-b border-slate-800 py-3 px-4">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => setActiveConversation(null)}
            className="mr-2 p-1"
            hitSlop={8}
          >
            <ChevronLeft size={24} color="#94a3b8" />
          </Pressable>
          <Text className="flex-1 text-lg font-semibold text-white text-center mr-8" numberOfLines={1}>
            {activeConversation.recipientName}
          </Text>
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Loading state */}
          {threadLoading ? (
            <View className="flex-1 pt-2">
              <MessageSkeleton isDriver={false} />
              <MessageSkeleton isDriver={true} />
              <MessageSkeleton isDriver={false} />
              <MessageSkeleton isDriver={true} />
            </View>
          ) : threadMessages.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <MessageSquare color="#334155" size={44} />
              <Text className="text-slate-500 text-sm mt-3 text-center">
                No messages yet. Say hello!
              </Text>
            </View>
          ) : (
            <FlashList
              ref={flatListRef}
              data={threadMessages}
              keyExtractor={(item) => item.id}
              estimatedItemSize={70}
              renderItem={({ item }) => <MessageBubble message={item} />}
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
              onContentSizeChange={() => {
                flatListRef.current?.scrollToEnd({ animated: false })
              }}
            />
          )}

          {/* Input bar */}
          <View className="px-4 py-3 border-t border-slate-800 flex-row items-end gap-2">
            <TextInput
              className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-3 text-sm"
              placeholder="Type a message..."
              placeholderTextColor="#64748b"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              returnKeyType="default"
            />
            <TouchableOpacity
              accessibilityLabel="Send message"
              accessibilityRole="button"
              onPress={handleSend}
              disabled={!canSend}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              className={`rounded-xl p-3 ${canSend ? 'bg-sky-500' : 'bg-slate-700'}`}
            >
              <Send size={20} color={canSend ? '#ffffff' : '#475569'} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
