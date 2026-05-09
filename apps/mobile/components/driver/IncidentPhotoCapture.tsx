import React, { useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { Camera, X } from 'lucide-react-native'

interface IncidentPhotoCaptureProps {
  onPhotoSelected: (uri: string) => void
  onPhotoRemoved: () => void
  photoUri: string | null
}

export function IncidentPhotoCapture({
  onPhotoSelected,
  onPhotoRemoved,
  photoUri,
}: IncidentPhotoCaptureProps) {
  const [androidSheetVisible, setAndroidSheetVisible] = useState(false)

  async function launchCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(
        'Camera Access Required',
        'Please allow camera access in your device settings to take photos for incident reports.',
        [{ text: 'OK' }]
      )
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
    })

    if (!result.canceled && result.assets.length > 0) {
      onPhotoSelected(result.assets[0].uri)
    }
  }

  async function launchLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
    })

    if (!result.canceled && result.assets.length > 0) {
      onPhotoSelected(result.assets[0].uri)
    }
  }

  function handleAddPhoto() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Take Photo', 'Choose from Library', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) launchCamera()
          else if (buttonIndex === 1) launchLibrary()
        }
      )
    } else {
      setAndroidSheetVisible(true)
    }
  }

  if (photoUri) {
    return (
      <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
        <Image
          source={{ uri: photoUri }}
          style={{
            width: 100,
            height: 100,
            borderRadius: 8,
            backgroundColor: '#1e293b',
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <Pressable
          onPress={onPhotoRemoved}
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#dc2626',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X color="#ffffff" size={14} />
        </Pressable>
      </View>
    )
  }

  return (
    <>
      <Pressable
        onPress={handleAddPhoto}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: '#1e293b',
          borderWidth: 1,
          borderColor: '#475569',
          borderStyle: 'dashed',
          borderRadius: 8,
          alignSelf: 'flex-start',
        }}
      >
        <Camera color="#94a3b8" size={18} />
        <Text style={{ color: '#94a3b8', fontSize: 14 }}>Add Photo (Optional)</Text>
      </Pressable>

      {/* Android cross-platform action sheet fallback */}
      {Platform.OS === 'android' && (
        <Modal
          visible={androidSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setAndroidSheetVisible(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
            onPress={() => setAndroidSheetVisible(false)}
          />
          <View
            style={{
              backgroundColor: '#1e293b',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 16,
              paddingBottom: 40,
              paddingHorizontal: 24,
            }}
          >
            {/* Handle */}
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                backgroundColor: '#475569',
                borderRadius: 2,
                marginBottom: 20,
              }}
            />

            <Pressable
              onPress={() => {
                setAndroidSheetVisible(false)
                launchCamera()
              }}
              style={{
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#334155',
              }}
            >
              <Text style={{ color: '#f1f5f9', fontSize: 16 }}>Take Photo</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setAndroidSheetVisible(false)
                launchLibrary()
              }}
              style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#334155' }}
            >
              <Text style={{ color: '#f1f5f9', fontSize: 16 }}>Choose from Library</Text>
            </Pressable>

            <Pressable
              onPress={() => setAndroidSheetVisible(false)}
              style={{ paddingVertical: 16 }}
            >
              <Text style={{ color: '#94a3b8', fontSize: 16 }}>Cancel</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </>
  )
}
