import React from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MapPin } from 'lucide-react-native'
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'

export default function OwnerMapScreen() {
  return (
    <AnimatedScreen>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <MapPin color="#334155" size={48} />
          <Text style={{ color: '#475569', fontSize: 16, fontWeight: '600' }}>Live Map</Text>
          <Text style={{ color: '#334155', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
            Google Maps API key required.{'\n'}Configure in app.json to enable.
          </Text>
        </View>
      </SafeAreaView>
    </AnimatedScreen>
  )
}

