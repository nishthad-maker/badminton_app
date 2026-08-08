import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { getAllTournaments, UpcomingTournament } from '../../lib/parentDashboard';
import { PepTalkModal } from '@/components/PepTalkModal';

type MatchRow = {
  id: string;
  opponent_id: string;
  opponent_name: string | null;
  result: 'win' | 'loss' | 'unsure' | null;
  match_type: 'singles' | 'doubles' | null;
  created_at: string;
  tournament_block_id: string | null;
};

export default function MatchesScreen() {
  const [myId, setMyId] = useState<string | null>(null);
  const [recentMatches, setRecentMatches] = useState<MatchRow[]>([]);
  const [tournaments, setTournaments] = useState<UpcomingTournament[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPepTalk, setShowPepTalk] = useState(false);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); setRefreshing(false); return; }
    const me = session.user.id;
    setMyId(me);

    const [{ data: logs }, tourneys] = await Promise.all([
      supabase
        .from('opponent_logs')
        .select('id, opponent_id, opponent_name, result, match_type, created_at, tournament_block_id')
        .eq('player_id', me)
        .order('created_at', { ascending: false }),
      getAllTournaments(me),
    ]);
    setRecentMatches((logs ?? []) as MatchRow[]);
    setTournaments(tourneys);

    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  // Search doubles as a tournament search too — searching "Nationals" turns
  // up every opponent played during that tournament, no separate
  // tournament-list view needed to get there (a tournament's own dates are
  // already on the Calendar; match-tagging happens when logging a match).
  const tournamentNameById = new Map(tournaments.map(t => [t.id, t.name]));
  const filtered = recentMatches.filter(m => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if ((m.opponent_name ?? '').toLowerCase().includes(q)) return true;
    const tourneyName = m.tournament_block_id ? tournamentNameById.get(m.tournament_block_id) : null;
    return !!tourneyName && tourneyName.toLowerCase().includes(q);
  });

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
            <Icon name="tune" size={19} color="#0C447C" />
            <Text style={styles.quickBtnText}>Quick log</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logBtn} onPress={() => router.push('/log-match')}>
            <Icon name="plus" size={21} color="#FFFFFF" />
            <Text style={styles.logBtnText}>Log a match</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Icon name="magnify" size={21} color="#0C447C" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search opponents or tournaments..."
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
        <View style={styles.tileRow}>
          <TouchableOpacity style={styles.tile} onPress={() => router.push('/game-analysis')}>
            <View style={styles.analysisIconBox}>
              <Icon name="chart-timeline-variant" size={38} color="#44403C" />
            </View>
            <Text style={styles.tileTitle}>Game analysis</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tile} onPress={() => setShowPepTalk(true)}>
            <View style={styles.pepTalkIconBox}>
              <Icon name="heart-pulse" size={38} color={Theme.flameOrange} />
            </View>
            <Text style={styles.tileTitle}>Mental Prep</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent matches</Text>
          <Text style={styles.sectionCount}>{recentMatches.length} logged</Text>
        </View>

        {loading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : groupedMatches.length === 0 && recentMatches.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="clipboard-text-outline" size={56} color={Theme.textMuted} />
            <Text style={styles.emptyTitle}>No opponents logged yet</Text>
            <Text style={styles.emptyDesc}>Log a match after you play to start building your scouting book.</Text>
          </View>
        ) : groupedMatches.length === 0 ? (
          <Text style={styles.muted}>Nothing matches "{search}".</Text>
        ) : (
          groupedMatches.map(g => (
            <TouchableOpacity key={g.key} style={styles.card} onPress={() => openMatch(g)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(g.opponent_name ?? '?').charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={styles.cardNameRow}>
                  <Text style={styles.cardName}>{g.opponent_name ?? 'Opponent'}</Text>
                  {g.latestType && (
                    <View style={[styles.typeTag, g.latestType === 'singles' ? styles.typeTagSingles : styles.typeTagDoubles]}>
                      <Text style={[styles.typeTagText, g.latestType === 'singles' ? styles.typeTagTextSingles : styles.typeTagTextDoubles]}>
                        {g.latestType === 'singles' ? 'Singles' : 'Doubles'}
                      </Text>
                    </View>
                  )}
                </View>
                {g.count > 1 && <Text style={styles.cardMeta}>{g.count} matches logged</Text>}
              </View>
              {g.latestResult && g.latestResult !== 'unsure' && (
                <View style={[styles.resultDot, g.latestResult === 'win' ? styles.resultDotWon : styles.resultDotLost]} />
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <PepTalkModal visible={showPepTalk} onClose={() => setShowPepTalk(false)} />
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
  tileRow: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  tile: { flex: 1, aspectRatio: 1, backgroundColor: Theme.cardWhite, borderRadius: 22, borderWidth: 1, borderColor: Theme.divider, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 12 },
  tileTitle: { fontSize: 16, fontWeight: '700', color: Theme.textPrimary, textAlign: 'center' },
  analysisIconBox: { width: 76, height: 76, borderRadius: 20, backgroundColor: '#E7E5E0', alignItems: 'center', justifyContent: 'center' },
  pepTalkIconBox: { width: 76, height: 76, borderRadius: 20, backgroundColor: '#FCE7D2', alignItems: 'center', justifyContent: 'center' },
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
  typeTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeTagSingles: { backgroundColor: Theme.cardTinted },
  typeTagDoubles: { backgroundColor: '#E2EFAE' },
  typeTagText: { fontSize: 12, fontWeight: '600' },
  typeTagTextSingles: { color: '#0C447C' },
  typeTagTextDoubles: { color: '#3B6D11' },
  resultDot: { width: 12, height: 12, borderRadius: 6 },
  resultDotWon: { backgroundColor: '#3BB273' },
  resultDotLost: { backgroundColor: '#E14444' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 16, color: Theme.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
});
