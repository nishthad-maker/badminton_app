import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { JournalSheet, localDateStr } from '@/components/JournalSheet';

const INK = '#44403C';
const PAPER = '#E7E5E0';

const fmtRowDate = (dateStr: string) => {
  if (dateStr === localDateStr()) return 'Today';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export default function JournalHistoryScreen() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }
    const { data } = await supabase
      .from('journal_entries').select('*').eq('user_id', session.user.id).order('entry_date', { ascending: false });
    setEntries(data ?? []);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const preview = (e: any) => {
    if (e.free_text) return e.free_text as string;
    if (e.soreness_tags?.length > 0) return `Sore: ${e.soreness_tags.join(', ')}`;
    return 'No notes';
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Journal History</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {entries.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="notebook-edit-outline" size={48} color={Theme.textMuted} />
                <Text style={styles.emptyTitle}>No entries yet</Text>
                <Text style={styles.emptyDesc}>Tap the journal button on Home, Train, Matches, or Community to log your first entry.</Text>
              </View>
            ) : (
              entries.map(e => (
                <TouchableOpacity key={e.id} style={styles.row} onPress={() => setOpenDate(e.entry_date)}>
                  <View style={styles.rowIcon}>
                    <MaterialCommunityIcons name="notebook-outline" size={18} color={INK} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowDate}>{fmtRowDate(e.entry_date)}</Text>
                    <Text style={styles.rowPreview} numberOfLines={1}>{preview(e)}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Theme.textMuted} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}
      </View>

      <JournalSheet
        visible={!!openDate}
        onClose={() => setOpenDate(null)}
        entryDate={openDate ?? ''}
        onSaved={load}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
  scroll: { paddingBottom: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 14, marginBottom: 10 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: PAPER, alignItems: 'center', justifyContent: 'center' },
  rowDate: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  rowPreview: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});
