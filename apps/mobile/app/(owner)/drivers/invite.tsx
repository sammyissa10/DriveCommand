import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi } from '@drivecommand/api-client'
import { haptic } from '../../../lib/haptics'

const inputStyle = {
  backgroundColor: '#1e293b',
  borderWidth: 1,
  borderColor: '#334155',
  color: '#fff',
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 14,
  fontSize: 14,
} as const

const labelStyle = {
  color: '#94a3b8',
  fontSize: 11,
  fontWeight: '600' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  marginBottom: 6,
}

export default function InviteDriverScreen() {
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const { token } = useAuthContext()

  function goBack() {
    if (from === 'dashboard') router.replace('/(owner)/' as any)
    else router.back()
  }

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')

  const { mutate: invite, isPending } = useMutation({
    mutationFn: () =>
      ownerApi.inviteDriver(token!, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        ...(licenseNumber.trim() ? { licenseNumber: licenseNumber.trim() } : {}),
      }),
    onSuccess: () => {
      haptic.success()
      Toast.show({
        type: 'success',
        text1: 'Invitation sent',
        text2: `${firstName} will receive an email to join.`,
        visibilityTime: 3000,
      })
      goBack()
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Failed to invite',
        text2: err.message || 'Please try again.',
        visibilityTime: 4000,
      })
    },
  })

  function handleSubmit() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Missing fields',
        text2: 'First name, last name and email are required.',
        visibilityTime: 3000,
      })
      return
    }
    invite()
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
        <Pressable
          onPress={goBack}
          disabled={isPending}
          hitSlop={8}
          style={{ marginRight: 12 }}
        >
          <ChevronLeft color="#f1f5f9" size={24} />
        </Pressable>
        <Text style={{ color: '#f1f5f9', fontSize: 18, fontWeight: '700', flex: 1 }}>Invite Driver</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Driver Info */}
          <View style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
              Driver Information
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>First Name <Text style={{ color: '#f87171' }}>*</Text></Text>
                <TextInput
                  style={inputStyle}
                  placeholder="John"
                  placeholderTextColor="#475569"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  editable={!isPending}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Last Name <Text style={{ color: '#f87171' }}>*</Text></Text>
                <TextInput
                  style={inputStyle}
                  placeholder="Smith"
                  placeholderTextColor="#475569"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  editable={!isPending}
                />
              </View>
            </View>

            <View style={{ marginBottom: 14 }}>
              <Text style={labelStyle}>Email <Text style={{ color: '#f87171' }}>*</Text></Text>
              <TextInput
                style={inputStyle}
                placeholder="driver@example.com"
                placeholderTextColor="#475569"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPending}
              />
            </View>

            <View>
              <Text style={labelStyle}>License Number <Text style={{ color: '#475569', fontWeight: '400', textTransform: 'none' }}>(optional)</Text></Text>
              <TextInput
                style={inputStyle}
                placeholder="DL-12345"
                placeholderTextColor="#475569"
                value={licenseNumber}
                onChangeText={setLicenseNumber}
                autoCapitalize="characters"
                editable={!isPending}
              />
            </View>
          </View>

          <Text style={{ color: '#475569', fontSize: 12, textAlign: 'center', marginBottom: 24, lineHeight: 18 }}>
            The driver will receive an email invitation to create their account and join your fleet.
          </Text>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={isPending}
            style={{
              backgroundColor: isPending ? '#0c4a6e' : '#0284c7',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending
              ? <ActivityIndicator size="small" color="white" />
              : <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Send Invitation</Text>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
