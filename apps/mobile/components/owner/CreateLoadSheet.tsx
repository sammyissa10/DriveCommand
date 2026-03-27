import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { BottomSheet } from '../ui/BottomSheet'
import { ownerApi, type CustomerOption, type DriverOption } from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'

interface CreateLoadSheetProps {
  visible: boolean
  onClose: () => void
  onCreated: () => void
}

interface FormState {
  customerId: string
  customerName: string
  origin: string
  destination: string
  pickupDate: string
  rate: string
  driverId: string
  driverName: string
}

const EMPTY_FORM: FormState = {
  customerId: '',
  customerName: '',
  origin: '',
  destination: '',
  pickupDate: '',
  rate: '',
  driverId: '',
  driverName: '',
}

// Simple date formatter for display
function formatDateInput(value: string): string {
  // Allow MM/DD/YYYY typing
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
}

function parseDateInput(value: string): string | undefined {
  // Parse MM/DD/YYYY → ISO string
  const parts = value.split('/')
  if (parts.length !== 3) return undefined
  const [mm, dd, yyyy] = parts
  if (!mm || !dd || !yyyy || yyyy.length < 4) return undefined
  const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`)
  if (isNaN(d.getTime())) return undefined
  return d.toISOString()
}

// ─── Picker Row ────────────────────────────────────────────────────────────

interface PickerSheetProps {
  title: string
  items: { id: string; name: string }[]
  selectedId: string
  onSelect: (id: string, name: string) => void
  onClose: () => void
  loading: boolean
  placeholder: string
}

function PickerSheet({ title, items, selectedId, onSelect, onClose, loading, placeholder }: PickerSheetProps) {
  return (
    <BottomSheet visible onClose={onClose} title={title} snapPoint="60%">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0ea5e9" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-slate-400 text-sm">{placeholder}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {items.map((item) => {
            const isSelected = item.id === selectedId
            return (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item.id, item.name)}
                className={`flex-row items-center justify-between p-3 rounded-xl mb-2 border ${
                  isSelected
                    ? 'bg-sky-900/40 border-sky-500'
                    : 'bg-slate-700/50 border-slate-600 active:opacity-75'
                }`}
              >
                <Text className="text-white text-sm flex-1 mr-2" numberOfLines={1}>
                  {item.name}
                </Text>
                {isSelected && (
                  <View className="w-2 h-2 rounded-full bg-sky-400" />
                )}
              </Pressable>
            )
          })}
        </ScrollView>
      )}
    </BottomSheet>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export function CreateLoadSheet({ visible, onClose, onCreated }: CreateLoadSheetProps) {
  const { token } = useAuthContext()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)

  // Reset form when sheet opens
  useEffect(() => {
    if (visible) {
      setForm(EMPTY_FORM)
      setErrors({})
    }
  }, [visible])

  const { data: customers, isLoading: loadingCustomers } = useQuery({
    queryKey: ['owner-customers'],
    queryFn: () => ownerApi.getCustomers(token!),
    enabled: !!token && visible,
    staleTime: 60_000,
  })

  const { data: drivers, isLoading: loadingDrivers } = useQuery({
    queryKey: ['owner-active-drivers'],
    queryFn: () => ownerApi.getActiveDrivers(token!),
    enabled: !!token && visible,
    staleTime: 60_000,
  })

  const { mutate: createLoad, isPending } = useMutation({
    mutationFn: () =>
      ownerApi.createLoad(token!, {
        customerId: form.customerId || undefined,
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        pickupDate: parseDateInput(form.pickupDate),
        rate: form.rate ? parseFloat(form.rate) : undefined,
        driverId: form.driverId || undefined,
      }),
    onSuccess: () => {
      Toast.show({
        type: 'success',
        text1: 'Load created',
        text2: `Load has been created successfully.`,
        visibilityTime: 3000,
      })
      onCreated()
    },
    onError: (error: Error) => {
      Toast.show({
        type: 'error',
        text1: 'Failed to create load',
        text2: error.message || 'Please try again.',
        visibilityTime: 4000,
      })
    },
  })

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {}
    if (!form.customerId) newErrors.customerId = 'Customer is required'
    if (!form.origin.trim()) newErrors.origin = 'Origin is required'
    if (!form.destination.trim()) newErrors.destination = 'Destination is required'
    if (form.pickupDate && !parseDateInput(form.pickupDate)) {
      newErrors.pickupDate = 'Invalid date (use MM/DD/YYYY)'
    }
    if (form.rate && isNaN(parseFloat(form.rate))) {
      newErrors.rate = 'Rate must be a number'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [form])

  const handleSubmit = useCallback(() => {
    if (!validate()) return
    createLoad()
  }, [validate, createLoad])

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }, [])

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Create Load" snapPoint="80%">
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 1. Customer */}
          <View className="mb-4">
            <Text className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Customer <Text className="text-red-500">*</Text>
            </Text>
            <Pressable
              onPress={() => setCustomerPickerOpen(true)}
              className={`flex-row items-center justify-between bg-slate-700 border ${
                errors.customerId ? 'border-red-500' : 'border-slate-600'
              } rounded-xl px-4 py-3 active:opacity-75`}
            >
              <Text
                className={`text-sm flex-1 ${form.customerName ? 'text-white' : 'text-slate-500'}`}
                numberOfLines={1}
              >
                {form.customerName || 'Select customer...'}
              </Text>
              <ChevronDown color="#64748b" size={16} />
            </Pressable>
            {errors.customerId && (
              <Text className="text-red-500 text-xs mt-1">{errors.customerId}</Text>
            )}
          </View>

          {/* 2. Origin */}
          <View className="mb-4">
            <Text className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Origin <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={form.origin}
              onChangeText={(v) => setField('origin', v)}
              placeholder="e.g. Chicago, IL"
              placeholderTextColor="#64748b"
              className={`bg-slate-700 border ${
                errors.origin ? 'border-red-500' : 'border-slate-600'
              } rounded-xl px-4 py-3 text-white text-sm`}
              autoCorrect={false}
            />
            {errors.origin && (
              <Text className="text-red-500 text-xs mt-1">{errors.origin}</Text>
            )}
          </View>

          {/* 3. Destination */}
          <View className="mb-4">
            <Text className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Destination <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={form.destination}
              onChangeText={(v) => setField('destination', v)}
              placeholder="e.g. Dallas, TX"
              placeholderTextColor="#64748b"
              className={`bg-slate-700 border ${
                errors.destination ? 'border-red-500' : 'border-slate-600'
              } rounded-xl px-4 py-3 text-white text-sm`}
              autoCorrect={false}
            />
            {errors.destination && (
              <Text className="text-red-500 text-xs mt-1">{errors.destination}</Text>
            )}
          </View>

          {/* 4. Pickup Date (optional) */}
          <View className="mb-4">
            <Text className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Pickup Date <Text className="text-slate-600">(optional)</Text>
            </Text>
            <TextInput
              value={form.pickupDate}
              onChangeText={(v) => setField('pickupDate', formatDateInput(v))}
              placeholder="MM/DD/YYYY"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              maxLength={10}
              className={`bg-slate-700 border ${
                errors.pickupDate ? 'border-red-500' : 'border-slate-600'
              } rounded-xl px-4 py-3 text-white text-sm`}
            />
            {errors.pickupDate && (
              <Text className="text-red-500 text-xs mt-1">{errors.pickupDate}</Text>
            )}
          </View>

          {/* 5. Rate (optional) */}
          <View className="mb-4">
            <Text className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Rate <Text className="text-slate-600">(optional)</Text>
            </Text>
            <View className="flex-row items-center bg-slate-700 border border-slate-600 rounded-xl overflow-hidden">
              <View className="px-3 py-3 border-r border-slate-600">
                <Text className="text-slate-400 text-sm font-semibold">$</Text>
              </View>
              <TextInput
                value={form.rate}
                onChangeText={(v) => setField('rate', v.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor="#64748b"
                keyboardType="decimal-pad"
                className="flex-1 px-3 py-3 text-white text-sm"
              />
            </View>
            {errors.rate && (
              <Text className="text-red-500 text-xs mt-1">{errors.rate}</Text>
            )}
          </View>

          {/* 6. Assign Driver (optional) */}
          <View className="mb-6">
            <Text className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Assign Driver <Text className="text-slate-600">(optional)</Text>
            </Text>
            <Pressable
              onPress={() => setDriverPickerOpen(true)}
              className="flex-row items-center justify-between bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 active:opacity-75"
            >
              <Text
                className={`text-sm flex-1 ${form.driverName ? 'text-white' : 'text-slate-500'}`}
                numberOfLines={1}
              >
                {form.driverName || 'Select driver (optional)...'}
              </Text>
              <View className="flex-row items-center gap-2">
                {form.driverId ? (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation()
                      setField('driverId', '')
                      setField('driverName', '')
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text className="text-slate-500 text-xs">Clear</Text>
                  </Pressable>
                ) : null}
                <ChevronDown color="#64748b" size={16} />
              </View>
            </Pressable>
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={isPending}
            className={`rounded-xl py-4 items-center mb-4 ${
              isPending ? 'bg-sky-800 opacity-60' : 'bg-sky-600 active:opacity-80'
            }`}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Create Load</Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      {/* Customer picker */}
      {customerPickerOpen && (
        <PickerSheet
          title="Select Customer"
          items={customers ?? []}
          selectedId={form.customerId}
          onSelect={(id, name) => {
            setField('customerId', id)
            setField('customerName', name)
            setCustomerPickerOpen(false)
          }}
          onClose={() => setCustomerPickerOpen(false)}
          loading={loadingCustomers}
          placeholder="No customers found"
        />
      )}

      {/* Driver picker */}
      {driverPickerOpen && (
        <PickerSheet
          title="Assign Driver"
          items={drivers ?? []}
          selectedId={form.driverId}
          onSelect={(id, name) => {
            setField('driverId', id)
            setField('driverName', name)
            setDriverPickerOpen(false)
          }}
          onClose={() => setDriverPickerOpen(false)}
          loading={loadingDrivers}
          placeholder="No active drivers found"
        />
      )}
    </>
  )
}
