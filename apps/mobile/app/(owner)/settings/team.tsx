import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Shield } from 'lucide-react-native'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'

export default function TeamPermissionsScreen() {
  const router = useRouter()
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <AnimatedScreen>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text style={styles.title}>Team Permissions</Text>
        </View>
        <View style={styles.content}>
          <View style={styles.card}>
            <Shield color="#64748b" size={40} />
            <Text style={styles.cardTitle}>Team Permissions</Text>
            <Text style={styles.cardSubtitle}>Coming soon</Text>
          </View>
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: { marginRight: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 300,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginTop: 16 },
  cardSubtitle: { fontSize: 14, color: '#64748b', marginTop: 6 },
})
