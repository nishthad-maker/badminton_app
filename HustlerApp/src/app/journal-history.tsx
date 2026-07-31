import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { JournalSheet, localDateStr } from '@/components/JournalSheet';

const INK = '#44403C';
const PAPER = '#E7E5E0';

const fmtRowDate = (dateStr: string) => {
  if (dateStr === localDateStr()) return 'Today';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

type EntryTab = 'lesson' | 'personal';

export default function JournalHistoryScreen() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Sheet state: entryId set = editing that entry; open + entryId undefined = resume/new.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openEntryId, setOpenEntryId] = useState<string | undefined>(undefined);
  const [forceNew, setForceNew] = useState(false);
  const [activeTab, setActiveTab] = useState<EntryTab>('lesson');

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }
    const { data } = await supabase
      .from('journal_entries').select('*').eq('user_id', session.user.id).eq('is_draft', false)
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false });
    setEntries(data ?? []);
    setLoading(false);
  };

  const openEntry = (id: string) => { setOpenEntryId(id); setForceNew(false); setSheetOpen(true); };
  const openNewEntry = () => { setOpenEntryId(undefined); setForceNew(true); setSheetOpen(true); };
  const closeSheet = () => setSheetOpen(false);

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

  const filteredEntries = entries.filter(e => (e.entry_type === 'personal' ? 'personal' : 'lesson') === activeTab);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { flex: 1 }]}>Journal History</Text>
          <TouchableOpacity style={styles.newEntryBtn} onPress={openNewEntry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="plus" size={16} color="#FFFFFF" />
            <Text style={styles.newEntryBtnText}>New entry</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'lesson' && styles.tabActive]}
            onPress={() => setActiveTab('lesson')}
          >
            <Icon name="school-outline" size={16} color={activeTab === 'lesson' ? '#FFFFFF' : Theme.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'lesson' && styles.tabTextActive]}>Lessons learned</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'personal' && styles.tabActive]}
            onPress={() => setActiveTab('personal')}
          >
            <Icon name="heart-outline" size={16} color={activeTab === 'personal' ? '#FFFFFF' : Theme.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'personal' && styles.tabTextActive]}>Journal</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {filteredEntries.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name={activeTab === 'lesson' ? 'school-outline' : 'heart-outline'} size={48} color={Theme.textMuted} />
                <Text style={styles.emptyTitle}>No entries yet</Text>
                <Text style={styles.emptyDesc}>
                  {activeTab === 'lesson'
                    ? 'Log what you want to remember from training or a private lesson.'
                    : "Log what's on your mind — mental health, feelings, anything else."}
                </Text>
              </View>
            ) : (
              filteredEntries.map(e => (
                <TouchableOpacity key={e.id} style={styles.row} onPress={() => openEntry(e.id)}>
                  <View style={styles.rowIcon}>
                    <Icon name={activeTab === 'personal' ? 'heart-outline' : 'school-outline'} size={18} color={INK} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowDate}>{fmtRowDate(e.entry_date)}</Text>
                    <Text style={styles.rowPreview} numberOfLines={1}>{preview(e)}</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={Theme.textMuted} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}
      </View>

      <JournalSheet
        visible={sheetOpen}
        onClose={closeSheet}
        entryDate={localDateStr()}
        entryId={openEntryId}
        forceNew={forceNew}
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
  newEntryBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: INK, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12 },
  newEntryBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  tabRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Theme.cardWhite, borderRadius: 20, paddingVertical: 11 },
  tabActive: { backgroundColor: INK },
  tabText: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary },
  tabTextActive: { color: '#FFFFFF' },
  scroll: { paddingBottom: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 14, marginBottom: 10 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: PAPER, alignItems: 'center', justifyContent: 'center' },
  rowDate: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  rowPreview: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});
