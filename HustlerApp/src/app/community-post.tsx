import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, Image, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { TOPICS, TOPIC_ICONS, containsBlockedWords } from '../lib/community';

const CLOUDINARY_CLOUD = 'pyqqwrax';
const CLOUDINARY_PRESET = 'hustler_videos';

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function NewPostScreen() {
  const { topic: initialTopic } = useLocalSearchParams();
  const [topic, setTopic] = useState((initialTopic as string) || TOPICS[0]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Please allow photo library access to add images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const removeImage = () => {
    setImageUri(null);
  };

  const uploadImageToCloudinary = async (uri: string): Promise<string | null> => {
    try {
      const formData = new FormData();

      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append('file', blob, 'post_image.jpg');
      } else {
        formData.append('file', {
          uri,
          type: 'image/jpeg',
          name: 'post_image.jpg',
        } as any);
      }

      formData.append('upload_preset', CLOUDINARY_PRESET);
      formData.append('folder', 'hustler_community');

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
        { method: 'POST', body: formData }
      );

      const data = await res.json();
      return data.secure_url ?? null;
    } catch (err) {
      console.log('Image upload error:', err);
      return null;
    }
  };

  const handlePost = async () => {
    if (!title.trim() || !body.trim()) {
      showAlert('Missing fields', 'Please add a title and some content for your post.');
      return;
    }

    if (containsBlockedWords(title) || containsBlockedWords(body)) {
      showAlert('Inappropriate content', 'Your post contains language that isn\'t allowed. Please keep it respectful.');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      showAlert('Not signed in', 'Please sign in to post.');
      return;
    }

    setLoading(true);

    let imageUrl: string | null = null;
    if (imageUri) {
      setUploadingImage(true);
      imageUrl = await uploadImageToCloudinary(imageUri);
      setUploadingImage(false);

      if (!imageUrl) {
        showAlert('Upload failed', 'Could not upload your image. You can try posting without it.');
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.from('community_posts').insert({
      user_id: session.user.id,
      topic,
      title: title.trim(),
      body: body.trim(),
      image_url: imageUrl,
    });
    setLoading(false);

    if (error) {
      showAlert('Error', 'Could not create your post. Please try again.');
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('is_coach').eq('id', session.user.id).single();
    const communityPath = profile?.is_coach ? '/(coach-tabs)/community' : '/(tabs)/community';

    // Return to the feed on the SAME topic we just posted in, so the new post
    // is visible instead of the feed resetting to the first tab.
    if (typeof window !== 'undefined') {
      window.location.href = `${communityPath}?topic=${encodeURIComponent(topic)}`;
    } else {
      router.replace({ pathname: communityPath as any, params: { topic } });
    }
  };

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={goBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Topic</Text>
        <View style={styles.topicGrid}>
          {TOPICS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.topicOption, topic === t && styles.topicOptionActive]}
              onPress={() => setTopic(t)}
            >
              <MaterialCommunityIcons
                name={TOPIC_ICONS[t] as any}
                size={14}
                color={topic === t ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.topicOptionText, topic === t && styles.topicOptionTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {topic === 'Recovery & Wellness' && (
          <View style={styles.disclaimer}>
            <MaterialCommunityIcons name="information-outline" size={16} color={Colors.accent} />
            <Text style={styles.disclaimerText}>
              This space is for wellness routines, not medical advice. Please don't diagnose or treat injuries here.
            </Text>
          </View>
        )}

        {topic === 'Local Tournaments' && (
          <View style={styles.disclaimer}>
            <MaterialCommunityIcons name="trophy" size={16} color={Colors.accent} />
            <Text style={styles.disclaimerText}>
              Share tournaments in your area! Include the date, location, and skill level so others can find and join.
            </Text>
          </View>
        )}

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.titleInput}
          placeholder={topic === 'Local Tournaments' ? "e.g. Saturday Doubles — Community Center" : "What's your post about?"}
          placeholderTextColor={Colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />

        <Text style={styles.label}>Content</Text>
        <TextInput
          style={styles.bodyInput}
          placeholder={topic === 'Local Tournaments'
            ? "Date, time, location, skill level, entry fee, contact info..."
            : "Share your thoughts, tips, or questions..."}
          placeholderTextColor={Colors.textSecondary}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={8}
          textAlignVertical="top"
        />

        {/* Image section */}
        <Text style={styles.label}>Photo (optional)</Text>
        {imageUri ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
            <TouchableOpacity style={styles.removeImageBtn} onPress={removeImage}>
              <MaterialCommunityIcons name="close-circle" size={24} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addImageBtn} onPress={pickImage}>
            <MaterialCommunityIcons name="camera-plus-outline" size={22} color={Colors.accent} />
            <Text style={styles.addImageText}>Add Photo</Text>
          </TouchableOpacity>
        )}

        <View style={styles.anonNote}>
          <MaterialCommunityIcons name="incognito" size={16} color={Colors.textSecondary} />
          <Text style={styles.anonNoteText}>Your post will appear anonymously with a random username.</Text>
        </View>

        <TouchableOpacity
          style={[styles.postBtn, loading && styles.postBtnDisabled]}
          onPress={handlePost}
          disabled={loading}
        >
          {uploadingImage ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.postBtnText}>Uploading image...</Text>
            </View>
          ) : (
            <Text style={styles.postBtnText}>{loading ? 'Posting...' : 'Post'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
  content: { paddingBottom: 60 },
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  topicOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topicOptionActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  topicOptionText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  topicOptionTextActive: { color: '#FFFFFF' },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  disclaimerText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  titleInput: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 10,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bodyInput: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 10,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 14,
    minHeight: 160,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  // Image styles
  addImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  addImageText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  imagePreviewWrap: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  anonNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  anonNoteText: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  postBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.6 },
  postBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});
