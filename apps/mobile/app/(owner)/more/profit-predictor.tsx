import React, { useState } from 'react'
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
          <View className="mb-4">
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
              Origin
            </Text>
            <TextInput
              value={origin}
              onChangeText={setOrigin}
              placeholder="e.g. Chicago, IL"
              placeholderTextColor="#64748b"
              className="bg-slate-800 border border-slate-700 rounded-xl text-slate-100 px-4 py-3.5 text-[15px]"
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          {/* Destination */}
          <View className="mb-4">
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
              Destination
            </Text>
            <TextInput
              value={destination}
              onChangeText={setDestination}
              placeholder="e.g. Dallas, TX"
              placeholderTextColor="#64748b"
              className="bg-slate-800 border border-slate-700 rounded-xl text-slate-100 px-4 py-3.5 text-[15px]"
              autoCapitalize="words"
              returnKeyType="next"
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
