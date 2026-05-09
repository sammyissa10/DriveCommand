import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { AnimatedScreen } from '@/components/ui/AnimatedScreen'
import { StopDocumentUpload } from '@/components/carrier/StopDocumentUpload'
import { useThemeColors } from '@/constants/tokens'

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function StopUploadScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { id, stopId, documentType } = useLocalSearchParams<{
    id: string
    stopId: string
    documentType: 'bol' | 'pod'
  }>()

  const safeDocType: 'bol' | 'pod' = documentType === 'bol' ? 'bol' : 'pod'
  const titleLabel = safeDocType === 'bol' ? 'Upload BOL' : 'Upload POD'

  if (!id || !stopId) {
    return (
      <AnimatedScreen>
        <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={22} color={c.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: c.textSecondary }]}>Invalid route params.</Text>
          </View>
        </SafeAreaView>
      </AnimatedScreen>
    )
  }

  return (
    <AnimatedScreen>
      <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={22} color={c.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: c.textPrimary }]}>{titleLabel}</Text>
        </View>

        {/* Upload flow */}
        <StopDocumentUpload
          stopId={stopId}
          dispatchId={id}
          documentType={safeDocType}
        />
      </SafeAreaView>
    </AnimatedScreen>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 15,
  },
})
