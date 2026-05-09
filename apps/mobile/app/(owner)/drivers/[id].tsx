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
  BedDouble,
  ChevronRight,
  Clock,
  FileText,
  Mail,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Truck,
  Zap,
} from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type OwnerDriverDetail, type OwnerDriverDocument, type UpdateDriverPayload } from '@drivecommand/api-client'
import { Badge } from '../../../components/ui/Badge'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { Skeleton } from '../../../components/ui/Skeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { haptic } from '../../../lib/haptics'

// ─── Tokens ──────────────────────────────────────────────────────────────────

const C = {
  bg:        '#0b1120',
  surface:   '#131f30',
  card:      '#1a2840',
  border:    '#243248',
  borderSub: '#1e293b',
  text:      '#f1f5f9',
  textSub:   '#94a3b8',
  textMuted: '#475569',
  brand:     '#38bdf8',
  brandDim:  '#38bdf818',
  success:   '#22c55e',
  warning:   '#f59e0b',
  danger:    '#ef4444',
} as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getAvatarColor(name: string): string {
  const PALETTE = ['#0ea5e9','#8b5cf6','#f59e0b','#10b981','#ef4444','#ec4899','#06b6d4','#f97316']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function getInitials(name: string): string {
  const p = name.trim().split(/\s+/)
  if (!p.length) return '?'
  if (p.length === 1) return p[0][0].toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

type HOSInfo = { label: string; color: string; bg: string; Icon: React.ComponentType<{ color: string; size: number }> }
function getHOS(s: string | null): HOSInfo {
  switch (s) {
    case 'DRIVING':       return { label: 'Driving',       color: '#22c55e', bg: '#22c55e1a', Icon: Truck }
    case 'ON_DUTY':       return { label: 'On Duty',       color: '#38bdf8', bg: '#38bdf81a', Icon: Zap }
    case 'SLEEPER_BERTH': return { label: 'Sleeper Berth', color: '#a78bfa', bg: '#a78bfa1a', Icon: BedDouble }
    default:              return { label: 'Off Duty',      color: '#64748b', bg: '#64748b1a', Icon: Clock }
  }
}

function getLoadBadge(s: string): { label: string; variant: BadgeVariant } {
  switch (s) {
    case 'PENDING':    return { label: 'Pending',   variant: 'muted' }
    case 'DISPATCHED': return { label: 'Accepted',  variant: 'info' }
    case 'PICKED_UP':  return { label: 'Picked Up', variant: 'warning' }
    case 'IN_TRANSIT': return { label: 'En Route',  variant: 'warning' }
    case 'DELIVERED':  return { label: 'Delivered', variant: 'success' }
    case 'INVOICED':   return { label: 'Invoiced',  variant: 'success' }
    case 'CANCELLED':  return { label: 'Cancelled', variant: 'danger' }
    default:           return { label: s,           variant: 'muted' }
  }
}

function getDocBadge(s: OwnerDriverDocument['status']): { label: string; variant: BadgeVariant } {
  switch (s) {
    case 'EXPIRED':  return { label: 'Expired',       variant: 'danger' }
    case 'EXPIRING': return { label: 'Expiring Soon', variant: 'warning' }
    default:         return { label: 'Valid',          variant: 'success' }
  }
}

function getSeverityColor(s: string) {
  return s === 'HIGH' ? C.danger : s === 'MEDIUM' ? C.warning : C.textMuted
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '—' }
}

function titleCase(s: string) { return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) }

function parseName(full: string) {
  const p = full.trim().split(/\s+/)
  if (!p.length) return { firstName: '', lastName: '' }
  if (p.length === 1) return { firstName: p[0], lastName: '' }
  return { firstName: p[0], lastName: p.slice(1).join(' ') }
}

// ─── Section header ───────────────────────────────────────────────────────────

function Section({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 32, marginBottom: 12 }}>
      <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4 }}>
        {title}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: C.border, marginLeft: 12 }} />
    </View>
  )
}

// ─── Edit sheet ───────────────────────────────────────────────────────────────

const INPUT = {
  backgroundColor: C.bg,
  borderWidth: 1,
  borderColor: C.border,
  color: C.text,
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 14,
  fontSize: 15,
} as const

const LABEL = {
  color: C.textSub,
  fontSize: 11,
  fontWeight: '600' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.6,
  marginBottom: 8,
}

interface EditSheetProps {
  visible: boolean
  onClose: () => void
  initialData: { firstName: string; lastName: string; licenseNumber: string | null }
  onSave: (p: UpdateDriverPayload) => void
  isPending: boolean
}

