import { Fragment } from 'react'
import { StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { LayoutDashboard, Map, Package, Users, Grid2X2 } from 'lucide-react-native'
import { AppHeader } from '../../components/shared/AppHeader'
import { SupportTicketFAB } from '../../components/shared/SupportTicketFAB'
import { SupportTicketProvider } from '../../context/SupportTicketContext'
import { haptic } from '../../lib/haptics'
import { colors, shadows, tabBar } from '../../constants/tokens'

export default function OwnerLayout() {
  return (
    <Fragment>
      <AppHeader />
      <SupportTicketProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: tabBar.labelSize,
            fontWeight: '500',
            marginTop: 2,
            marginBottom: 0,
          },
          tabBarStyle: {
            backgroundColor: colors.tabBarBg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.tabBarBorder,
            height: tabBar.height,
            paddingTop: 6,
            ...shadows.tabBar,
          },
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: 'Dashboard',
            tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={tabBar.iconSize} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="map"
          options={{
            tabBarLabel: 'Live Map',
            tabBarIcon: ({ color }) => <Map color={color} size={tabBar.iconSize} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="loads"
          options={{
            tabBarLabel: 'Loads',
            tabBarIcon: ({ color }) => <Package color={color} size={tabBar.iconSize} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="routes"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="drivers"
          options={{
            tabBarLabel: 'Drivers',
            tabBarIcon: ({ color }) => <Users color={color} size={tabBar.iconSize} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="more"
          options={{
            tabBarLabel: 'More',
            tabBarIcon: ({ color }) => <Grid2X2 color={color} size={tabBar.iconSize} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
      </Tabs>

      {/* Support ticket FAB — persistent on all owner screens (hidden on dashboard) */}
      <SupportTicketFAB />
      </SupportTicketProvider>
    </Fragment>
  )
}
