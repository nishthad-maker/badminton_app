import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';

export default function GameAnalysisScreen() {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const submit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase.from('feature_feedback').insert({ user_id: session.user.id, feature: 'game_analysis', message: message.trim() });
    }
    setSubmitting(false);
    setSubmitted(true);
    setMessage('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Game Analysis</Text>
        </View>

        <View style={styles.hero}>
          <Icon name="chart-line" size={48} color="#44403C" />
          <Text style={styles.heroTitle}>Coming Soon</Text>
          <Text style={styles.heroDesc}>
            We're building deeper match analysis — think shot patterns, rally length, and trends across all your matches over time.
          </Text>
        </View>

        <View style={styles.feedbackCard}>
          <Text style={styles.label}>What would you want this to show?</Text>
          {submitted ? (
            <Text style={styles.thanks}>Thanks — noted!</Text>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Share your ideas..."
                placeholderTextColor={Theme.textSecondary}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.submitBtn, (!message.trim() || submitting) && styles.submitBtnDisabled]}
                onPress={submit}
                disabled={!message.trim() || submitting}
              >
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Submit</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  heroTitle: { fontSize: 20, fontWeight: 'bold', color: Theme.textPrimary },
  heroDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
  feedbackCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, gap: 10, borderWidth: 1, borderColor: Theme.divider },
  label: { fontSize: 13, fontWeight: '600', color: Theme.textPrimary },
  input: {
    backgroundColor: Theme.background,
    borderRadius: 10,
    padding: 14,
    color: Theme.textPrimary,
    fontSize: 15,
    minHeight: 90,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  submitBtn: { backgroundColor: '#44403C', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  thanks: { fontSize: 14, color: '#44403C', fontWeight: '600' },
});
