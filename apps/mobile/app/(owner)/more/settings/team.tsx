import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Crown, Mail, Send, Shield, Truck, UserPlus, X } from 'lucide-react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi } from '@drivecommand/api-client'
import { haptic } from '../../../../lib/haptics'

// ---------------------------------------------------------------------------
// Role reference data
// ---------------------------------------------------------------------------

const ROLES = [
  {
    icon: Crown,
    color: '#f59e0b',
    label: 'Owner',
    description: 'Full access to all features, billing, and account settings. One per account.',
    abilities: ['All operational features', 'Team invitations', 'Billing & subscription', 'Account settings'],
  },
  {
    icon: Shield,
    color: '#38bdf8',
    label: 'Manager',
    description: 'Manages drivers, loads, routes, and compliance. No billing access.',
    abilities: ['Drivers & loads management', 'Routes & dispatch', 'Compliance monitoring', 'CRM & invoices'],
  },
  {
    icon: Truck,
    color: '#22c55e',
    label: 'Driver',
    description: 'Mobile app only. Views assigned loads, logs HOS, reports incidents.',
    abilities: ['View assigned loads', 'HOS logging', 'Incident reporting', 'Fleet messaging'],
  },
]

// ---------------------------------------------------------------------------
// Invite modal
// ---------------------------------------------------------------------------

interface InviteForm {
  firstName: string
  lastName: string
  email: string
  licenseNumber: string
}

interface InviteModalProps {
  visible: boolean
  onClose: () => void
  token: string
}

function InviteModal({ visible, onClose, token }: InviteModalProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<InviteForm>({
    firstName: '',
    lastName: '',
    email: '',
    licenseNumber: '',
  })

  const mutation = useMutation({
    mutationFn: () =>
      ownerApi.inviteDriver(token, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        licenseNumber: form.licenseNumber.trim() || undefined,
      }),
    onSuccess: (data) => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['owner-drivers'] })
      const msg = data.emailSent
        ? `Invitation sent to ${form.email.trim().toLowerCase()}`
        : `Invitation created but the email could not be sent. Check email configuration.`
      Alert.alert('Invitation Sent', msg, [
        {
          text: 'OK',
          onPress: () => {
            setForm({ firstName: '', lastName: '', email: '', licenseNumber: '' })
            onClose()
          },
        },
      ])
    },
    onError: (err: Error) => {
      haptic.error()
      Alert.alert('Failed to Send', err.message || 'Something went wrong. Please try again.')
    },
  })

  function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      Alert.alert('Missing Fields', 'First name, last name, and email are required.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.')
      return
    }
    haptic.light()
    mutation.mutate()
  }

  function handleClose() {
    if (mutation.isPending) return
    setForm({ firstName: '', lastName: '', email: '', licenseNumber: '' })
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Modal header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#334155',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <UserPlus color="#38bdf8" size={20} />
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>Invite Driver</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12} disabled={mutation.isPending}>
              <X color="#64748b" size={22} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name row */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>First Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Miguel"
                  placeholderTextColor="#475569"
                  value={form.firstName}
                  onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
                  autoCapitalize="words"
                  returnKeyType="next"
                  editable={!mutation.isPending}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Last Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Santos"
                  placeholderTextColor="#475569"
                  value={form.lastName}
                  onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
                  autoCapitalize="words"
                  returnKeyType="next"
                  editable={!mutation.isPending}
                />
              </View>
            </View>

            {/* Email */}
            <View>
              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="driver@example.com"
                placeholderTextColor="#475569"
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={!mutation.isPending}
              />
            </View>

            {/* License number */}
            <View>
              <Text style={styles.label}>CDL / License Number</Text>
              <TextInput
                style={styles.input}
                placeholder="TX-DL-123456 (optional)"
                placeholderTextColor="#475569"
                value={form.licenseNumber}
                onChangeText={(v) => setForm((f) => ({ ...f, licenseNumber: v }))}
                autoCapitalize="characters"
                returnKeyType="done"
                editable={!mutation.isPending}
              />
            </View>

            {/* Info note */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 10,
              backgroundColor: '#1e293b',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#334155',
              padding: 12,
            }}>
              <Mail color="#38bdf8" size={16} style={{ marginTop: 1 }} />
              <Text style={{ color: '#64748b', fontSize: 13, lineHeight: 20, flex: 1 }}>
                The driver will receive an email to set their password and activate their account. The link expires in 30 days.
              </Text>
            </View>

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={mutation.isPending}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: pressed || mutation.isPending ? '#0284c7' : '#0ea5e9',
                borderRadius: 12,
                paddingVertical: 14,
                marginTop: 4,
              })}
            >
              {mutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Send color="#fff" size={18} />
              )}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                {mutation.isPending ? 'Sending…' : 'Send Invitation'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function TeamPermissionsScreen() {
  const router = useRouter()
  const { token } = useAuthContext()
  const [showInvite, setShowInvite] = useState(false)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#334155',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={() => router.back()} style={{ marginRight: 12 }} hitSlop={8}>
              <ChevronLeft color="#f1f5f9" size={24} />
            </Pressable>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>Team & Permissions</Text>
          </View>

          {/* Invite button */}
          <Pressable
            onPress={() => { haptic.light(); setShowInvite(true) }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: pressed ? '#0284c7' : '#0ea5e9',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
            })}
          >
            <UserPlus color="#fff" size={15} />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Invite</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Intro */}
          <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 }}>
            <Text style={{ color: '#94a3b8', fontSize: 14, lineHeight: 22 }}>
              Invite drivers to join your fleet. They'll receive an email to set up their account and access the DriveCommand driver app.
            </Text>
          </View>

          {/* Invite CTA card */}
          <Pressable
            onPress={() => { haptic.light(); setShowInvite(true) }}
            style={({ pressed }) => ({
              marginHorizontal: 16,
              marginBottom: 24,
              backgroundColor: pressed ? '#1a2d45' : '#1e293b',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#0ea5e9',
              padding: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            })}
          >
            <View style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#0ea5e920',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <UserPlus color="#0ea5e9" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 16 }}>Invite a Driver</Text>
              <Text style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                Send an email invite to add them to your fleet
              </Text>
            </View>
            <Text style={{ color: '#475569', fontSize: 20 }}>›</Text>
          </Pressable>

          {/* Role reference */}
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={{
              color: '#94a3b8',
              fontSize: 12,
              fontWeight: '600',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              marginBottom: 14,
            }}>
              Role Reference
            </Text>

            {ROLES.map((role) => (
              <View
                key={role.label}
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#334155',
                  padding: 18,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: role.color + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}>
                    <role.icon color={role.color} size={19} />
                  </View>
                  <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 16 }}>{role.label}</Text>
                </View>

                <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 20, marginBottom: 12 }}>
                  {role.description}
                </Text>

                <View style={{ gap: 6 }}>
                  {role.abilities.map((ability) => (
                    <View key={ability} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: role.color }} />
                      <Text style={{ color: '#64748b', fontSize: 13 }}>{ability}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </AnimatedScreen>

      <InviteModal visible={showInvite} onClose={() => setShowInvite(false)} token={token!} />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  label: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f1f5f9',
    fontSize: 15,
  },
}
