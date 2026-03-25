import React, { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { ExternalLink } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { driverApi, type DriverDocument } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'
import { BottomSheet } from '../ui/BottomSheet'
import { Badge } from '../ui/Badge'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'EXPIRED':
      return { label: 'Expired', variant: 'danger' }
    case 'EXPIRING':
      return { label: 'Expiring Soon', variant: 'warning' }
    default:
      return { label: 'Valid', variant: 'success' }
  }
}

function formatDate(isoString: string | null): string {
  if (!isoString) return 'No expiry set'
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'long',
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DocumentDetailSheetProps {
  document: DriverDocument
  visible: boolean
  onClose: () => void
}

export function DocumentDetailSheet({ document, visible, onClose }: DocumentDetailSheetProps) {
  const { token } = useAuthContext()
  const [isOpening, setIsOpening] = useState(false)
  const badge = getStatusBadge(document.status)

  async function handleViewDocument() {
    if (!token || isOpening) return

    setIsOpening(true)
    try {
      const { url } = await driverApi.getDocumentUrl(token, document.id)
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      })
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Failed to Open',
        text2: err instanceof Error ? err.message : 'Could not open document',
      })
    } finally {
      setIsOpening(false)
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Document Details" snapPoint="60%">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Document type heading + badge row */}
        <View className="flex-row items-start justify-between mb-4">
          <View className="flex-1 mr-3">
            <Text className="text-white font-bold text-lg leading-tight">
              {getDocumentTypeLabel(document.documentType)}
            </Text>
            <Text className="text-slate-400 text-sm mt-0.5" numberOfLines={2}>
              {document.fileName}
            </Text>
          </View>
          <View style={{ transform: [{ scale: 1.15 }] }}>
            <Badge label={badge.label} variant={badge.variant} />
          </View>
        </View>

        {/* Detail rows */}
        <View className="bg-slate-700/40 rounded-xl overflow-hidden mb-4">
          <DetailRow label="Uploaded" value={formatDate(document.createdAt)} />
          <View className="h-px bg-slate-700" />
          <DetailRow label="Expiry" value={formatDate(document.expiryDate)} />
          <View className="h-px bg-slate-700" />
          <DetailRow label="File size" value={formatBytes(document.sizeBytes)} />
          <View className="h-px bg-slate-700" />
          <DetailRow label="Type" value={document.contentType} />
        </View>

        {/* Notes if present */}
        {document.notes ? (
          <View className="bg-slate-700/40 rounded-xl p-3 mb-4">
            <Text className="text-xs text-slate-500 uppercase tracking-wide mb-1">Notes</Text>
            <Text className="text-slate-300 text-sm">{document.notes}</Text>
          </View>
        ) : null}

        {/* View Document button */}
        <Pressable
          onPress={handleViewDocument}
          disabled={isOpening}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0ea5e9',
            borderRadius: 12,
            paddingVertical: 14,
            gap: 8,
            opacity: isOpening ? 0.7 : 1,
          }}
        >
          {isOpening ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <ExternalLink color="#ffffff" size={18} />
          )}
          <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 15 }}>
            {isOpening ? 'Opening...' : 'View Document'}
          </Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

// ---------------------------------------------------------------------------
// DetailRow
// ---------------------------------------------------------------------------

interface DetailRowProps {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <Text className="text-slate-400 text-sm">{label}</Text>
      <Text className="text-slate-200 text-sm font-medium text-right flex-shrink-0 ml-4" numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}
