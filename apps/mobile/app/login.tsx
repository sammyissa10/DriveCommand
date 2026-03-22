import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuthContext } from '../context/AuthContext'

export default function LoginScreen() {
  const { login } = useAuthContext()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordRef = useRef<TextInput>(null)

  function clearError() {
    if (error) setError(null)
  }

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError('Email and password are required')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const user = await login(email.trim(), password)
      const role = user.role.toLowerCase()
      router.replace(`/(${role})` as never)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid email or password'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-900"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / brand */}
        <View className="items-center mb-10">
          <View className="w-16 h-16 rounded-2xl bg-blue-600 items-center justify-center mb-4">
            <Text className="text-white text-2xl font-bold">DC</Text>
          </View>
          <Text className="text-white text-3xl font-semibold tracking-tight">
            DriveCommand
          </Text>
          <Text className="text-slate-400 text-sm mt-1">
            Fleet management, simplified
          </Text>
        </View>

        {/* Form card */}
        <View className="bg-slate-800 rounded-2xl p-6 gap-4">
          <Text className="text-white text-xl font-semibold mb-2">Sign In</Text>

          {/* Email */}
          <View>
            <Text className="text-slate-300 text-sm mb-1.5 font-medium">Email</Text>
            <TextInput
              className="bg-slate-700 text-white rounded-xl px-4 py-3 text-base border border-slate-600 focus:border-blue-500"
              placeholder="you@company.com"
              placeholderTextColor="#94a3b8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="next"
              value={email}
              onChangeText={(v) => { setEmail(v); clearError() }}
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!isLoading}
            />
          </View>

          {/* Password */}
          <View>
            <Text className="text-slate-300 text-sm mb-1.5 font-medium">Password</Text>
            <TextInput
              ref={passwordRef}
              className="bg-slate-700 text-white rounded-xl px-4 py-3 text-base border border-slate-600 focus:border-blue-500"
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              returnKeyType="go"
              value={password}
              onChangeText={(v) => { setPassword(v); clearError() }}
              onSubmitEditing={handleSubmit}
              editable={!isLoading}
            />
          </View>

          {/* Error */}
          {error && (
            <View className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          )}

          {/* Submit button */}
          <TouchableOpacity
            className={`rounded-xl py-4 items-center mt-2 ${
              isLoading ? 'bg-blue-700/60' : 'bg-blue-600 active:bg-blue-700'
            }`}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-semibold text-base">Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text className="text-slate-500 text-xs text-center mt-8">
          Contact your administrator to reset your password
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
