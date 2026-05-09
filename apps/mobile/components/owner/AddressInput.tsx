import React, { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'

interface AddressInputProps {
  value: string
  onChangeText: (text: string) => void
  onAddressSelect: (result: { formatted_address: string; latitude: number; longitude: number }) => void
  placeholder?: string
  error?: string
}

interface Suggestion {
  formatted_address: string
  latitude: number
  longitude: number
  place_id: string
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'

export function AddressInput({
  value,
  onChangeText,
  onAddressSelect,
  placeholder = 'Enter address...',
  error,
}: AddressInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryRef = useRef<string>('')

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([])
      setIsOpen(false)
      setFetchError(false)
      return
    }

    setIsLoading(true)
    setFetchError(false)

    try {
      const response = await fetch(`${API_URL}/api/geocoding/autocomplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data: Suggestion[] = await response.json()

      // Only update if query hasn't changed since we fired this request
      if (queryRef.current === query) {
        setSuggestions(data)
        setIsOpen(true)
      }
    } catch {
      if (queryRef.current === query) {
        setFetchError(true)
        setSuggestions([])
        setIsOpen(true)
      }
    } finally {
      if (queryRef.current === query) {
        setIsLoading(false)
      }
    }
  }, [])

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text)
      queryRef.current = text

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      if (text.length < 3) {
        setSuggestions([])
        setIsOpen(false)
        setFetchError(false)
        return
      }

      debounceRef.current = setTimeout(() => {
        fetchSuggestions(text)
      }, 500)
    },
    [onChangeText, fetchSuggestions],
  )

  const handleSelect = useCallback(
    (item: Suggestion) => {
      onAddressSelect({
        formatted_address: item.formatted_address,
        latitude: item.latitude,
        longitude: item.longitude,
      })
      onChangeText(item.formatted_address)
      setSuggestions([])
      setIsOpen(false)
    },
    [onAddressSelect, onChangeText],
  )

  const showDropdown = isOpen && value.length >= 3

  return (
    <View style={{ position: 'relative', zIndex: 50 }}>
      {/* Input field */}
      <View style={{ position: 'relative' }}>
        <TextInput
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor="#64748b"
          autoCorrect={false}
          autoCapitalize="none"
          style={[
            {
              backgroundColor: '#334155',
              borderWidth: 1,
              borderColor: error ? '#ef4444' : '#475569',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              color: '#ffffff',
              fontSize: 14,
              paddingRight: isLoading ? 44 : 16,
            },
          ]}
        />
        {isLoading && (
          <View
            style={{
              position: 'absolute',
              right: 12,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator size="small" color="#0ea5e9" />
          </View>
        )}
      </View>

      {/* Dropdown */}
      {showDropdown && (
        <View
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: '#1e293b',
            borderWidth: 1,
            borderColor: '#475569',
            borderRadius: 12,
            marginTop: 4,
            zIndex: 50,
            overflow: 'hidden',
            maxHeight: 240,
          }}
        >
          {fetchError ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: '#94a3b8', fontSize: 14 }}>Search unavailable</Text>
            </View>
          ) : suggestions.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: '#94a3b8', fontSize: 14 }}>No results found</Text>
            </View>
          ) : (
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.place_id}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={suggestions.length > 4}
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => handleSelect(item)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 14,
                    minHeight: 48,
                    justifyContent: 'center',
                    backgroundColor: pressed ? '#334155' : 'transparent',
                    borderBottomWidth: index < suggestions.length - 1 ? 1 : 0,
                    borderBottomColor: '#475569',
                  })}
                >
                  <Text style={{ color: '#ffffff', fontSize: 14 }} numberOfLines={2}>
                    {item.formatted_address}
                  </Text>
                </Pressable>
              )}
            />
          )}
        </View>
      )}
    </View>
  )
}
