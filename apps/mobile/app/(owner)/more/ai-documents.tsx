import React from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, FileText, Sparkles, Zap } from 'lucide-react-native'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'

const FEATURES = [
  {
    icon: FileText,
    color: '#38bdf8',
    title: 'Rate Confirmations',
    description: 'Automatically extract load details, rates, and shipper info from rate conf PDFs.',
  },
  {
    icon: FileText,
    color: '#22c55e',
    title: 'Bills of Lading',
    description: 'Parse BOL documents to capture pickup and delivery information instantly.',
  },
  {
    icon: FileText,
    color: '#8b5cf6',
    title: 'Load Tenders',
    description: 'Extract load tender data from emails and attachments to pre-fill dispatch.',
  },
  {
    icon: Zap,
    color: '#f59e0b',
    title: 'One-Click Import',
    description: 'Upload a document and let AI create the load — no manual data entry needed.',
  },
]

export default function AIDocumentsScreen() {
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
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>AI Documents</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Hero card */}
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 24,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#ec4899' + '40',
              backgroundColor: '#1e293b',
              padding: 28,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 68,
                height: 68,
                borderRadius: 20,
                backgroundColor: '#ec489920',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Sparkles color="#ec4899" size={32} />
            </View>

            <Text
              style={{
                color: '#f1f5f9',
                fontSize: 20,
                fontWeight: '700',
                textAlign: 'center',
                marginBottom: 10,
              }}
            >
              AI Document Reading
            </Text>

            <Text
              style={{
                color: '#94a3b8',
                fontSize: 14,
                lineHeight: 22,
                textAlign: 'center',
                marginBottom: 16,
              }}
            >
              Upload freight documents and let AI automatically extract load data — eliminating
              manual entry and reducing errors across your entire dispatch workflow.
            </Text>

            {/* Coming soon pill */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: '#ec489920',
                borderWidth: 1,
                borderColor: '#ec489940',
              }}
            >
              <Text
                style={{ color: '#ec4899', fontSize: 13, fontWeight: '600' }}
              >
                Coming Soon
              </Text>
            </View>
          </View>

          {/* Feature list */}
          <View style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>
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
              What it does
            </Text>

            {FEATURES.map((feature, idx) => (
              <View
                key={idx}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  backgroundColor: '#1e293b',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#334155',
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: feature.color + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                    flexShrink: 0,
                  }}
                >
                  <feature.icon color={feature.color} size={18} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: '#f1f5f9',
                      fontWeight: '600',
                      fontSize: 14,
                      marginBottom: 4,
                    }}
                  >
                    {feature.title}
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 13, lineHeight: 19 }}>
                    {feature.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Requirement note */}
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#f59e0b30',
              backgroundColor: '#f59e0b08',
              padding: 14,
              flexDirection: 'row',
              alignItems: 'flex-start',
            }}
          >
            <Text style={{ color: '#f59e0b', fontSize: 18, marginRight: 10, marginTop: -2 }}>
              !
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 20, flex: 1 }}>
              AI document reading requires an Anthropic API key configured in your DriveCommand
              account settings. Contact your administrator to enable this feature.
            </Text>
          </View>
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
