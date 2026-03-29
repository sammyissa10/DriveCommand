import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { usePathname } from 'expo-router'
import { LifeBuoy } from 'lucide-react-native'
import { useSupportTicket } from '../../context/SupportTicketContext'

export function SupportTicketFAB() {
  const pathname = usePathname()
  const { open } = useSupportTicket()

  // Hide on pages that have Get Support built into their PageSpeedDial.
  // Expo Router strips group segments from pathnames, so (owner)/index → "/".
  const SPEED_DIAL_PAGES = new Set([
    '/',
    '/(owner)',
    '/(owner)/index',
    '/loads',
    '/loads/index',
    '/drivers',
    '/drivers/index',
    '/more/invoices',
    '/more/invoices/index',
    '/more/trucks',
    '/more/trucks/index',
    '/more/crm',
    '/more/crm/index',
  ])
  if (SPEED_DIAL_PAGES.has(pathname)) return null

  return (
    <Pressable
      style={styles.fab}
      onPress={open}
      accessibilityLabel="Open support ticket form"
      accessibilityRole="button"
    >
      <LifeBuoy color="#ffffff" size={22} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 88,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    // Android shadow
    elevation: 4,
    // iOS shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
})
