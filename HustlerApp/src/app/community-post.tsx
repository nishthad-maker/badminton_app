import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { TOPICS, TOPIC_ICONS, containsBlockedWords } from '../lib/community';

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
  const [loading, setLoading] = useState(false);

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
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
    const { error } = await supabase.from('community_posts').insert({
      user_id: session.user.id,
      topic,
      title: title.trim(),
      body: body.trim(),
    });
    setLoading(false);

    if (error) {
      showAlert('Error', 'Could not create your post. Please try again.');
      return;
    }

    if (typeof window !== 'undefined') {
      window.location.href = '/(tabs)/community';
    } else {
      router.back();
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

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.titleInput}
          placeholder="What's your post about?"
          placeholderTextColor={Colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />

        <Text style={styles.label}>Content</Text>
        <TextInput
          style={styles.bodyInput}
          placeholder="Share your thoughts, tips, or questions..."
          placeholderTextColor={Colors.textSecondary}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={8}
          textAlignVertical="top"
        />

        <View style={styles.anonNote}>
          <MaterialCommunityIcons name="incognito" size={16} color={Colors.textSecondary} />
          <Text style={styles.anonNoteText}>Your post will appear anonymously with a random username.</Text>
        </View>

        <TouchableOpacity
          style={[styles.postBtn, loading && styles.postBtnDisabled]}
          onPress={handlePost}
          disabled={loading}
        >
          <Text style={styles.postBtnText}>{loading ? 'Posting...' : 'Post'}</Text>
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
