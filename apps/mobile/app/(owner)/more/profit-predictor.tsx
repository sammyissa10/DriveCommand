import React, { useState, useEffect } from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  XCircle,
} from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type PredictProfitResult } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { AddressInput } from '../../../components/owner/AddressInput'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  value,
  label,
  valueColor,
}: {
  value: string
  label: string
  valueColor?: string
}) {
  return (
    <View className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3.5 items-center">
      <Text
        className="text-[18px] font-bold"
        style={{ color: valueColor ?? '#f1f5f9' }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text className="text-slate-500 text-xs mt-0.5 text-center">{label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Recommendation banner config
// ---------------------------------------------------------------------------

const BANNER_CONFIG = {
  accept: {
    bg: 'rgba(34,197,94,0.12)',
    borderColor: '#22c55e30',
    color: '#22c55e',
    Icon: CheckCircle,
    label: 'Accept Load',
    sublabel: 'Strong margin — this load looks profitable.',
  },
  caution: {
    bg: 'rgba(245,158,11,0.12)',
    borderColor: '#f59e0b30',
    color: '#f59e0b',
    Icon: AlertTriangle,
    label: 'Proceed with Caution',
    sublabel: 'Low margin — review carefully before accepting.',
  },
  reject: {
    bg: 'rgba(239,68,68,0.12)',
    borderColor: '#ef444430',
    color: '#ef4444',
    Icon: XCircle,
    label: 'Reject Load',
    sublabel: 'Negative margin — this load will lose money.',
  },
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfitPredictorScreen() {
  const { token } = useAuthContext()
  const router = useRouter()

  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [distance, setDistance] = useState('')
  const [rate, setRate] = useState('')

  const [originLat, setOriginLat] = useState<number | null>(null)
  const [originLng, setOriginLng] = useState<number | null>(null)
  const [destLat, setDestLat] = useState<number | null>(null)
  const [destLng, setDestLng] = useState<number | null>(null)

  // Auto-fill distance via OSRM proxy when both addresses are geocoded
  useEffect(() => {
    if (originLat === null || originLng === null || destLat === null || destLng === null) return

    let cancelled = false

    fetch(`${API_URL}/api/geocoding/distance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ originLat, originLng, destLat, destLng }),
    })
      .then((res) => {
        if (!res.ok) return null
        return res.json() as Promise<{ distanceMiles: number | null }>
      })
      .then((data) => {
        if (cancelled || !data || data.distanceMiles === null) return
        setDistance(String(Math.round(data.distanceMiles)))
      })
      .catch(() => {
        // Silently fail — user can still enter distance manually
      })

    return () => { cancelled = true }
  }, [originLat, originLng, destLat, destLng, token])

  const { mutate, data, isPending, error, reset } = useMutation<PredictProfitResult, Error, void>({
    mutationFn: () =>
      ownerApi.predictProfit(token!, {
        origin,
        destination,
        distanceMiles: parseFloat(distance),
        offeredRate: parseFloat(rate),
      }),
  })

  const isFormValid =
    origin.trim().length > 0 &&
    destination.trim().length > 0 &&
    parseFloat(distance) > 0 &&
    parseFloat(rate) >= 0

  const handlePredict = () => {
    reset()
    mutate()
  }

  const banner = data ? BANNER_CONFIG[data.recommendation as keyof typeof BANNER_CONFIG] : null

  const formatCurrency = (val: string) =>
    `$${parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3.5 border-b border-slate-700">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            className="mr-3"
            hitSlop={8}
          >
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text className="text-lg font-bold text-slate-100">Profit Predictor</Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Origin */}
          <View className="mb-4" style={{ zIndex: 20 }}>
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
              Origin
            </Text>
            <AddressInput
              value={origin}
              onChangeText={(text) => {
                setOrigin(text)
                // Clear coords if user manually edits after a geocoded selection
                setOriginLat(null)
                setOriginLng(null)
              }}
              onAddressSelect={(r) => {
                setOrigin(r.formatted_address)
                setOriginLat(r.latitude)
                setOriginLng(r.longitude)
              }}
              placeholder="e.g. Chicago, IL"
            />
          </View>

          {/* Destination */}
          <View className="mb-4" style={{ zIndex: 10 }}>
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
              Destination
            </Text>
            <AddressInput
              value={destination}
              onChangeText={(text) => {
                setDestination(text)
                setDestLat(null)
                setDestLng(null)
              }}
              onAddressSelect={(r) => {
                setDestination(r.formatted_address)
                setDestLat(r.latitude)
                setDestLng(r.longitude)
              }}
              placeholder="e.g. Dallas, TX"
            />
          </View>

          {/* Distance + Rate row */}
          <View className="flex-row gap-3 mb-5">
            <View className="flex-1">
              <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                Distance
              </Text>
              <TextInput
                value={distance}
                onChangeText={setDistance}
                placeholder="Miles"
                placeholderTextColor="#64748b"
                className="bg-slate-800 border border-slate-700 rounded-xl text-slate-100 px-4 py-3.5 text-[15px]"
                keyboardType="numeric"
                returnKeyType="next"
              />
            </View>
            <View className="flex-1">
              <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                Offered Rate
              </Text>
              <TextInput
                value={rate}
                onChangeText={setRate}
                placeholder="$ Rate"
                placeholderTextColor="#64748b"
                className="bg-slate-800 border border-slate-700 rounded-xl text-slate-100 px-4 py-3.5 text-[15px]"
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => isFormValid && handlePredict()}
              />
            </View>
          </View>

          {/* Predict button */}
          <Pressable
            onPress={handlePredict}
            disabled={!isFormValid || isPending}
            className="bg-sky-500 rounded-xl py-3.5 items-center mb-5"
            style={{ opacity: !isFormValid || isPending ? 0.5 : 1 }}
          >
            <Text className="text-white font-semibold text-[15px]">
              {isPending ? 'Predicting…' : 'Predict'}
            </Text>
          </Pressable>

          {/* Error */}
          {error && (
            <Text className="text-red-400 text-sm text-center mb-4">
              {error.message || 'Prediction failed. Please try again.'}
            </Text>
          )}

          {/* Results */}
          {data && banner && (
            <View>
              {/* Recommendation banner */}
              <View
                className="rounded-xl p-4 mb-4 flex-row items-center border"
                style={{
                  backgroundColor: banner.bg,
                  borderColor: banner.borderColor,
                }}
              >
                <banner.Icon color={banner.color} size={22} style={{ marginRight: 10, flexShrink: 0 }} />
                <View className="flex-1">
                  <Text className="font-bold text-[15px]" style={{ color: banner.color }}>
                    {banner.label}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-0.5">{banner.sublabel}</Text>
                </View>
              </View>

              {/* Stat grid 2x2 */}
              <View className="flex-row gap-3 mb-3">
                <StatCard
                  value={formatCurrency(data.offeredRate)}
                  label="Offered Rate"
                  valueColor="#38bdf8"
                />
                <StatCard
                  value={formatCurrency(data.predictedExpenses)}
                  label="Predicted Expenses"
                  valueColor="#ef4444"
                />
              </View>
              <View className="flex-row gap-3 mb-4">
                <StatCard
                  value={formatCurrency(data.predictedProfit)}
                  label="Predicted Profit"
                  valueColor={parseFloat(data.predictedProfit) >= 0 ? '#22c55e' : '#ef4444'}
                />
                <StatCard
                  value={`${data.predictedMarginPercent.toFixed(1)}%`}
                  label="Margin"
                  valueColor={
                    data.recommendation === 'accept'
                      ? '#22c55e'
                      : data.recommendation === 'caution'
                      ? '#f59e0b'
                      : '#ef4444'
                  }
                />
              </View>

              {/* Data source note */}
              <View className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <Text className="text-slate-400 text-xs">
                  {data.dataSource === 'lane'
                    ? `Based on ${data.laneRouteCount} historical route${data.laneRouteCount !== 1 ? 's' : ''} for this lane ($${data.costPerMileUsed}/mi).`
                    : data.dataSource === 'fleet'
                    ? `Using fleet average cost-per-mile ($${data.costPerMileUsed}/mi). No lane history for this route.`
                    : 'No cost data available — prediction is an estimate only.'}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
