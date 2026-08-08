import { View, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifySharedNoteAdded } from '../lib/notifications';
import { STRENGTH_CATEGORIES, WEAKNESS_CATEGORIES } from '@/constants/matchTags';
import { TagChipSelector } from '@/components/TagChipSelector';

// Always-visible note the coach writes for a specific player — unlike the
// private note textarea (coach_player_notes), every row this screen creates
// in coach_shared_notes is visible to the player as soon as it exists, so
// there's no share toggle here. Autosaves on a debounce as the coach types
// and is flushed on the way out so nothing typed is lost; an entry that's
// cleared back to empty deletes its row rather than leaving a blank note
// behind in the list.
export default function CoachSharedNoteScreen() {
  const { playerId, name } = useLocalSearchParams();
  const playerName = (name as string) || 'Player';

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [strengthsTags, setStrengthsTags] = useState<string[]>([]);
  const [weaknessesTags, setWeaknessesTags] = useState<string[]>([]);

  const coachIdRef = useRef<string | null>(null);
  const noteIdRef = useRef<string | null>(null);
  const notifiedRef = useRef(false);
  const textRef = useRef('');
  const tagsRef = useRef<{ strengths: string[]; weaknesses: string[] }>({ strengths: [], weaknesses: [] });
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      coachIdRef.current = session?.user?.id ?? null;
    });
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, []);

  const persist = async (value: string) => {
    const trimmed = value.trim();
    const coachId = coachIdRef.current;
    if (!coachId || !playerId) return;

    if (!trimmed) {
      if (noteIdRef.current) {
        await supabase.from('coach_shared_notes').delete().eq('id', noteIdRef.current);
        noteIdRef.current = null;
      }
      setSaved(false);
      return;
    }

    const tagsPayload = { strengths_tags: tagsRef.current.strengths, weaknesses_tags: tagsRef.current.weaknesses };
    setSaving(true);
    if (noteIdRef.current) {
      await supabase.from('coach_shared_notes')
        .update({ note: trimmed, ...tagsPayload, updated_at: new Date().toISOString() })
        .eq('id', noteIdRef.current);
    } else {
      const { data } = await supabase.from('coach_shared_notes')
        .insert({ coach_id: coachId, player_id: playerId as string, note: trimmed, ...tagsPayload })
        .select().single();
      if (data) {
        noteIdRef.current = data.id;
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          const { data: coachProfile } = await supabase.from('profiles').select('full_name').eq('id', coachId).single();
          notifySharedNoteAdded(playerId as string, coachProfile?.full_name ?? 'Your coach');
        }
      }
    }
    setSaving(false);
    setSaved(true);
  };

  const onChangeText = (t: string) => {
    setText(t);
    textRef.current = t;
    setSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => persist(t), 700);
  };

  const onChangeStrengthsTags = (tags: string[]) => {
    setStrengthsTags(tags);
    tagsRef.current = { ...tagsRef.current, strengths: tags };
    setSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => persist(textRef.current), 700);
  };

  const onChangeWeaknessesTags = (tags: string[]) => {
    setWeaknessesTags(tags);
    tagsRef.current = { ...tagsRef.current, weaknesses: tags };
    setSaved(false);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => persist(textRef.current), 700);
  };

  const goBack = async () => {
    if (saveTimeout.current) { clearTimeout(saveTimeout.current); saveTimeout.current = null; }
    await persist(textRef.current);
    if (router.canGoBack()) router.back();
    else router.replace('/(coach-tabs)/players' as any);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>NEW NOTE</Text>
            <Text style={styles.title}>{playerName}</Text>
          </View>
        </View>

        <View style={styles.visibleRow}>
          <Icon name="account-multiple" size={15} color={Theme.eyebrowGreen} />
          <Text style={styles.visibleText}>Visible to {playerName} — not private</Text>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.input}
            placeholder={`Write a note for ${playerName}...`}
            placeholderTextColor={Theme.textSecondary}
            value={text}
            onChangeText={onChangeText}
            multiline
            autoFocus
            textAlignVertical="top"
          />

          {showTags ? (
            <View style={styles.tagsSection}>
              <Text style={styles.tagsSectionLabel}>STRENGTHS</Text>
              <TagChipSelector categories={STRENGTH_CATEGORIES} selected={strengthsTags} onChange={onChangeStrengthsTags} />
              <Text style={[styles.tagsSectionLabel, { marginTop: 16 }]}>WEAKNESSES</Text>
              <TagChipSelector categories={WEAKNESS_CATEGORIES} selected={weaknessesTags} onChange={onChangeWeaknessesTags} />
            </View>
          ) : (
            <TouchableOpacity style={styles.addTagsBtn} onPress={() => setShowTags(true)}>
              <Icon name="tag-outline" size={16} color={Theme.eyebrowGreen} />
              <Text style={styles.addTagsBtnText}>Tag strengths/weaknesses (optional)</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={styles.footerRow}>
          {saving ? (
            <>
              <ActivityIndicator size="small" color={Theme.textSecondary} />
              <Text style={styles.footerText}>Saving...</Text>
            </>
          ) : saved ? (
            <Text style={styles.footerText}>Saved</Text>
          ) : (
            <Text style={styles.footerText}></Text>
          )}
        </View>

        <TouchableOpacity style={styles.doneBtn} onPress={goBack}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  eyebrow: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 3 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 26, color: Theme.textPrimary },
  visibleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  visibleText: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '600' },
  input: {
    minHeight: 220,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 18,
    color: Theme.textPrimary,
    fontSize: 17,
    lineHeight: 25,
  },
  addTagsBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 6 },
  addTagsBtnText: { fontSize: 14, fontWeight: '600', color: Theme.eyebrowGreen },
  tagsSection: { marginTop: 18, backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18 },
  tagsSectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.textSecondary, letterSpacing: 1, marginBottom: 8 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 24, marginTop: 12 },
  footerText: { fontSize: 13, color: Theme.textSecondary, fontStyle: 'italic' },
  doneBtn: { backgroundColor: Theme.limeAccent, borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 10, marginBottom: 10 },
  doneBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 17 },
});
