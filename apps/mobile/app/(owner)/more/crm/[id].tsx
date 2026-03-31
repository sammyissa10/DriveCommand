import React, { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, Pencil } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../../context/AuthContext'
import {
  ownerApi,
  type CrmContactDetail,
  type UpdateCrmContactPayload,
} from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import { haptic } from '../../../../lib/haptics'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return '#22c55e'
    case 'INACTIVE': return '#64748b'
    case 'PROSPECT': return '#38bdf8'
    default: return '#64748b'
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'VIP': return '#f59e0b'
    case 'HIGH': return '#ef4444'
    case 'MEDIUM': return '#38bdf8'
    case 'LOW': return '#64748b'
    default: return '#64748b'
  }
}

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </Text>
  )
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
      <Text style={{ color: '#64748b', fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: valueColor ?? '#f1f5f9', fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1 }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Form helpers for edit sheet
// ---------------------------------------------------------------------------

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}{required && <Text style={{ color: '#f87171' }}> *</Text>}
      </Text>
      {children}
    </View>
  )
}

const inputStyle = {
  backgroundColor: '#1e293b',
  borderWidth: 1,
  borderColor: '#334155',
  color: '#f1f5f9',
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 11,
  fontSize: 14,
} as const

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'VIP'] as const
const STATUSES = ['ACTIVE', 'INACTIVE', 'PROSPECT'] as const

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CrmContactDetailScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [editVisible, setEditVisible] = useState(false)

  // Form state for edit sheet
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [status, setStatus] = useState('ACTIVE')
  const [notes, setNotes] = useState('')
  const [emailNotifications, setEmailNotifications] = useState(true)

  const { data, isLoading, isError, error, refetch } = useQuery<CrmContactDetail>({
    queryKey: ['crm-contact', id],
    queryFn: () => ownerApi.getCrmContact(token!, id),
    enabled: !!token && !!id,
    staleTime: 60_000,
  })

  const { mutate: updateContact, isPending: updating } = useMutation({
    mutationFn: () => {
      const payload: UpdateCrmContactPayload = {}
      if (companyName.trim()) payload.companyName = companyName.trim()
      if (contactName !== (data?.contactName ?? '')) payload.contactName = contactName.trim() || undefined
      if (email !== (data?.email ?? '')) payload.email = email.trim() || undefined
      if (phone !== (data?.phone ?? '')) payload.phone = phone.trim() || undefined
      if (address !== (data?.address ?? '')) payload.address = address.trim() || undefined
      if (city !== (data?.city ?? '')) payload.city = city.trim() || undefined
      if (state !== (data?.state ?? '')) payload.state = state.trim() || undefined
      if (zipCode !== (data?.zipCode ?? '')) payload.zipCode = zipCode.trim() || undefined
      if (priority !== data?.priority) payload.priority = priority
      if (status !== data?.status) payload.status = status
      if (notes !== (data?.notes ?? '')) payload.notes = notes.trim() || undefined
      if (emailNotifications !== data?.emailNotifications) payload.emailNotifications = emailNotifications

      // Always include all fields for full update
      return ownerApi.updateCrmContact(token!, id, {
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
        priority,
        status,
        notes: notes.trim() || undefined,
        emailNotifications,
      })
    },
    onSuccess: () => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['crm-contact', id] })
      queryClient.invalidateQueries({ queryKey: ['owner-crm'] })
      Toast.show({ type: 'success', text1: 'Customer updated', visibilityTime: 3000 })
      setEditVisible(false)
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Failed to update', text2: err.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  function openEditSheet() {
    if (!data) return
    setCompanyName(data.companyName)
    setContactName(data.contactName ?? '')
    setEmail(data.email ?? '')
    setPhone(data.phone ?? '')
    setAddress(data.address ?? '')
    setCity(data.city ?? '')
    setState(data.state ?? '')
    setZipCode(data.zipCode ?? '')
    setPriority(data.priority)
    setStatus(data.status)
    setNotes(data.notes ?? '')
    setEmailNotifications(data.emailNotifications)
    setEditVisible(true)
  }

  function handleSave() {
    if (!companyName.trim()) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Company name cannot be empty.', visibilityTime: 3000 })
      return
    }
    updateContact()
  }

  const statusColor = data ? getStatusColor(data.status) : '#64748b'
  const priorityColor = data ? getPriorityColor(data.priority) : '#64748b'

  const addressParts = data
    ? [data.address, data.city, data.state, data.zipCode].filter(Boolean).join(', ')
    : null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#334155',
          }}
        >
          <Pressable onPress={() => router.back()} style={{ marginRight: 12 }} hitSlop={8}>
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9', flex: 1 }} numberOfLines={1}>
            {data?.companyName ?? 'Customer'}
          </Text>
          {data && (
            <Pressable
              onPress={openEditSheet}
              hitSlop={8}
              style={{ padding: 6 }}
              accessibilityLabel="Edit customer"
              accessibilityRole="button"
            >
              <Pencil color="#94a3b8" size={20} />
            </Pressable>
          )}
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#38bdf8" size="large" />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <AlertTriangle color="#f87171" size={40} />
            <Text style={{ color: '#f1f5f9', fontSize: 17, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
              Failed to load customer
            </Text>
            <Text style={{ color: '#64748b', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={{ marginTop: 20, backgroundColor: '#0ea5e9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </View>
        ) : data ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}>

            {/* Contact Information */}
            <SectionLabel>Contact Information</SectionLabel>
            <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 16, marginBottom: 20 }}>
              <DetailRow label="Company" value={data.companyName} />
              {data.contactName && <DetailRow label="Contact" value={data.contactName} />}
              {data.email && <DetailRow label="Email" value={data.email} />}
              {data.phone && <DetailRow label="Phone" value={data.phone} />}
              {addressParts && <DetailRow label="Address" value={addressParts} />}
            </View>

            {/* Business Details */}
            <SectionLabel>Business Details</SectionLabel>
            <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 16, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
                <Text style={{ color: '#64748b', fontSize: 13 }}>Status</Text>
                <View style={{ backgroundColor: statusColor + '22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ color: statusColor, fontSize: 12, fontWeight: '700' }}>{data.status}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
                <Text style={{ color: '#64748b', fontSize: 13 }}>Priority</Text>
                <View style={{ backgroundColor: priorityColor + '22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ color: priorityColor, fontSize: 12, fontWeight: '700' }}>{data.priority}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                <Text style={{ color: '#64748b', fontSize: 13 }}>Email Notifications</Text>
                <Text style={{ color: data.emailNotifications ? '#22c55e' : '#64748b', fontSize: 13, fontWeight: '600' }}>
                  {data.emailNotifications ? 'Yes' : 'No'}
                </Text>
              </View>
            </View>

            {/* Performance */}
            {data.totalLoads > 0 && (
              <>
                <SectionLabel>Performance</SectionLabel>
                <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 16, marginBottom: 20 }}>
                  <DetailRow label="Total Loads" value={String(data.totalLoads)} />
                  <DetailRow label="Total Revenue" value={formatCurrency(data.totalRevenue)} valueColor="#22c55e" />
                  {data.lastLoadDate && <DetailRow label="Last Load" value={formatDate(data.lastLoadDate)} />}
                </View>
              </>
            )}

            {/* Notes */}
            {data.notes && (
              <>
                <SectionLabel>Notes</SectionLabel>
                <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 16, marginBottom: 20 }}>
                  <Text style={{ color: '#f1f5f9', fontSize: 13, lineHeight: 20 }}>{data.notes}</Text>
                </View>
              </>
            )}

          </ScrollView>
        ) : null}

        {/* Edit Bottom Sheet */}
        <BottomSheet
          visible={editVisible}
          onClose={() => setEditVisible(false)}
          title="Edit Customer"
          snapPoint="80%"
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            <FormField label="Company Name" required>
              <TextInput
                style={inputStyle}
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="Company name"
                placeholderTextColor="#475569"
                autoCapitalize="words"
                editable={!updating}
              />
            </FormField>

            <FormField label="Contact Name">
              <TextInput
                style={inputStyle}
                value={contactName}
                onChangeText={setContactName}
                placeholder="Contact person"
                placeholderTextColor="#475569"
                autoCapitalize="words"
                editable={!updating}
              />
            </FormField>

            <FormField label="Email">
              <TextInput
                style={inputStyle}
                value={email}
                onChangeText={setEmail}
                placeholder="email@company.com"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!updating}
              />
            </FormField>

            <FormField label="Phone">
              <TextInput
                style={inputStyle}
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 (555) 000-0000"
                placeholderTextColor="#475569"
                keyboardType="phone-pad"
                editable={!updating}
              />
            </FormField>

            <FormField label="Address">
              <TextInput
                style={inputStyle}
                value={address}
                onChangeText={setAddress}
                placeholder="Street address"
                placeholderTextColor="#475569"
                autoCapitalize="words"
                editable={!updating}
              />
            </FormField>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 2 }}>
                <FormField label="City">
                  <TextInput
                    style={inputStyle}
                    value={city}
                    onChangeText={setCity}
                    placeholder="City"
                    placeholderTextColor="#475569"
                    autoCapitalize="words"
                    editable={!updating}
                  />
                </FormField>
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="State">
                  <TextInput
                    style={inputStyle}
                    value={state}
                    onChangeText={setState}
                    placeholder="TX"
                    placeholderTextColor="#475569"
                    autoCapitalize="characters"
                    editable={!updating}
                  />
                </FormField>
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="ZIP">
                  <TextInput
                    style={inputStyle}
                    value={zipCode}
                    onChangeText={setZipCode}
                    placeholder="75001"
                    placeholderTextColor="#475569"
                    keyboardType="numbers-and-punctuation"
                    editable={!updating}
                  />
                </FormField>
              </View>
            </View>

            {/* Priority picker */}
            <FormField label="Priority">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PRIORITIES.map((p) => {
                  const color = getPriorityColor(p)
                  const selected = priority === p
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setPriority(p)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 20,
                        backgroundColor: selected ? color + '33' : '#1e293b',
                        borderWidth: 1,
                        borderColor: selected ? color : '#334155',
                      }}
                    >
                      <Text style={{ color: selected ? color : '#94a3b8', fontSize: 13, fontWeight: '600' }}>{p}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </FormField>

            {/* Status picker */}
            <FormField label="Status">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {STATUSES.map((s) => {
                  const color = getStatusColor(s)
                  const selected = status === s
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setStatus(s)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 20,
                        backgroundColor: selected ? color + '33' : '#1e293b',
                        borderWidth: 1,
                        borderColor: selected ? color : '#334155',
                      }}
                    >
                      <Text style={{ color: selected ? color : '#94a3b8', fontSize: 13, fontWeight: '600' }}>{s}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </FormField>

            <FormField label="Notes">
              <TextInput
                style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any notes..."
                placeholderTextColor="#475569"
                multiline
                numberOfLines={3}
                editable={!updating}
              />
            </FormField>

            {/* Email Notifications toggle */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600' }}>Email Notifications</Text>
              <Switch
                value={emailNotifications}
                onValueChange={setEmailNotifications}
                trackColor={{ false: '#334155', true: '#0ea5e940' }}
                thumbColor={emailNotifications ? '#0ea5e9' : '#64748b'}
                disabled={updating}
              />
            </View>

            {/* Save button */}
            <Pressable
              onPress={handleSave}
              disabled={updating}
              style={{
                backgroundColor: updating ? '#1e3a5f' : '#0ea5e9',
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: updating ? 0.7 : 1,
              }}
            >
              {updating ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Save Changes</Text>
              )}
            </Pressable>
          </ScrollView>
        </BottomSheet>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