function EditDriverSheet({ visible, onClose, initialData, onSave, isPending }: EditSheetProps) {
  const [firstName, setFirstName] = useState(initialData.firstName)
  const [lastName, setLastName]   = useState(initialData.lastName)
  const [license, setLicense]     = useState(initialData.licenseNumber ?? '')

  useEffect(() => {
    if (visible) {
      setFirstName(initialData.firstName)
      setLastName(initialData.lastName)
      setLicense(initialData.licenseNumber ?? '')
    }
  }, [visible])

  function save() {
    if (!firstName.trim() || !lastName.trim()) {
      Toast.show({ type: 'error', text1: 'Missing fields', text2: 'First and last name are required.', visibilityTime: 3000 })
      return
    }
    onSave({ firstName: firstName.trim(), lastName: lastName.trim(), licenseNumber: license.trim() || null })
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit Driver" snapPoint="80%">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={LABEL}>First Name <Text style={{ color: C.danger }}>*</Text></Text>
              <TextInput style={INPUT} placeholder="John" placeholderTextColor={C.textMuted} value={firstName} onChangeText={setFirstName} autoCapitalize="words" editable={!isPending} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={LABEL}>Last Name <Text style={{ color: C.danger }}>*</Text></Text>
              <TextInput style={INPUT} placeholder="Smith" placeholderTextColor={C.textMuted} value={lastName} onChangeText={setLastName} autoCapitalize="words" editable={!isPending} />
            </View>
          </View>
          <View style={{ marginBottom: 28 }}>
            <Text style={LABEL}>License # <Text style={{ color: C.textMuted, fontWeight: '400', textTransform: 'none' }}>(optional)</Text></Text>
            <TextInput style={INPUT} placeholder="DL-12345" placeholderTextColor={C.textMuted} value={license} onChangeText={setLicense} autoCapitalize="characters" editable={!isPending} />
          </View>
          <Pressable onPress={save} disabled={isPending} style={{ backgroundColor: isPending ? '#0c4a6e' : '#0284c7', borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: isPending ? 0.7 : 1 }}>
            {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Save Changes</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DriverDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>()
  const { token } = useAuthContext()
  const router    = useRouter()
  const insets    = useSafeAreaInsets()
  const qc        = useQueryClient()

  const [editOpen, setEditOpen] = useState(false)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<OwnerDriverDetail>({
    queryKey: ['owner-driver-detail', id],
    queryFn:  () => ownerApi.getDriverDetail(token!, id!),
    enabled:  !!token && !!id,
  })

  const { mutate: updateDriver, isPending: saving } = useMutation({
    mutationFn: (p: UpdateDriverPayload) => ownerApi.updateDriver(token!, id!, p),
    onSuccess: () => {
      haptic.success()
      qc.invalidateQueries({ queryKey: ['owner-driver-detail', id] })
      qc.invalidateQueries({ queryKey: ['owner-drivers'] })
      Toast.show({ type: 'success', text1: 'Driver updated', text2: 'Changes saved.', visibilityTime: 3000 })
      setEditOpen(false)
    },
    onError: (e: Error) => {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Update failed', text2: e.message || 'Please try again.', visibilityTime: 4000 })
    },
  })

  const onRefresh = useCallback(() => refetch(), [refetch])

  // ── Loading skeleton
  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 12, gap: 12 }}>
          <Skeleton width={40} height={40} borderRadius={12} />
          <Skeleton width={160} height={18} />
        </View>
        <View style={{ alignItems: 'center', paddingTop: 32, gap: 14 }}>
          <Skeleton width={100} height={100} borderRadius={50} />
          <Skeleton width={160} height={24} />
          <Skeleton width={120} height={16} />
          <Skeleton width={100} height={32} borderRadius={16} />
        </View>
        <View style={{ paddingTop: 36, gap: 10 }}>
          <Skeleton width={120} height={11} style={{ marginLeft: 20 }} />
          <Skeleton width="91%" height={88} borderRadius={16} style={{ marginHorizontal: 20 }} />
          <Skeleton width={80} height={11} style={{ marginLeft: 20, marginTop: 24 }} />
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20 }}>
            <Skeleton width="47%" height={52} borderRadius={14} />
            <Skeleton width="47%" height={52} borderRadius={14} />
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // ── Error
  if (isError || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <AlertTriangle color={C.danger} size={44} />
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 18, textAlign: 'center' }}>Failed to load driver</Text>
        <Text style={{ color: C.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </Text>
        <Pressable onPress={() => refetch()} style={{ marginTop: 24, backgroundColor: C.brand, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 }}>
          <Text style={{ color: '#000', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const avatarColor = getAvatarColor(data.name)
  const initials    = getInitials(data.name)
  const hos         = getHOS(data.hosStatus)
  const HOSIcon     = hos.Icon
  const displayName = titleCase(data.name)

  const ComplianceIcon  = data.complianceStatus === 'critical' ? ShieldX : data.complianceStatus === 'warning' ? ShieldAlert : ShieldCheck
  const complianceColor = data.complianceStatus === 'critical' ? C.danger : data.complianceStatus === 'warning' ? C.warning : C.success

  const editInitial = { ...parseName(data.name), licenseNumber: null as string | null }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>

        {/* ── Nav bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          gap: 8,
        }}>
          <Pressable
            onPress={() => { haptic.light(); from === 'dashboard' ? router.navigate('/(owner)/' as any) : router.back() }}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: C.surface,
              borderWidth: 1, borderColor: C.border,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <ArrowLeft color={C.textSub} size={20} />
          </Pressable>

          <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', flex: 1 }} numberOfLines={1}>
            Driver Profile
          </Text>

          <Pressable
            onPress={() => { haptic.light(); setEditOpen(true) }}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: C.surface,
              borderWidth: 1, borderColor: C.border,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Pencil color={C.textSub} size={17} />
          </Pressable>

          <View style={{
            width: 40, height: 40, borderRadius: 12,
            backgroundColor: complianceColor + '18',
            borderWidth: 1, borderColor: complianceColor + '35',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ComplianceIcon color={complianceColor} size={18} />
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 56, paddingHorizontal: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} />}
        >

          {/* ── Profile hero */}
          <View style={{ alignItems: 'center', paddingTop: 36, paddingBottom: 32 }}>
            {/* Avatar */}
            <View style={{
              width: 100, height: 100, borderRadius: 50,
              backgroundColor: avatarColor + '22',
              borderWidth: 3, borderColor: avatarColor + '55',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 18,
            }}>
              <Text style={{ color: avatarColor, fontWeight: '800', fontSize: 36 }}>{initials}</Text>
            </View>

            {/* Name */}
            <Text style={{ color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginBottom: 6 }}>
              {displayName}
            </Text>

            {/* Email */}
            <Text style={{ color: C.textSub, fontSize: 14, marginBottom: 18 }}>
              {data.email}
            </Text>

            {/* HOS status chip */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: hos.bg,
              borderRadius: 24,
              paddingHorizontal: 16, paddingVertical: 9,
              gap: 8,
              borderWidth: 1, borderColor: hos.color + '35',
            }}>
              <HOSIcon color={hos.color} size={14} />
              <Text style={{ color: hos.color, fontSize: 13, fontWeight: '700' }}>{hos.label}</Text>
            </View>
          </View>

          {/* ── Current Load */}
          <Section title="Current Load" />
          {data.currentLoad ? (
            <Pressable
              onPress={() => { haptic.light(); router.push(`/(owner)/loads/${data.currentLoad!.id}` as any) }}
              android_ripple={{ color: 'rgba(56,189,248,0.07)' }}
              style={({ pressed }) => ({
                                backgroundColor: pressed ? '#162c44' : C.card,
                borderWidth: 1, borderColor: '#2d4e72',
                borderRadius: 16,
                padding: 18,
              })}
            >
              {/* Row: load ID + badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ color: C.brand, fontWeight: '800', fontSize: 16, letterSpacing: -0.2 }}>
                  #{data.currentLoad.loadNumber}
                </Text>
                <Badge {...getLoadBadge(data.currentLoad.status)} />
              </View>

              {/* Route */}
              <View style={{ gap: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.success, borderWidth: 2, borderColor: C.success + '60' }} />
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                    {data.currentLoad.origin}
                  </Text>
                </View>
                <View style={{ width: 1.5, height: 16, backgroundColor: C.border, marginLeft: 4 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.danger, borderWidth: 2, borderColor: C.danger + '60' }} />
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                    {data.currentLoad.destination}
                  </Text>
                </View>
              </View>

              {/* View details — aligned right */}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 16, gap: 4 }}>
                <Text style={{ color: C.brand, fontSize: 13, fontWeight: '600' }}>View details</Text>
                <ChevronRight color={C.brand} size={14} />
              </View>
            </Pressable>
          ) : (
            <View style={{
                            borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed',
              borderRadius: 16, padding: 28,
              alignItems: 'center', gap: 8,
            }}>
              <Package color={C.border} size={32} />
              <Text style={{ color: C.textMuted, fontSize: 14, fontWeight: '500' }}>No active load</Text>
              <Text style={{ color: C.textMuted, fontSize: 12, textAlign: 'center' }}>
                This driver hasn't been assigned a load yet.
              </Text>
            </View>
          )}

          {/* ── Actions */}
          <Section title="Actions" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={() => { haptic.medium(); router.push(`/(owner)/fleet?driverId=${id}` as any) }}
              android_ripple={{ color: 'rgba(56,189,248,0.1)' }}
              style={({ pressed }) => ({
                flex: 1, minHeight: 52,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: pressed ? '#0c4a6e' : C.brandDim,
                borderWidth: 1, borderColor: C.brand + '50',
                borderRadius: 14,
              })}
            >
              <MessageSquare color={C.brand} size={18} />
              <Text style={{ color: C.brand, fontSize: 14, fontWeight: '700' }}>Message</Text>
            </Pressable>

            <Pressable
              onPress={() => { haptic.light(); router.push(`/(owner)/loads?driverId=${id}` as any) }}
              android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
              style={({ pressed }) => ({
                flex: 1, minHeight: 52,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: pressed ? '#1a2840' : C.surface,
                borderWidth: 1, borderColor: C.border,
                borderRadius: 14,
              })}
            >
              <Package color={C.textSub} size={18} />
              <Text style={{ color: C.textSub, fontSize: 14, fontWeight: '700' }}>View Loads</Text>
            </Pressable>
          </View>

          {/* ── Compliance Documents */}
          <Section title="Compliance Documents" />
          {data.documents.length === 0 ? (
            <View style={{
                            borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed',
              borderRadius: 16, padding: 28,
              alignItems: 'center', gap: 10,
            }}>
              <View style={{
                width: 48, height: 48, borderRadius: 24,
                backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Plus color={C.textMuted} size={22} />
              </View>
              <Text style={{ color: C.textSub, fontSize: 14, fontWeight: '600' }}>Upload Documents</Text>
              <Text style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                Add CDL, medical certificates, and other compliance documents here.
              </Text>
            </View>
          ) : (
            <View style={{ marginHorizontal: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, overflow: 'hidden' }}>
              {data.documents.map((doc, idx) => (
                <View
                  key={doc.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14,
                    borderBottomWidth: idx < data.documents.length - 1 ? 1 : 0,
                    borderBottomColor: C.borderSub,
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 }}>
                    <FileText color={C.textMuted} size={16} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                    <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                      {doc.documentType ?? doc.fileName}
                    </Text>
                    <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
                      {doc.expiryDate ? `Expires ${fmtDate(doc.expiryDate)}` : 'No expiry date'}
                    </Text>
                  </View>
                  <Badge label={getDocBadge(doc.status).label} variant={getDocBadge(doc.status).variant} />
                </View>
              ))}
            </View>
          )}

          {/* ── Contact */}
          <Section title="Contact" />
          <View style={{ marginHorizontal: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, overflow: 'hidden' }}>
            <Pressable
              onPress={() => { haptic.light(); Linking.openURL(`mailto:${data.email}`) }}
              android_ripple={{ color: 'rgba(255,255,255,0.04)' }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 16, paddingVertical: 16,
                borderBottomWidth: data.phone ? 1 : 0, borderBottomColor: C.borderSub,
                minHeight: 56,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#0ea5e918', alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 }}>
                <Mail color="#0ea5e9" size={17} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 3 }}>EMAIL</Text>
                <Text style={{ color: C.text, fontSize: 14 }} numberOfLines={1}>{data.email}</Text>
              </View>
              <ChevronRight color={C.border} size={18} />
            </Pressable>

            {data.phone && (
              <Pressable
                onPress={() => { haptic.light(); Linking.openURL(`tel:${data.phone}`) }}
                android_ripple={{ color: 'rgba(255,255,255,0.04)' }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 16, paddingVertical: 16,
                  minHeight: 56,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#22c55e18', alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 }}>
                  <Phone color="#22c55e" size={17} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 3 }}>PHONE</Text>
                  <Text style={{ color: C.text, fontSize: 14 }}>{data.phone}</Text>
                </View>
                <ChevronRight color={C.border} size={18} />
              </Pressable>
            )}
          </View>

          {/* ── Recent Incidents */}
          {data.recentIncidents.length > 0 && (
            <>
              <Section title="Recent Incidents" />
              <View style={{ marginHorizontal: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, overflow: 'hidden' }}>
                {data.recentIncidents.map((inc, idx) => {
                  const sc = getSeverityColor(inc.severity)
                  return (
                    <View
                      key={inc.id}
                      style={{
                        flexDirection: 'row',
                        paddingHorizontal: 16, paddingVertical: 14,
                        borderBottomWidth: idx < data.recentIncidents.length - 1 ? 1 : 0,
                        borderBottomColor: C.borderSub,
                        gap: 12,
                      }}
                    >
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sc, marginTop: 3, flexShrink: 0 }} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{inc.category}</Text>
                          <Text style={{ color: C.textMuted, fontSize: 12 }}>{fmtDate(inc.reportedAt)}</Text>
                        </View>
                        <Text style={{ color: C.textSub, fontSize: 13, lineHeight: 19 }} numberOfLines={2}>
                          {inc.description}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            </>
          )}

        </ScrollView>

        <EditDriverSheet
          visible={editOpen}
          onClose={() => setEditOpen(false)}
          initialData={editInitial}
          onSave={updateDriver}
          isPending={saving}
        />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
