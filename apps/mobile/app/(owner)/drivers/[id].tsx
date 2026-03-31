import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FileText,
  Mail,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type OwnerDriverDetail, type OwnerDriverDocument, type UpdateDriverPayload } from '@drivecommand/api-client'
import { Badge } from '../../../components/ui/Badge'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { Skeleton } from '../../../components/ui/Skeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { haptic } from '../../../lib/haptics'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getAvatarColor(name: string): string {
  const COLORS = [
    '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981',
    '#ef4444', '#ec4899', '#06b6d4', '#f97316',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function getHOSInfo(hosStatus: string | null): { label: string; color: string } {
  switch (hosStatus) {
    case 'DRIVING':      return { label: 'Driving',  color: '#22c55e' }
    case 'ON_DUTY':      return { label: 'On Duty',  color: '#38bdf8' }
    case 'SLEEPER_BERTH':return { label: 'Sleeper',  color: '#8b5cf6' }
    default:             return { label: 'Off Duty', color: '#475569' }
  }
}

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':    return { label: 'Pending',    variant: 'muted' }
    case 'DISPATCHED': return { label: 'Accepted',   variant: 'info' }
    case 'PICKED_UP':  return { label: 'Picked Up',  variant: 'warning' }
    case 'IN_TRANSIT': return { label: 'En Route',   variant: 'warning' }
    case 'DELIVERED':  return { label: 'Delivered',  variant: 'success' }
    case 'INVOICED':   return { label: 'Invoiced',   variant: 'success' }
    case 'CANCELLED':  return { label: 'Cancelled',  variant: 'danger' }
    default:           return { label: status,       variant: 'muted' }
  }
}

function getDocBadge(status: OwnerDriverDocument['status']): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'EXPIRED':  return { label: 'Expired',       variant: 'danger' }
    case 'EXPIRING': return { label: 'Expiring Soon', variant: 'warning' }
    default:         return { label: 'Valid',          variant: 'success' }
  }
}

function getIncidentSeverityColor(severity: string): string {
  switch (severity) {
    case 'HIGH':   return '#ef4444'
    case 'MEDIUM': return '#f59e0b'
    default:       return '#64748b'
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '—' }
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

/** Parse a full name string into firstName / lastName parts. */
function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ title }: { title: string }) {
  return (
    <Text style={{
      color: '#475569',
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 24,
      paddingHorizontal: 16,
    }}>
      {title}
    </Text>
  )
}

// ---------------------------------------------------------------------------
// EditDriverSheet
// ---------------------------------------------------------------------------

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

interface EditDriverSheetProps {
  visible: boolean
  onClose: () => void
  initialData: { firstName: string; lastName: string; licenseNumber: string | null }
  onSave: (payload: UpdateDriverPayload) => void
  isPending: boolean
}

