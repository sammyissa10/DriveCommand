import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
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
  const badge = getStatusBadge(document.status)

  return (
    <Pressable
      onPress={onPress}
      className="bg-slate-800 border-b border-slate-700 px-4 py-4 active:bg-slate-700/80 flex-row items-center"
      style={{ minHeight: 72 }}
    >
      {/* Left: Type icon */}
      <View className="w-10 h-10 rounded-xl bg-slate-700 items-center justify-center mr-3 flex-shrink-0">
        {getTypeIcon(document.documentType)}
      </View>

      {/* Center: Name + expiry */}
      <View className="flex-1 min-w-0 mr-3">
        <Text
          className="text-white font-semibold text-sm"
          numberOfLines={1}
        >
          {document.fileName}
        </Text>
        <Text className="text-slate-400 text-xs mt-0.5">
          {getDocumentTypeLabel(document.documentType)}
        </Text>
        <Text className="text-slate-500 text-xs mt-0.5">
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
    setShowUpload(false)
    queryClient.invalidateQueries({ queryKey: ['driver-documents'] })
    Toast.show({
      type: 'success',
      text1: 'Document Uploaded',
      text2: 'Your document has been saved.',
    })
  }

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-900 items-center justify-center" edges={['bottom', 'left', 'right']}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text className="text-slate-400 mt-3 text-sm">Loading documents...</Text>
      </SafeAreaView>
    )
  }

  // Error state
  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-slate-900 items-center justify-center px-6" edges={['bottom', 'left', 'right']}>
        <Text className="text-red-400 text-lg font-semibold text-center">Failed to load documents</Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-5 bg-sky-600 px-6 py-3 rounded-lg active:opacity-80"
        >
          <Text className="text-white font-semibold">Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View className="px-4 pt-4 pb-3 border-b border-slate-800">
        <Text className="text-2xl font-bold text-white">Documents</Text>
        <Text className="text-slate-400 text-sm mt-0.5">
          {documents.length} {documents.length === 1 ? 'document' : 'documents'}
        </Text>
      </View>

      {/* List */}
      {documents.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <FileText color="#334155" size={52} />
          <Text className="text-white text-lg font-semibold mt-4 text-center">No documents yet</Text>
          <Text className="text-slate-500 text-sm mt-2 text-center">
            Your licenses, medical cards, and uploaded files will appear here.
          </Text>
          <Pressable
            onPress={() => setShowUpload(true)}
            className="mt-5 bg-sky-600 px-6 py-3 rounded-lg active:opacity-80 flex-row items-center gap-2"
          >
            <Plus color="#ffffff" size={16} />
            <Text className="text-white font-semibold">Upload Document</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={documents}
          keyExtractor={(item) => item.id}
          estimatedItemSize={64}
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
              tintColor="#0ea5e9"
              colors={['#0ea5e9']}
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* FAB */}
      {documents.length > 0 && (
        <Pressable
          onPress={() => setShowUpload(true)}
          style={{
            position: 'absolute',
            bottom: 24,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: '#0ea5e9',
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
    </SafeAreaView>
  )
}
