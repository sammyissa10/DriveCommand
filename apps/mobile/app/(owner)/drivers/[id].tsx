import React, { useCallback } from 'react'
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  FileText,
  Mail,
  MessageSquare,
  Package,
  Phone,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  User,
} from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type OwnerDriverDetail, type OwnerDriverDocument } from '@drivecommand/api-client'
import { Badge } from '../../../components/ui/Badge'
import { Skeleton } from '../../../components/ui/Skeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getAvatarColor(name: string): string {
  const COLORS = [
    '#0ea5e9',
    '#8b5cf6',
    '#f59e0b',
    '#10b981',
    '#ef4444',
    '#ec4899',
    '#06b6d4',
    '#f97316',
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

function getHOSLabel(hosStatus: string | null): string {
  switch (hosStatus) {
    case 'DRIVING':
      return 'Driving'
    case 'ON_DUTY':
      return 'On Duty'
    case 'OFF_DUTY':
      return 'Off Duty'
    case 'SLEEPER_BERTH':
      return 'Sleeper'
    default:
      return 'Off Duty'
  }
}

function getHOSVariant(hosStatus: string | null): BadgeVariant {
  switch (hosStatus) {
    case 'DRIVING':
      return 'success'
    case 'ON_DUTY':
      return 'info'
    case 'SLEEPER_BERTH':
      return 'muted'
    default:
      return 'muted'
  }
}

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', variant: 'muted' }
    case 'DISPATCHED':
      return { label: 'Dispatched', variant: 'info' }
    case 'PICKED_UP':
      return { label: 'Picked Up', variant: 'warning' }
    case 'IN_TRANSIT':
      return { label: 'En Route', variant: 'warning' }
    case 'DELIVERED':
      return { label: 'Delivered', variant: 'success' }
    case 'INVOICED':
      return { label: 'Invoiced', variant: 'success' }
    case 'CANCELLED':
      return { label: 'Cancelled', variant: 'danger' }
    default:
      return { label: status, variant: 'muted' }
  }
}

function getDocBadge(status: OwnerDriverDocument['status']): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'EXPIRED':
      return { label: 'Expired', variant: 'danger' }
    case 'EXPIRING':
      return { label: 'Expiring Soon', variant: 'warning' }
    default:
      return { label: 'Valid', variant: 'success' }
  }
}

