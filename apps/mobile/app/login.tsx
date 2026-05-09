import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ImageBackground,
} from 'react-native'
import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuthContext } from '../context/AuthContext'
import { DCLogo } from '../components/shared/DCLogo'

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
    <ImageBackground
      source={require('../assets/images/login-bg.jpeg')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      {/* Dark overlay — matches web's bg-black/40 */}
      <View className="absolute inset-0 bg-black/40" />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
            paddingVertical: 48,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / brand */}
          <View className="items-center mb-7 gap-3">
            <DCLogo iconSize={64} variant="light" showWordmark={false} />
            <Text className="text-white">
              <Text style={{ fontFamily: 'Poppins-ExtraBold', fontSize: 28, color: '#ffffff' }}>D</Text>
              <Text style={{ fontFamily: 'Poppins-SemiBold', fontSize: 28, color: '#ffffff' }}>riveCommand</Text>
            </Text>
          </View>

          {/* Form card — white, matching web */}
          <View
            className="w-full max-w-[400px] bg-white rounded-2xl p-6 gap-4"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <Text className="text-[17px] font-semibold text-gray-900 mb-1">
              Sign in to your account
            </Text>

            {/* Email */}
            <View className="gap-1.5">
              <Text className="text-[13px] font-medium text-gray-700">Email</Text>
              <TextInput
                className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900"
                placeholder="you@example.com"
                placeholderTextColor="#9ca3af"
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
            <View className="gap-1.5">
              <Text className="text-[13px] font-medium text-gray-700">Password</Text>
              <TextInput
                ref={passwordRef}
                className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900"
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
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
              <View className="bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2.5">
                <Text className="text-red-600 text-[13px]">{error}</Text>
              </View>
            )}

            {/* Submit */}
            <Pressable
              className={`bg-sky-500 rounded-lg py-3 items-center mt-1 active:opacity-80${isLoading ? ' opacity-60' : ''}`}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white text-sm font-semibold">Sign in</Text>
              )}
            </Pressable>
          </View>

          {/* Footer */}
          <Text className="text-white/50 text-xs text-center mt-6">
            Contact your administrator to reset your password
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  )
}
