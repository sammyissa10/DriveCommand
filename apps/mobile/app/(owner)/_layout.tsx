import { Fragment } from 'react'
import { Tabs } from 'expo-router'
import { LayoutDashboard, Map, Package, Users, MessageSquare } from 'lucide-react-native'
import { AppHeader } from '../../components/shared/AppHeader'
import { haptic } from '../../lib/haptics'

export default function OwnerLayout() {
  return (
    <Fragment>
      <AppHeader />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            marginTop: 2,
            marginBottom: 0,
          },
          tabBarStyle: {
            backgroundColor: '#1e293b',
            borderTopColor: '#334155',
            height: 72,
            paddingBottom: 10,
            paddingTop: 6,
          },
          tabBarActiveTintColor: '#0ea5e9',
          tabBarInactiveTintColor: '#64748b',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: 'Dashboard',
            tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={24} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="map"
          options={{
            tabBarLabel: 'Live Map',
            tabBarIcon: ({ color }) => <Map color={color} size={24} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="loads"
          options={{
            tabBarLabel: 'Loads',
            tabBarIcon: ({ color }) => <Package color={color} size={24} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="drivers"
          options={{
            tabBarLabel: 'Drivers',
            tabBarIcon: ({ color }) => <Users color={color} size={24} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="fleet"
          options={{
            tabBarLabel: 'Messages',
            tabBarIcon: ({ color }) => <MessageSquare color={color} size={24} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        {/* Hidden nested routes — href: null removes from tab bar */}
        <Tabs.Screen name="loads/index" options={{ href: null }} />
        <Tabs.Screen name="loads/[id]" options={{ href: null }} />
        <Tabs.Screen name="drivers/index" options={{ href: null }} />
        <Tabs.Screen name="drivers/[id]" options={{ href: null }} />
      </Tabs>
    </Fragment>
  )
}
