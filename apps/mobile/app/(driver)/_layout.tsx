import { Tabs } from 'expo-router'
import { House, Truck, Clock, MessageSquare, FileText } from 'lucide-react-native'

export default function DriverLayout() {
  return (
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
        options={{ tabBarIcon: ({ color }) => <House color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="loads"
        options={{ tabBarIcon: ({ color }) => <Truck color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="hos"
        options={{ tabBarIcon: ({ color }) => <Clock color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          tabBarIcon: ({ color }) => (
            // Badge overlay for unread count — implemented in Phase 34
            <MessageSquare color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{ tabBarIcon: ({ color }) => <FileText color={color} size={24} /> }}
      />
    </Tabs>
  )
}
