import { Fragment } from 'react'
import { Tabs } from 'expo-router'
import { LayoutDashboard, Map, Package, Users, Grid2X2 } from 'lucide-react-native'
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
          tabBarActiveTintColor: '#38bdf8',
          tabBarInactiveTintColor: '#475569',
          tabBarActiveBackgroundColor: 'rgba(14,165,233,0.08)',
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
        {/* Hidden screens - not visible in tab bar */}
        <Tabs.Screen name="fleet" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="invoices" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="crm" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="payroll" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="ai-documents" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="trucks" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="compliance" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="settings" options={{ href: null, headerShown: false }} />
      </Tabs>
    </Fragment>
  )
}
