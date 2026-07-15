import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput, RefreshControl } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

type MatchRow = {
  id: string;
  opponent_id: string;
  opponent_name: string | null;
  result: 'win' | 'loss' | 'unsure' | null;
  match_type: 'singles' | 'doubles' | null;
  created_at: string;
};

export default function MatchesScreen() {
  const [recentMatches, setRecentMatches] = useState<MatchRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); setRefreshing(false); return; }
    const me = session.user.id;

    const { data: logs } = await supabase
      .from('opponent_logs')
      .select('id, opponent_id, opponent_name, result, match_type, created_at')
      .eq('player_id', me)
      .order('created_at', { ascending: false });
    setRecentMatches((logs ?? []) as MatchRow[]);

    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = recentMatches.filter(m => (m.opponent_name ?? '').toLowerCase().includes(search.trim().toLowerCase()));

  // One card per opponent — dedupe repeat matches against the same person,
  // keeping the most recent result (filtered is already newest-first) and a count.
  const groupedMatches = (() => {
    const map = new Map<string, { key: string; opponent_id: string; opponent_name: string | null; latestResult: MatchRow['result']; latestType: MatchRow['match_type']; count: number }>();
    filtered.forEach(m => {
      const key = m.opponent_id ?? m.opponent_name ?? m.id;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, opponent_id: m.opponent_id, opponent_name: m.opponent_name, latestResult: m.result, latestType: m.match_type, count: 1 });
    });
    return Array.from(map.values());
  })();

  const openMatch = (m: { opponent_id: string; opponent_name: string | null }) =>
    router.push({ pathname: '/opponent-detail', params: { opponentId: m.opponent_id, name: m.opponent_name ?? '' } });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>MATCH JOURNAL</Text>
        <Text style={styles.title}>Matches</Text>
        <Text style={styles.subtitle}>Log the moments that shape your next court session.</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => router.push({ pathname: '/log-match', params: { quick: '1' } })}>
            <MaterialCommunityIcons name="tune" size={19} color="#0C447C" />
            <Text style={styles.quickBtnText}>Quick log</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logBtn} onPress={() => router.push('/log-match')}>
            <MaterialCommunityIcons name="plus" size={21} color="#FFFFFF" />
            <Text style={styles.logBtnText}>Log a match</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={21} color="#0C447C" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search opponents..."
          placeholderTextColor={Theme.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.eyebrowGreen} colors={[Theme.eyebrowGreen]} />}
      >
        <TouchableOpacity style={styles.analysisCard} onPress={() => router.push('/game-analysis')}>
          <View style={styles.analysisIconBox}>
            <MaterialCommunityIcons name="chart-timeline-variant" size={28} color="#44403C" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.analysisTitle}>Game analysis</Text>
            <Text style={styles.analysisDesc}>See patterns across your matches as you log more games.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={Theme.textMuted} />
        </TouchableOpacity>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent matches</Text>
          <Text style={styles.sectionCount}>{recentMatches.length} logged</Text>
        </View>

        {loading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : groupedMatches.length === 0 && recentMatches.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={56} color={Theme.textMuted} />
            <Text style={styles.emptyTitle}>No opponents logged yet</Text>
            <Text style={styles.emptyDesc}>Log a match after you play to start building your scouting book.</Text>
          </View>
        ) : groupedMatches.length === 0 ? (
          <Text style={styles.muted}>No opponents match "{search}".</Text>
        ) : (
          groupedMatches.map(g => (
            <TouchableOpacity key={g.key} style={styles.card} onPress={() => openMatch(g)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(g.opponent_name ?? '?').charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={styles.cardNameRow}>
                  <Text style={styles.cardName}>{g.opponent_name ?? 'Opponent'}</Text>
                  {g.latestType && (
                    <View style={styles.typeTag}>
                      <Text style={styles.typeTagText}>{g.latestType === 'singles' ? 'Singles' : 'Doubles'}</Text>
                    </View>
                  )}
                </View>
                {g.count > 1 && <Text style={styles.cardMeta}>{g.count} matches logged</Text>}
              </View>
              {g.latestResult && g.latestResult !== 'unsure' && (
                <View style={[styles.resultBadge, g.latestResult === 'win' ? styles.resultWon : styles.resultLost]}>
                  <Text style={[styles.resultBadgeText, g.latestResult === 'win' ? styles.resultWonText : styles.resultLostText]}>
                    {g.latestResult === 'win' ? 'Won' : 'Lost'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background, padding: 24, paddingTop: 60 },
  header: { marginBottom: 20, gap: 8 },
  eyebrow: { fontSize: 13, fontWeight: '500', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 6 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 40, color: Theme.textPrimary },
  subtitle: { fontSize: 17, color: Theme.textSecondary, lineHeight: 24, marginBottom: 6 },
  headerBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  quickBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.cardTinted, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 15 },
  quickBtnText: { fontSize: 16, fontWeight: '700', color: '#0C447C' },
  logBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.eyebrowGreen, borderRadius: 28, paddingHorizontal: 22, paddingVertical: 15 },
  logBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardWhite, borderRadius: 32, paddingHorizontal: 22, marginBottom: 24 },
  searchInput: { flex: 1, color: Theme.textPrimary, fontSize: 17, paddingVertical: 17, outlineStyle: 'none' } as any,
  scroll: { paddingBottom: 170 },
  analysisCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: Theme.cardWhite, borderRadius: 22, padding: 22, marginBottom: 28, borderWidth: 1, borderColor: Theme.divider },
  analysisIconBox: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#E7E5E0', alignItems: 'center', justifyContent: 'center' },
  analysisTitle: { fontSize: 19, fontWeight: '700', color: Theme.textPrimary },
  analysisDesc: { fontSize: 15, color: Theme.textSecondary, marginTop: 4, lineHeight: 20 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Theme.textPrimary },
  sectionCount: { fontSize: 15, color: Theme.textSecondary, fontWeight: '600', marginBottom: 4 },
  muted: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 17, marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E2EFAE', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: Theme.eyebrowGreen },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 18, fontWeight: '600', color: Theme.textPrimary },
  cardMeta: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  typeTag: { backgroundColor: '#E7E5E0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeTagText: { fontSize: 12, fontWeight: '600', color: '#44403C' },
  resultBadge: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7 },
  resultWon: { backgroundColor: Theme.limeAccent },
  resultLost: { backgroundColor: 'rgba(255,107,107,0.15)' },
  resultBadgeText: { fontSize: 14, fontWeight: '700' },
  resultWonText: { color: Theme.eyebrowGreen },
  resultLostText: { color: '#E14444' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 16, color: Theme.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
});
