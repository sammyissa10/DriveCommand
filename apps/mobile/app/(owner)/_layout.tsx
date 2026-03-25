import { Fragment } from 'react'
import { Tabs } from 'expo-router'
import { LayoutDashboard, Map, Package, Users, Radio } from 'lucide-react-native'
import { AppHeader } from '../../components/shared/AppHeader'
import { haptic } from '../../lib/haptics'

export default function OwnerLayout() {
  return (
    <Fragment>
      <AppHeader />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            backgroundColor: '#1e293b',
            borderTopColor: '#334155',
            height: 64,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: '#0ea5e9',
          tabBarInactiveTintColor: '#64748b',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={24} /> }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="map"
          options={{ tabBarIcon: ({ color }) => <Map color={color} size={24} /> }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="loads"
          options={{ tabBarIcon: ({ color }) => <Package color={color} size={24} /> }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="drivers"
          options={{ tabBarIcon: ({ color }) => <Users color={color} size={24} /> }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="fleet"
          options={{ tabBarIcon: ({ color }) => <Radio color={color} size={24} /> }}
          listeners={{ tabPress: () => haptic.light() }}
        />
      </Tabs>
    </Fragment>
  )
}