function getIncidentSeverityColor(severity: string): string {
  switch (severity) {
    case 'HIGH':
      return '#ef4444'
    case 'MEDIUM':
      return '#f59e0b'
    default:
      return '#64748b'
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        marginTop: 20,
      }}
    >
      {icon}
      <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </Text>
    </View>
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

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<OwnerDriverDetail>({
    queryKey: ['owner-driver-detail', id],
    queryFn: () => ownerApi.getDriverDetail(token!, id!),
    enabled: !!token && !!id,
  })

  const onRefresh = useCallback(() => refetch(), [refetch])

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
        {/* Header bar skeleton */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: insets.top + 8,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: '#1e293b',
            gap: 12,
          }}
        >
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={160} height={18} />
        </View>
        {/* Avatar + content skeleton */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, alignItems: 'center', gap: 12 }}>
          <Skeleton width={80} height={80} borderRadius={40} />
          <Skeleton width={140} height={20} />
          <Skeleton width={80} height={24} borderRadius={12} />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 28, gap: 12 }}>
          <Skeleton width={120} height={13} />
          <Skeleton width="100%" height={72} borderRadius={10} />
          <Skeleton width={160} height={13} style={{ marginTop: 8 }} />
          <Skeleton width="100%" height={56} borderRadius={10} />
        </View>
      </SafeAreaView>
    )
  }

  if (isError || !data) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <AlertTriangle color="#f87171" size={40} />
        <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
          Failed to load driver
        </Text>
        <Text style={{ color: '#64748b', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </Text>
        <Pressable
          onPress={() => refetch()}
          style={{ marginTop: 20, backgroundColor: '#0284c7', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
        >
          <Text style={{ color: '#ffffff', fontWeight: '600' }}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const avatarColor = getAvatarColor(data.name)
  const initials = getInitials(data.name)
  const hosLabel = getHOSLabel(data.hosStatus)
  const hosVariant = getHOSVariant(data.hosStatus)

  // Compliance icon
  const ComplianceIcon =
    data.complianceStatus === 'critical'
      ? ShieldX
      : data.complianceStatus === 'warning'
        ? ShieldAlert
        : ShieldCheck
  const complianceColor =
    data.complianceStatus === 'critical'
      ? '#ef4444'
      : data.complianceStatus === 'warning'
        ? '#f59e0b'
        : '#22c55e'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
      {/* Top bar with back button */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 8,
          backgroundColor: '#0f172a',
          borderBottomWidth: 1,
          borderBottomColor: '#1e293b',
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: 4,
            marginRight: 8,
          })}
        >
          <ArrowLeft color="#94a3b8" size={22} />
        </Pressable>
        <Text style={{ color: '#f1f5f9', fontSize: 17, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {data.name}
        </Text>
        <ComplianceIcon color={complianceColor} size={20} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor="#0ea5e9"
            colors={['#0ea5e9']}
          />
        }
      >
        {/* Large avatar + name header */}
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: avatarColor + '33',
              borderWidth: 3,
              borderColor: avatarColor,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: avatarColor, fontWeight: '700', fontSize: 28 }}>
              {initials}
            </Text>
          </View>
          <Text style={{ color: '#f1f5f9', fontSize: 20, fontWeight: '700', marginBottom: 8 }}>
            {data.name}
          </Text>
          <Badge label={hosLabel} variant={hosVariant} />
        </View>

        {/* ── Current Load ── */}
        <SectionHeader icon={<Package color="#64748b" size={15} />} title="Current Load" />
        {data.currentLoad ? (
          <Pressable
            onPress={() => router.push(`/(owner)/loads/${data.currentLoad!.id}` as any)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? '#1e3a5f' : '#1e293b',
              borderWidth: 1,
              borderColor: '#334155',
              borderRadius: 10,
              padding: 14,
            })}
          >
            {/* Load number + badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 15 }}>
                #{data.currentLoad.loadNumber}
              </Text>
              <Badge {...getStatusBadge(data.currentLoad.status)} />
            </View>
            {/* Route */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: '#94a3b8', fontSize: 13, flex: 1 }} numberOfLines={1}>
                {data.currentLoad.origin}
              </Text>
              <ArrowRight color="#475569" size={13} />
              <Text style={{ color: '#94a3b8', fontSize: 13, flex: 1, textAlign: 'right' }} numberOfLines={1}>
                {data.currentLoad.destination}
              </Text>
            </View>
            {/* Tap hint */}
            <Text style={{ color: '#475569', fontSize: 11, marginTop: 8 }}>
              Tap to view load detail →
            </Text>
          </Pressable>
        ) : (
          <View
            style={{
              backgroundColor: '#1e293b',
              borderWidth: 1,
              borderColor: '#334155',
              borderRadius: 10,
              padding: 16,
              alignItems: 'center',
            }}
          >
            <Package color="#334155" size={28} />
            <Text style={{ color: '#475569', fontSize: 14, marginTop: 8 }}>No active load</Text>
          </View>
        )}

        {/* ── Compliance Documents ── */}
        <SectionHeader icon={<FileText color="#64748b" size={15} />} title="Compliance Documents" />
        {data.documents.length === 0 ? (
          <View
            style={{
              backgroundColor: '#1e293b',
              borderWidth: 1,
              borderColor: '#334155',
              borderRadius: 10,
              padding: 16,
              alignItems: 'center',
            }}
          >
            <FileText color="#334155" size={28} />
            <Text style={{ color: '#475569', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
              No compliance documents uploaded
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: '#1e293b',
              borderWidth: 1,
              borderColor: '#334155',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {data.documents.map((doc, idx) => {
              const docBadge = getDocBadge(doc.status)
              const isLast = idx === data.documents.length - 1
              return (
                <View
                  key={doc.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: '#334155',
                    gap: 10,
                  }}
                >
                  <FileText color="#475569" size={18} />
                  <View style={{ flex: 1, minWidth: 0 }}>
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

        {/* ── Contact ── */}
        <SectionHeader icon={<User color="#64748b" size={15} />} title="Contact" />
        <View
          style={{
            backgroundColor: '#1e293b',
            borderWidth: 1,
            borderColor: '#334155',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {/* Email */}
          <Pressable
            onPress={() => Linking.openURL(`mailto:${data.email}`)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              padding: 14,
              borderBottomWidth: data.phone ? 1 : 0,
              borderBottomColor: '#334155',
              gap: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Mail color="#0ea5e9" size={18} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 1 }}>Email</Text>
              <Text style={{ color: '#f1f5f9', fontSize: 14 }}>{data.email}</Text>
            </View>
            <ArrowRight color="#334155" size={16} />
          </Pressable>

          {/* Phone (only if available) */}
          {data.phone && (
            <Pressable
              onPress={() => Linking.openURL(`tel:${data.phone}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                padding: 14,
                gap: 12,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Phone color="#0ea5e9" size={18} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 1 }}>Phone</Text>
                <Text style={{ color: '#f1f5f9', fontSize: 14 }}>{data.phone}</Text>
              </View>
              <ArrowRight color="#334155" size={16} />
            </Pressable>
          )}
        </View>

        {/* ── Recent Incidents ── (only if any) */}
        {data.recentIncidents.length > 0 && (
          <>
            <SectionHeader icon={<AlertTriangle color="#64748b" size={15} />} title="Recent Incidents" />
            <View
              style={{
                backgroundColor: '#1e293b',
                borderWidth: 1,
                borderColor: '#334155',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {data.recentIncidents.map((incident, idx) => {
                const isLast = idx === data.recentIncidents.length - 1
                const severityColor = getIncidentSeverityColor(incident.severity)
                return (
                  <View
                    key={incident.id}
                    style={{
                      padding: 12,
                      borderBottomWidth: isLast ? 0 : 1,
                      borderBottomColor: '#334155',
                      flexDirection: 'row',
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: severityColor,
                        marginTop: 4,
                        flexShrink: 0,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text style={{ color: '#e2e8f0', fontSize: 13, fontWeight: '600' }}>
                          {incident.category}
                        </Text>
                        <Text style={{ color: '#475569', fontSize: 11 }}>
                          {formatDate(incident.reportedAt)}
                        </Text>
                      </View>
                      <Text style={{ color: '#94a3b8', fontSize: 12 }} numberOfLines={2}>
                        {incident.description}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* ── Quick Actions ── */}
        <SectionHeader icon={<CheckCircle color="#64748b" size={15} />} title="Quick Actions" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* Send Message → fleet screen with driverId */}
          <Pressable
            onPress={() => router.push(`/(owner)/fleet?driverId=${id}` as any)}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: pressed ? '#0c4a6e' : '#1e293b',
              borderWidth: 1,
              borderColor: '#0ea5e9',
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: 'center',
              gap: 6,
            })}
          >
            <MessageSquare color="#0ea5e9" size={20} />
            <Text style={{ color: '#0ea5e9', fontSize: 13, fontWeight: '600' }}>
              Send Message
            </Text>
          </Pressable>

          {/* View All Loads for this driver */}
          <Pressable
            onPress={() => router.push(`/(owner)/loads?driverId=${id}` as any)}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: pressed ? '#1e3a5f' : '#1e293b',
              borderWidth: 1,
              borderColor: '#334155',
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: 'center',
              gap: 6,
            })}
          >
            <Package color="#94a3b8" size={20} />
            <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600' }}>
              View Loads
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
