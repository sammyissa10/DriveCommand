import React from 'react'
import { Text, View } from 'react-native'
import type { FleetMessage } from '@drivecommand/api-client'

export function formatMessageTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function getSenderLabel(senderRole: string): string {
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

export interface MessageBubbleProps {
  message: FleetMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isDriver = message.senderRole.toUpperCase() === 'DRIVER'

  return (
    <View className={`mb-3 px-4 ${isDriver ? 'items-end' : 'items-start'}`}>
      <Text className="text-xs text-slate-400 mb-1">
        {getSenderLabel(message.senderRole)}
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
        {formatMessageTime(message.createdAt)}
      </Text>
    </View>
  )
}
