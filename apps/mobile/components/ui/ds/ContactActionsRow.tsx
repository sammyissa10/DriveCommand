import React from 'react'
import { View, Linking } from 'react-native'
import { Phone, MessageSquare, Mail, type LucideIcon } from 'lucide-react-native'
import { Text } from './Text'
import { Icon } from './Icon'
import { Pressable } from './Pressable'
import { icon } from './tokens'

export interface ContactActionsRowProps {
  phone?: string | null
  email?: string | null
}

interface Action {
  key: string
  icon: LucideIcon
  label: string
  url: string
}

function ActionCard({ action }: { action: Action }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(action.url)}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      className="h-[68px] flex-1 items-center justify-center gap-1 rounded-[20px] bg-ds-card"
    >
      <Icon icon={action.icon} size={icon.lg} className="text-ds-accent" />
      <Text variant="caption" className="text-ds-txt">
        {action.label}
      </Text>
    </Pressable>
  )
}

/**
 * Call / Message / Mail cards wired to native deep links (tel:, sms:, mailto:).
 * Only actions with a value render. Reachable with a thumb without scrolling.
 */
export function ContactActionsRow({ phone, email }: ContactActionsRowProps) {
  const actions: Action[] = []
  if (phone) {
    actions.push({ key: 'call', icon: Phone, label: 'Call', url: `tel:${phone}` })
    actions.push({ key: 'sms', icon: MessageSquare, label: 'Message', url: `sms:${phone}` })
  }
  if (email) {
    actions.push({ key: 'mail', icon: Mail, label: 'Mail', url: `mailto:${email}` })
  }
  if (actions.length === 0) return null

  return (
    <View className="flex-row gap-3">
      {actions.map((a) => (
        <ActionCard key={a.key} action={a} />
      ))}
    </View>
  )
}
