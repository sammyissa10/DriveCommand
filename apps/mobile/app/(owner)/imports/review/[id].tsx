import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import { ownerImportsApi, type StopReviewView } from '@drivecommand/api-client'
import { useAuthContext } from '../../../../context/AuthContext'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { StopReview } from '../../../../components/imports/StopReview'
import { useThemeColors, spacing, typography } from '../../../../constants/tokens'

/**
 * Stop review, on its own route (spec Section 10).
 *
 * `imports/review/[id]` rather than a segment under `imports/[id]`, because
 * `imports/[id].tsx` is a file and expo-router will not take a directory of the
 * same name beside it. The URL is still the whole of the state: every edit is
 * persisted server-side, so backgrounding the app and coming back lands on the
 * same order with the same quantities.
 *
 * The first load is a plain GET, and that GET writes nothing — arriving here
 * cannot commit anything a dispatcher has not agreed to.
 */
export default function StopReviewScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { token } = useAuthContext()
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>()

  const [view, setView] = useState<StopReviewView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !id) return
    try {
      setView(await ownerImportsApi.getStopReview(token, id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the stops.')
    }
  }, [token, id])

  useEffect(() => {
    void load()
  }, [load])

  if (!token || !id) return null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom', 'left', 'right']}>
      <AnimatedScreen>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to the import"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft color={c.brand} size={26} />
          </Pressable>
        </View>

        {error ? (
          <Text style={{ ...typography.footnote, color: c.danger, padding: spacing.lg }}>{error}</Text>
        ) : !view ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.brand} />
          </View>
        ) : (
          <StopReview
            token={token}
            importId={id}
            initial={view}
            title={title ?? 'Imported document'}
          />
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