function EditDriverSheet({ visible, onClose, initialData, onSave, isPending }: EditDriverSheetProps) {
  const [firstName, setFirstName] = useState(initialData.firstName)
  const [lastName, setLastName] = useState(initialData.lastName)
  const [licenseNumber, setLicenseNumber] = useState(initialData.licenseNumber ?? '')

  useEffect(() => {
    if (visible) {
      setFirstName(initialData.firstName)
      setLastName(initialData.lastName)
      setLicenseNumber(initialData.licenseNumber ?? '')
    }
  }, [visible])

  function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Missing fields',
        text2: 'First name and last name are required.',
        visibilityTime: 3000,
      })
      return
    }
    const payload: UpdateDriverPayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      licenseNumber: licenseNumber.trim() || null,
    }
    onSave(payload)
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit Driver" snapPoint="80%">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {/* First Name + Last Name row */}
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

          {/* License Number */}
          <View style={{ marginBottom: 24 }}>
            <Text style={labelStyle}>
              License Number{' '}
              <Text style={{ color: '#475569', fontWeight: '400', textTransform: 'none' }}>(optional)</Text>
            </Text>
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

          {/* Save button */}
          <Pressable
            onPress={handleSave}
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
              : <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Save Changes</Text>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DriverDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { token } = useAuthContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [editSheetVisible, setEditSheetVisible] = useState(false)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<OwnerDriverDetail>({
    queryKey: ['owner-driver-detail', id],
    queryFn: () => ownerApi.getDriverDetail(token!, id!),
    enabled: !!token && !!id,
  })

  const { mutate: updateDriver, isPending: isUpdating } = useMutation({
    mutationFn: (payload: UpdateDriverPayload) => ownerApi.updateDriver(token!, id!, payload),
    onSuccess: () => {
      haptic.success()
      queryClient.invalidateQueries({ queryKey: ['owner-driver-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['owner-drivers'] })
      Toast.show({
        type: 'success',
        text1: 'Driver updated',
        text2: 'Changes saved successfully.',
        visibilityTime: 3000,
      })
      setEditSheetVisible(false)
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: err.message || 'Please try again.',
        visibilityTime: 4000,
      })
    },
  })

  const onRefresh = useCallback(() => refetch(), [refetch])

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12, gap: 12 }}>
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={160} height={18} />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, alignItems: 'center', gap: 10 }}>
          <Skeleton width={72} height={72} borderRadius={36} />
          <Skeleton width={140} height={20} />
          <Skeleton width={70} height={22} borderRadius={11} />
        </View>
        <View style={{ paddingTop: 24, gap: 8 }}>
          <Skeleton width={100} height={11} style={{ marginLeft: 16 }} />
          <Skeleton width="92%" height={72} borderRadius={12} style={{ marginHorizontal: 16 }} />
          <Skeleton width={140} height={11} style={{ marginLeft: 16, marginTop: 16 }} />
          <Skeleton width="92%" height={52} borderRadius={12} style={{ marginHorizontal: 16 }} />
        </View>
      </SafeAreaView>
    )
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <AlertTriangle color="#f87171" size={40} />
        <Text style={{ color: '#f1f5f9', fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>Failed to load driver</Text>
        <Text style={{ color: '#64748b', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </Text>
        <Pressable onPress={() => refetch()} style={{ marginTop: 20, backgroundColor: '#0ea5e9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const avatarColor = getAvatarColor(data.name)
  const initials = getInitials(data.name)
  const { label: hosLabel, color: hosColor } = getHOSInfo(data.hosStatus)
  const displayName = toTitleCase(data.name)

  const ComplianceIcon = data.complianceStatus === 'critical' ? ShieldX : data.complianceStatus === 'warning' ? ShieldAlert : ShieldCheck
  const complianceColor = data.complianceStatus === 'critical' ? '#ef4444' : data.complianceStatus === 'warning' ? '#f59e0b' : '#22c55e'

  const { firstName: parsedFirstName, lastName: parsedLastName } = parseName(data.name)

  // The API doesn't return licenseNumber in OwnerDriverDetail — we pass null as initial
  // The PATCH will update it; on success the detail refreshes via query invalidation
  const editInitialData = {
    firstName: parsedFirstName,
    lastName: parsedLastName,
    licenseNumber: null as string | null,
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Nav bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#1e293b',
        }}>
          <Pressable
            onPress={() => { haptic.light(); router.back() }}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginRight: 10 })}
          >
            <ArrowLeft color="#94a3b8" size={22} />
          </Pressable>
          <Text style={{ color: '#94a3b8', fontSize: 15, fontWeight: '500', flex: 1 }} numberOfLines={1}>
            Drivers
          </Text>
          {/* Edit button */}
          <Pressable
            onPress={() => { haptic.light(); setEditSheetVisible(true) }}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginRight: 12 })}
          >
            <Pencil color="#94a3b8" size={18} />
          </Pressable>
          <ComplianceIcon color={complianceColor} size={20} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#38bdf8" colors={['#38bdf8']} />
          }
        >
          {/* Profile header */}
          <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 16 }}>
            <View style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: avatarColor + '20',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}>
              <Text style={{ color: avatarColor, fontWeight: '700', fontSize: 26 }}>{initials}</Text>
            </View>
            <Text style={{ color: '#f1f5f9', fontSize: 22, fontWeight: '700', marginBottom: 8 }}>
              {displayName}
            </Text>
            {/* Inline status pill */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: hosColor + '18',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 5,
              gap: 6,
            }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: hosColor }} />
              <Text style={{ color: hosColor, fontSize: 13, fontWeight: '600' }}>{hosLabel}</Text>
            </View>
          </View>

          {/* Current Load */}
          <SectionLabel title="Current Load" />
          {data.currentLoad ? (
            <Pressable
              onPress={() => { haptic.light(); router.push(`/(owner)/loads/${data.currentLoad!.id}` as any) }}
              android_ripple={{ color: 'rgba(56,189,248,0.06)' }}
              style={({ pressed }) => ({
                marginHorizontal: 16,
                backgroundColor: pressed ? '#1a2d45' : '#1e293b',
                borderWidth: 1,
                borderColor: '#2d4a6e',
                borderRadius: 14,
                padding: 16,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 15 }}>
                  #{data.currentLoad.loadNumber}
                </Text>
                <Badge {...getStatusBadge(data.currentLoad.status)} />
              </View>
              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 2 }}>From</Text>
              <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: '500', marginBottom: 8 }} numberOfLines={1}>
                {data.currentLoad.origin}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 2 }}>To</Text>
              <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                {data.currentLoad.destination}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 4 }}>
                <Text style={{ color: '#38bdf8', fontSize: 12, fontWeight: '500' }}>View load details</Text>
                <ChevronRight color="#38bdf8" size={13} />
              </View>
            </Pressable>
          ) : (
            <View style={{
              marginHorizontal: 16,
              backgroundColor: '#1e293b',
              borderWidth: 1,
              borderColor: '#334155',
              borderRadius: 14,
              padding: 20,
              alignItems: 'center',
              gap: 8,
            }}>
              <Package color="#334155" size={28} />
              <Text style={{ color: '#475569', fontSize: 14 }}>No active load</Text>
            </View>
          )}

          {/* Compliance Documents */}
          <SectionLabel title="Compliance Documents" />
          {data.documents.length === 0 ? (
            <View style={{
              marginHorizontal: 16,
              backgroundColor: '#1e293b',
              borderWidth: 1,
              borderColor: '#334155',
              borderRadius: 14,
              padding: 20,
              alignItems: 'center',
              gap: 8,
            }}>
              <FileText color="#334155" size={28} />
              <Text style={{ color: '#475569', fontSize: 14, textAlign: 'center' }}>No documents uploaded</Text>
            </View>
          ) : (
            <View style={{ marginHorizontal: 16, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 14, overflow: 'hidden' }}>
              {data.documents.map((doc, idx) => {
                const docBadge = getDocBadge(doc.status)
                return (
                  <View
                    key={doc.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderBottomWidth: idx < data.documents.length - 1 ? 1 : 0,
                      borderBottomColor: '#334155',
                    }}
                  >
                    <FileText color="#475569" size={16} style={{ marginRight: 10, flexShrink: 0 }} />
                    <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                      <Text style={{ color: '#e2e8f0', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                        {doc.documentType ?? doc.fileName}
                      </Text>
                      <Text style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                        {doc.expiryDate ? `Expires ${formatDate(doc.expiryDate)}` : 'No expiry date'}
                      </Text>
                    </View>
                    <Badge label={docBadge.label} variant={docBadge.variant} />
                  </View>
                )
              })}
            </View>
          )}

          {/* Contact */}
          <SectionLabel title="Contact" />
          <View style={{ marginHorizontal: 16, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 14, overflow: 'hidden' }}>
            <Pressable
              onPress={() => { haptic.light(); Linking.openURL(`mailto:${data.email}`) }}
              android_ripple={{ color: 'rgba(255,255,255,0.04)' }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 14,
                borderBottomWidth: data.phone ? 1 : 0,
                borderBottomColor: '#334155',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#0ea5e918', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 }}>
                <Mail color="#0ea5e9" size={16} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>Email</Text>
                <Text style={{ color: '#f1f5f9', fontSize: 14 }} numberOfLines={1}>{data.email}</Text>
              </View>
              <ChevronRight color="#334155" size={16} />
            </Pressable>

            {data.phone && (
              <Pressable
                onPress={() => { haptic.light(); Linking.openURL(`tel:${data.phone}`) }}
                android_ripple={{ color: 'rgba(255,255,255,0.04)' }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#0ea5e918', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 }}>
                  <Phone color="#0ea5e9" size={16} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>Phone</Text>
                  <Text style={{ color: '#f1f5f9', fontSize: 14 }}>{data.phone}</Text>
                </View>
                <ChevronRight color="#334155" size={16} />
              </Pressable>
            )}
          </View>

          {/* Recent Incidents */}
          {data.recentIncidents.length > 0 && (
            <>
              <SectionLabel title="Recent Incidents" />
              <View style={{ marginHorizontal: 16, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 14, overflow: 'hidden' }}>
                {data.recentIncidents.map((incident, idx) => {
                  const severityColor = getIncidentSeverityColor(incident.severity)
                  return (
                    <View
                      key={incident.id}
                      style={{
                        flexDirection: 'row',
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderBottomWidth: idx < data.recentIncidents.length - 1 ? 1 : 0,
                        borderBottomColor: '#334155',
                        gap: 10,
                      }}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: severityColor, marginTop: 4, flexShrink: 0 }} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ color: '#e2e8f0', fontSize: 13, fontWeight: '600' }}>{incident.category}</Text>
                          <Text style={{ color: '#475569', fontSize: 11 }}>{formatDate(incident.reportedAt)}</Text>
                        </View>
                        <Text style={{ color: '#64748b', fontSize: 12 }} numberOfLines={2}>{incident.description}</Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            </>
          )}

          {/* Quick Actions */}
          <SectionLabel title="Actions" />
          <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16 }}>
            <Pressable
              onPress={() => { haptic.medium(); router.push(`/(owner)/fleet?driverId=${id}` as any) }}
              android_ripple={{ color: 'rgba(56,189,248,0.1)' }}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: pressed ? '#0c4a6e' : '#0ea5e915',
                borderWidth: 1,
                borderColor: '#0ea5e9',
                borderRadius: 12,
                paddingVertical: 14,
              })}
            >
              <MessageSquare color="#0ea5e9" size={18} />
              <Text style={{ color: '#0ea5e9', fontSize: 14, fontWeight: '600' }}>Message</Text>
            </Pressable>

            <Pressable
              onPress={() => { haptic.light(); router.push(`/(owner)/loads?driverId=${id}` as any) }}
              android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: pressed ? '#1a2d45' : '#1e293b',
                borderWidth: 1,
                borderColor: '#334155',
                borderRadius: 12,
                paddingVertical: 14,
              })}
            >
              <Package color="#94a3b8" size={18} />
              <Text style={{ color: '#94a3b8', fontSize: 14, fontWeight: '600' }}>View Loads</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Edit Driver Sheet */}
        <EditDriverSheet
          visible={editSheetVisible}
          onClose={() => setEditSheetVisible(false)}
          initialData={editInitialData}
          onSave={updateDriver}
          isPending={isUpdating}
        />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
