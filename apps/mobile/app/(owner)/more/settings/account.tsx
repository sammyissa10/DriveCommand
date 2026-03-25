import React from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Building2, ChevronLeft, CreditCard, ExternalLink, User } from 'lucide-react-native'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { useAuthContext } from '../../../../context/AuthContext'

const PLAN_FEATURES = [
  'Unlimited loads & routes',
  'Full driver management',
  'Live GPS tracking',
  'CRM & invoicing',
  'Compliance monitoring',
  'AI-powered insights',
]

export default function AccountSubscriptionScreen() {
  const router = useRouter()
  const { user } = useAuthContext()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#334155',
          }}
        >
          <Pressable onPress={() => router.back()} style={{ marginRight: 12 }} hitSlop={8}>
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>Account &amp; Subscription</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Account details section */}
          <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
            <Text
              style={{
                color: '#94a3b8',
                fontSize: 12,
                fontWeight: '600',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Account
            </Text>

            <View
              style={{
                backgroundColor: '#1e293b',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#334155',
                overflow: 'hidden',
              }}
            >
              {/* Profile row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: '#334155',
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: '#38bdf820',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                  }}
                >
                  <User color="#38bdf8" size={22} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 16, marginBottom: 2 }}
                    numberOfLines={1}
                  >
                    {user?.name ?? 'Owner'}
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 13 }} numberOfLines={1}>
                    {user?.email ?? 'No email'}
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 20,
                    backgroundColor: '#f59e0b20',
                  }}
                >
                  <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '600' }}>Owner</Text>
                </View>
              </View>

              {/* Company row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: '#8b5cf620',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                  }}
                >
                  <Building2 color="#8b5cf6" size={18} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 2 }}>Company</Text>
                  <Text
                    style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}
                    numberOfLines={1}
                  >
                    {user?.companyName ?? 'Your Fleet'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Subscription section */}
          <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
            <Text
              style={{
                color: '#94a3b8',
                fontSize: 12,
                fontWeight: '600',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Subscription
            </Text>

            <View
              style={{
                backgroundColor: '#1e293b',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#334155',
                padding: 18,
              }}
            >
              {/* Plan badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: '#a78bfa20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <CreditCard color="#a78bfa" size={20} />
                </View>
                <View>
                  <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 16 }}>
                    DriveCommand Pro
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 13, marginTop: 1 }}>
                    Active subscription
                  </Text>
                </View>
              </View>

              {/* Features */}
              <View style={{ gap: 8 }}>
                {PLAN_FEATURES.map((feature) => (
                  <View
                    key={feature}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: '#22c55e',
                      }}
                    />
                    <Text style={{ color: '#94a3b8', fontSize: 13 }}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Web management note */}
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 20,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#334155',
              backgroundColor: '#1e293b',
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <ExternalLink color="#64748b" size={18} />
            <Text style={{ color: '#64748b', fontSize: 13, lineHeight: 20, flex: 1 }}>
              Manage your account, billing, and subscription on{' '}
              <Text style={{ color: '#38bdf8' }}>DriveCommand web</Text>
            </Text>
          </View>
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
