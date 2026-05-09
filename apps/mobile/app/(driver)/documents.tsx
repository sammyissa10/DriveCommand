import React, { useCallback, useState } from 'react'
import {
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import {
  FileText,
  CreditCard,
  ClipboardCheck,
  File,
  Plus,
} from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { driverApi, type DriverDocument } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'
import { Badge } from '../../components/ui/Badge'
import { DocumentDetailSheet } from '../../components/driver/DocumentDetailSheet'
import { DocumentUploadSheet } from '../../components/driver/DocumentUploadSheet'
import { DocumentRowSkeleton } from '../../components/skeletons/DocumentRowSkeleton'
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'
import { haptic } from '../../lib/haptics'
import { useThemeColors } from '../../constants/tokens'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'EXPIRED':
      return { label: 'Expired', variant: 'danger' }
    case 'EXPIRING':
      return { label: 'Expiring', variant: 'warning' }
    default:
      return { label: 'Valid', variant: 'success' }
  }
}

function getTypeIcon(documentType: string | null) {
  const size = 22
  switch (documentType) {
    case 'CDL':
    case 'MEDICAL_CARD':
      return <CreditCard color="#38bdf8" size={size} />
    case 'INSPECTION':
    case 'REGISTRATION':
      return <ClipboardCheck color="#a78bfa" size={size} />
    case 'HAZMAT':
    case 'INSURANCE':
      return <FileText color="#4ade80" size={size} />
    default:
      return <File color="#94a3b8" size={size} />
  }
}

function formatDate(isoString: string | null): string {
  if (!isoString) return 'No expiry'
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return 'Unknown'
  }
}

function getDocumentTypeLabel(documentType: string | null): string {
  switch (documentType) {
    case 'CDL': return 'Commercial Driver License'
    case 'MEDICAL_CARD': return 'Medical Certificate'
    case 'HAZMAT': return 'HazMat Certification'
    case 'INSURANCE': return 'Insurance'
    case 'REGISTRATION': return 'Registration'
    case 'INSPECTION': return 'Inspection Report'
    case 'OTHER': return 'Other Document'
    default: return documentType ?? 'Document'
  }
}

// ---------------------------------------------------------------------------
// DocumentRow
// ---------------------------------------------------------------------------

interface DocumentRowProps {
  document: DriverDocument
  onPress: () => void
}

function DocumentRow({ document, onPress }: DocumentRowProps) {
  const c = useThemeColors()
  const badge = getStatusBadge(document.status)

  return (
    <Pressable
      onPress={onPress}
      android_ripple={Platform.OS === 'android' ? { color: 'rgba(255,255,255,0.1)', borderless: false } : undefined}
      className="px-4 py-4 active:opacity-80 flex-row items-center"
      style={{ minHeight: 72, backgroundColor: c.surfaceCard, borderBottomWidth: 1, borderBottomColor: c.border }}
    >
      {/* Left: Type icon */}
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mr-3 flex-shrink-0"
        style={{ backgroundColor: c.surfaceElevated }}
      >
        {getTypeIcon(document.documentType)}
      </View>

      {/* Center: Name + expiry */}
      <View className="flex-1 min-w-0 mr-3">
        <Text
          className="font-semibold text-sm"
          style={{ color: c.textPrimary }}
          numberOfLines={1}
        >
          {document.fileName}
        </Text>
        <Text className="text-xs mt-0.5" style={{ color: c.textSecondary }}>
          {getDocumentTypeLabel(document.documentType)}
        </Text>
        <Text className="text-xs mt-0.5" style={{ color: c.textTertiary }}>
          {document.expiryDate ? `Expires ${formatDate(document.expiryDate)}` : 'No expiry date'}
        </Text>
      </View>

      {/* Right: Status badge */}
      <Badge label={badge.label} variant={badge.variant} />
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function DriverDocuments() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()

  const [selectedDoc, setSelectedDoc] = useState<DriverDocument | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['driver-documents'],
    queryFn: () => driverApi.getDocuments(token!),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])
  const documents = data?.documents ?? []

  function handleUploadSuccess() {
    haptic.success()
    setShowUpload(false)
    queryClient.invalidateQueries({ queryKey: ['driver-documents'] })
    Toast.show({
      type: 'success',
      text1: 'Document Uploaded',
      text2: 'Your document has been saved.',
    })
  }

  // Loading state — show skeleton instead of spinner
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
        <View
          className="px-4 pt-4 pb-3"
          style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
        >
          <View style={{ width: 120, height: 24, backgroundColor: c.surfaceElevated, borderRadius: 6, marginBottom: 6 }} />
          <View style={{ width: 80, height: 14, backgroundColor: c.surfaceCard, borderRadius: 4 }} />
        </View>
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
      </SafeAreaView>
    )
  }

  // Error state
  if (isError) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-6" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
        <Text className="text-red-400 text-lg font-semibold text-center">Failed to load documents</Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-5 px-6 py-3 rounded-lg active:opacity-80"
          style={{ backgroundColor: c.brand }}
        >
          <Text className="font-semibold" style={{ color: '#ffffff' }}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
      {/* Header */}
      <View
        className="px-4 pt-4 pb-3"
        style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        <Text className="text-2xl font-bold" style={{ color: c.textPrimary }}>Documents</Text>
        <Text className="text-sm mt-0.5" style={{ color: c.textSecondary }}>
          {documents.length} {documents.length === 1 ? 'document' : 'documents'}
        </Text>
      </View>

      {/* List */}
      {documents.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <FileText color={c.surfaceElevated} size={52} />
          <Text className="text-lg font-semibold mt-4 text-center" style={{ color: c.textPrimary }}>No documents yet</Text>
          <Text className="text-sm mt-2 text-center" style={{ color: c.textTertiary }}>
            Your licenses, medical cards, and uploaded files will appear here.
          </Text>
          <Pressable
            onPress={() => setShowUpload(true)}
            className="mt-5 px-6 py-3 rounded-lg active:opacity-80 flex-row items-center gap-2"
            style={{ backgroundColor: c.brand }}
          >
            <Plus color="#ffffff" size={16} />
            <Text className="font-semibold" style={{ color: '#ffffff' }}>Upload Document</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={documents}
          keyExtractor={(item) => item.id}

          renderItem={({ item }) => (
            <DocumentRow
              document={item}
              onPress={() => setSelectedDoc(item)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={c.brand}
              colors={[c.brand]}
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* FAB */}
      {documents.length > 0 && (
        <Pressable
          accessibilityLabel="Add document"
          accessibilityRole="button"
          onPress={() => setShowUpload(true)}
          style={{
            position: 'absolute',
            bottom: 24,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: c.brand,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          }}
          className="active:opacity-80"
        >
          <Plus color="#ffffff" size={24} />
        </Pressable>
      )}

      {/* Detail Bottom Sheet */}
      {selectedDoc && (
        <DocumentDetailSheet
          document={selectedDoc}
          visible={!!selectedDoc}
          onClose={() => setSelectedDoc(null)}
        />
      )}

      {/* Upload Bottom Sheet */}
      <DocumentUploadSheet
        visible={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={handleUploadSuccess}
      />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
