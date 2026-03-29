import { Fragment } from 'react'
import { Tabs } from 'expo-router'
import { LayoutDashboard, Map, Package, Users, Grid2X2 } from 'lucide-react-native'
import { AppHeader } from '../../components/shared/AppHeader'
import { SupportTicketFAB } from '../../components/shared/SupportTicketFAB'
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
            backgroundColor: '#0c1524',
            borderTopWidth: 0,
            borderTopColor: 'transparent',
            height: 72,
            paddingBottom: 10,
            paddingTop: 6,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 8,
          },
          tabBarActiveTintColor: '#38bdf8',
          tabBarInactiveTintColor: '#4a5e78',
          tabBarActiveBackgroundColor: 'rgba(56,189,248,0.18)',
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
          name="more"
          options={{
            tabBarLabel: 'More',
            tabBarIcon: ({ color }) => <Grid2X2 color={color} size={24} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
      </Tabs>

      {/* Support ticket FAB — persistent on all owner screens */}
      <SupportTicketFAB />
    </Fragment>
  )
}
