import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { getStrengthWeaknessSummary, TagCount } from '../lib/strengthWeaknessSummary';

// Video-analysis features on the roadmap but not built yet — a teaser
// banner rather than pretending they exist, so a player knows this is
// actively growing without the strength/weakness section below looking
// like the whole feature.
const COMING_SOON_FEATURES: { key: string; icon: string; label: string; desc: string }[] = [
  { key: 'swing', icon: 'badminton', label: 'Swing Analysis', desc: 'Upload match video for AI feedback on your swing form.' },
  { key: 'rally', icon: 'chart-line', label: 'Rally Count', desc: 'Automatic rally length and shot-count tracking per match.' },
  { key: 'corner', icon: 'map-marker-outline', label: 'Corner Detection', desc: 'See where on the court your shots actually land.' },
];

const sourceBreakdown = (t: TagCount) => {
  const parts: string[] = [];
  if (t.bySource.player > 0) parts.push(`${t.bySource.player} you`);
  if (t.bySource.parent > 0) parts.push(`${t.bySource.parent} parent`);
  if (t.bySource.coach > 0) parts.push(`${t.bySource.coach} coach`);
  return parts.join(' · ');
};

export default function GameAnalysisScreen() {
  const [loading, setLoading] = useState(true);
  const [strengths, setStrengths] = useState<TagCount[]>([]);
  const [weaknesses, setWeaknesses] = useState<TagCount[]>([]);

  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setLoading(false); return; }
      const summary = await getStrengthWeaknessSummary(session.user.id);
      setStrengths(summary.strengths);
      setWeaknesses(summary.weaknesses);
      setLoading(false);
    })();
  }, []);

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

  const hasAnyTags = strengths.length > 0 || weaknesses.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Game Analysis</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.soonCard}>
            <View style={styles.soonRibbon}>
              <Icon name="lock-outline" size={10} color="#FFFFFF" />
              <Text style={styles.soonRibbonText}>COMING SOON</Text>
            </View>
            <Text style={styles.soonTitle}>AI-powered video analysis</Text>
            <Text style={styles.soonDesc}>We're building tools that break down your actual match footage — here's what's next.</Text>
            {COMING_SOON_FEATURES.map((f) => (
              <View key={f.key} style={styles.soonRow}>
                <View style={styles.soonIconWrap}>
                  <Icon name={f.icon as any} size={16} color={Theme.todayBlue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.soonRowTitle}>{f.label}</Text>
                  <Text style={styles.soonRowDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}

            <View style={styles.soonFeedback}>
              <Text style={styles.soonFeedbackLabel}>What else would you want this to show?</Text>
              {submitted ? (
                <Text style={styles.soonThanks}>Thanks — noted!</Text>
              ) : (
                <>
                  <TextInput
                    style={styles.soonInput}
                    placeholder="Share your ideas..."
                    placeholderTextColor={Theme.textSecondary}
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[styles.soonSubmitBtn, (!message.trim() || submitting) && styles.submitBtnDisabled]}
                    onPress={submit}
                    disabled={!message.trim() || submitting}
                  >
                    {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Submit</Text>}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={Theme.eyebrowGreen} style={{ marginTop: 40 }} />
          ) : !hasAnyTags ? (
            <View style={styles.hero}>
              <Icon name="chart-line" size={48} color="#44403C" />
              <Text style={styles.heroTitle}>Nothing to show yet</Text>
              <Text style={styles.heroDesc}>
                Tag strengths and weaknesses when you log a match — a coach or parent's tagged notes count too — and they'll roll up here.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>WEAKNESSES</Text>
              <View style={styles.card}>
                {weaknesses.length === 0 ? (
                  <Text style={styles.muted}>Nothing tagged yet.</Text>
                ) : (
                  weaknesses.map((t) => (
                    <View key={t.tag} style={styles.row}>
                      <Text style={styles.rowTitle}>{t.tag}</Text>
                      <Text style={styles.rowSub}>Mentioned {t.count}x · {sourceBreakdown(t)}</Text>
                    </View>
                  ))
                )}
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>STRENGTHS</Text>
              <View style={styles.card}>
                {strengths.length === 0 ? (
                  <Text style={styles.muted}>Nothing tagged yet.</Text>
                ) : (
                  strengths.map((t) => (
                    <View key={t.tag} style={styles.row}>
                      <Text style={styles.rowTitle}>{t.tag}</Text>
                      <Text style={styles.rowSub}>Mentioned {t.count}x · {sourceBreakdown(t)}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  soonCard: { backgroundColor: '#E7E5E0', borderRadius: 16, padding: 14, marginBottom: 22, overflow: 'hidden' },
  soonRibbon: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: Theme.todayBlue, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
  soonRibbonText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  soonTitle: { fontFamily: Fonts.serifMedium, fontSize: 15, color: '#1A1A18', marginBottom: 4 },
  soonDesc: { fontSize: 12, color: '#5C5A52', lineHeight: 16, marginBottom: 10 },
  soonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' },
  soonIconWrap: { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  soonRowTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A18' },
  soonRowDesc: { fontSize: 11, color: '#5C5A52', marginTop: 1, lineHeight: 14 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  heroTitle: { fontSize: 20, fontWeight: 'bold', color: Theme.textPrimary },
  heroDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
  sectionLabel: { fontSize: 13, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 10 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: Theme.divider },
  muted: { fontSize: 14, color: Theme.textSecondary, fontStyle: 'italic' },
  row: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: Theme.divider },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  rowSub: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  soonFeedback: { marginTop: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: Theme.divider, gap: 8 },
  soonFeedbackLabel: { fontSize: 12, fontWeight: '600', color: Theme.textPrimary },
  soonInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    color: Theme.textPrimary,
    fontSize: 13,
    minHeight: 60,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  soonSubmitBtn: { backgroundColor: '#44403C', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  soonThanks: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
});
