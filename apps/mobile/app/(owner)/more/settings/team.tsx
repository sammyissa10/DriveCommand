import React from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Crown, Shield, Truck } from 'lucide-react-native'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'

const ROLES = [
  {
    icon: Crown,
    color: '#f59e0b',
    label: 'Owner',
    description: 'Full access to all features. Can manage team members, billing, settings, and all operational data. Only one owner per account.',
    abilities: [
      'All operational features',
      'Team management & invitations',
      'Billing & subscription',
      'Account settings',
    ],
  },
  {
    icon: Shield,
    color: '#38bdf8',
    label: 'Manager',
    description: 'Operational access to manage drivers, loads, routes, and compliance. Cannot access billing or account settings.',
    abilities: [
      'Drivers & loads management',
      'Routes & dispatch',
      'Compliance monitoring',
      'CRM & invoices',
    ],
  },
  {
    icon: Truck,
    color: '#22c55e',
    label: 'Driver',
    description: 'Access to the driver mobile app only. Can view assigned loads, log HOS status, report incidents, and receive messages.',
    abilities: [
      'View assigned loads',
      'HOS logging',
      'Incident reporting',
      'Fleet messaging',
    ],
  },
]

export default function TeamPermissionsScreen() {
  const router = useRouter()

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
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>Team Permissions</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Intro */}
          <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
            <Text style={{ color: '#94a3b8', fontSize: 14, lineHeight: 22 }}>
              DriveCommand uses role-based access control. Each team member is assigned one of
              three roles that determines what they can see and do.
            </Text>
          </View>

          {/* Role cards */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <Text
              style={{
                color: '#94a3b8',
                fontSize: 12,
                fontWeight: '600',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              Available Roles
            </Text>

            {ROLES.map((role) => (
              <View
                key={role.label}
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#334155',
                  padding: 18,
                  marginBottom: 12,
                }}
              >
                {/* Role header */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: role.color + '20',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <role.icon color={role.color} size={20} />
                  </View>
                  <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 16 }}>
                    {role.label}
                  </Text>
                </View>

                {/* Description */}
                <Text
                  style={{
                    color: '#94a3b8',
                    fontSize: 13,
                    lineHeight: 20,
                    marginBottom: 14,
                  }}
                >
                  {role.description}
                </Text>

                {/* Abilities */}
                <View style={{ gap: 6 }}>
                  {role.abilities.map((ability) => (
                    <View
                      key={ability}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: role.color,
                        }}
                      />
                      <Text style={{ color: '#64748b', fontSize: 13 }}>{ability}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Web management note */}
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 8,
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
            <Shield color="#64748b" size={20} />
            <Text style={{ color: '#64748b', fontSize: 13, lineHeight: 20, flex: 1 }}>
              Invite team members and manage permissions on{' '}
              <Text style={{ color: '#38bdf8' }}>DriveCommand web</Text>
            </Text>
          </View>
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
