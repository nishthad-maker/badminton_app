import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { showAlert } from '../lib/ui';
import { getShareableCoaches, ShareableCoach } from '../lib/coachSharing';
import {
  getAllTournaments, logChildMatch, UpcomingTournament,
  getRecentChildLogForOpponent, appendParentNotesToLog, RecentChildLog,
} from '../lib/parentDashboard';

type Result = 'win' | 'loss' | 'unsure';
type MatchType = 'singles' | 'doubles';

// Parent-facing counterpart to log-match.tsx — a single-page form rather than
// a step wizard (fewer fields: no voice note/video, no score entry, no skill
// tags) since a parent is typically jotting down what they saw courtside in
// plain language, not the structured scouting report the player/coach would
// log — free text only, so it never feeds the tag-based strength/weakness
// tally (see getStrengthWeaknessSummary), just shows up narratively wherever
// this match's log is viewed. Never touches the opponents.wins/losses
// aggregate either — see logChildMatch in lib/parentDashboard.ts.
export default function LogMatchParentScreen() {
  const params = useLocalSearchParams();
  const childId = params.childId as string;
  const childName = (params.childName as string) || 'your player';
  const presetTournamentId = (params.tournamentBlockId as string) || null;
  const presetOpponentName = (params.opponentName as string) || '';

  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  const [opponentName, setOpponentName] = useState(presetOpponentName);
  const [allOpponents, setAllOpponents] = useState<{ id: string; name: string }[]>([]);
  const [result, setResult] = useState<Result>('win');
  const [matchType, setMatchType] = useState<MatchType>('singles');
  const [strengthsText, setStrengthsText] = useState('');
  const [weaknessesText, setWeaknessesText] = useState('');
  const [tournaments, setTournaments] = useState<UpcomingTournament[]>([]);
  const [tournamentBlockId, setTournamentBlockId] = useState<string | null>(presetTournamentId);
  const [shareableCoaches, setShareableCoaches] = useState<ShareableCoach[]>([]);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // If the child already logged this same opponent recently, offer to add
  // these notes to THAT log instead of creating a second, duplicate entry —
  // otherwise a coach shared on both ends up seeing what looks like two
  // separate matches. See getRecentChildLogForOpponent in parentDashboard.ts.
  const [recentChildLog, setRecentChildLog] = useState<RecentChildLog | null>(null);
  const [mergeDismissed, setMergeDismissed] = useState(false);
  const [appendMode, setAppendMode] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setLoading(false); return; }
      setMyId(session.user.id);
      const [{ data: opps }, coaches, tourneys] = await Promise.all([
        supabase.from('opponents').select('id, name').eq('player_id', childId),
        getShareableCoaches(childId),
        getAllTournaments(childId),
      ]);
      setAllOpponents(opps ?? []);
      setShareableCoaches(coaches);
      setTournaments(tourneys);
      setLoading(false);
    })();
  }, [childId]);

  const nameSuggestions = opponentName.trim().length > 0
    ? allOpponents.filter(o => o.name.toLowerCase().includes(opponentName.trim().toLowerCase()) && o.name.toLowerCase() !== opponentName.trim().toLowerCase())
    : [];

  // Only fires once the typed name exactly matches an existing opponent
  // (not on every keystroke) — matches nameSuggestions' own case-insensitive
  // comparison so "did they mean this opponent" stays consistent.
  useEffect(() => {
    const matched = allOpponents.find(o => o.name.toLowerCase() === opponentName.trim().toLowerCase());
    if (!matched) { setRecentChildLog(null); setAppendMode(false); return; }
    setMergeDismissed(false);
    getRecentChildLogForOpponent(childId, matched.id).then(setRecentChildLog);
  }, [opponentName, allOpponents, childId]);

  const dismissMerge = () => { setMergeDismissed(true); setAppendMode(false); };

  const save = async () => {
    if (!myId) return;
    if (!opponentName.trim()) { showAlert('Opponent name needed', 'Enter who they played.'); return; }
    setSaving(true);
    if (appendMode && recentChildLog) {
      const res = await appendParentNotesToLog({
        logId: recentChildLog.id, childId, opponentName,
        strengthsText, weaknessesText,
        previouslySharedWithCoachIds: recentChildLog.sharedWithCoachIds, sharedWithCoachIds: selectedCoachIds,
      });
      setSaving(false);
      if (!res.ok) { showAlert('Error', res.message || 'Could not save this log.'); return; }
      router.back();
      return;
    }
    const res = await logChildMatch({
      parentId: myId, childId, opponentName, result, matchType,
      strengthsTags: [], weaknessesTags: [], strengthsText, weaknessesText,
      tournamentBlockId, sharedWithCoachIds: selectedCoachIds,
    });
    setSaving(false);
    if (!res.ok) { showAlert('Error', res.message || 'Could not save this log.'); return; }
    router.back();
  };

  const resultOptions: { key: Result; label: string; icon: string }[] = [
    { key: 'win', label: 'Win', icon: 'trophy-outline' },
    { key: 'loss', label: 'Loss', icon: 'close-circle-outline' },
  ];
  const matchTypeOptions: { key: MatchType; label: string; icon: string }[] = [
    { key: 'singles', label: 'Singles', icon: 'account-outline' },
    { key: 'doubles', label: 'Doubles', icon: 'account-multiple-outline' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Log a Match</Text>
        </View>
        <Text style={styles.subtitle}>What you saw {childName} play — this won't affect their win/loss record.</Text>

        {loading ? (
          <ActivityIndicator color={Theme.eyebrowGreen} style={{ marginTop: 40 }} />
        ) : (
          <>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              <View style={styles.card}>
                <Text style={styles.label}>Opponent</Text>
                <TextInput style={styles.input} placeholder="Opponent name" placeholderTextColor={Theme.textSecondary} value={opponentName} onChangeText={setOpponentName} />
                {nameSuggestions.length > 0 && (
                  <View style={styles.suggestionList}>
                    {nameSuggestions.map(o => (
                      <TouchableOpacity key={o.id} style={styles.suggestionRow} onPress={() => setOpponentName(o.name)}>
                        <Icon name="history" size={14} color={Theme.textSecondary} />
                        <Text style={styles.suggestionText}>{o.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {recentChildLog && !mergeDismissed && (
                  <View style={styles.mergeBanner}>
                    <Text style={styles.mergeBannerText}>
                      {appendMode
                        ? `Adding your notes to ${childName}'s existing log for this match.`
                        : `${childName} already logged a match against ${opponentName.trim()} recently — is this the same match?`}
                    </Text>
                    {appendMode ? (
                      <TouchableOpacity onPress={dismissMerge}><Text style={styles.mergeBannerLink}>Not the same — log separately instead</Text></TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                        <TouchableOpacity onPress={() => setAppendMode(true)}><Text style={styles.mergeBannerLinkStrong}>Add my notes to it</Text></TouchableOpacity>
                        <TouchableOpacity onPress={dismissMerge}><Text style={styles.mergeBannerLink}>No, separate match</Text></TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                {!appendMode && (
                <>
                <Text style={[styles.label, { marginTop: 16 }]}>Match type</Text>
                <View style={styles.chipRow}>
                  {matchTypeOptions.map(opt => (
                    <TouchableOpacity key={opt.key} style={[styles.chip, matchType === opt.key && styles.chipActive]} onPress={() => setMatchType(opt.key)}>
                      <Icon name={opt.icon as any} size={16} color={matchType === opt.key ? '#FFFFFF' : Theme.textSecondary} />
                      <Text style={[styles.chipText, matchType === opt.key && styles.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.label, { marginTop: 16 }]}>Result</Text>
                <View style={styles.chipRow}>
                  {resultOptions.map(opt => (
                    <TouchableOpacity key={opt.key} style={[styles.chip, result === opt.key && styles.chipActive]} onPress={() => setResult(opt.key)}>
                      <Icon name={opt.icon as any} size={16} color={result === opt.key ? '#FFFFFF' : Theme.textSecondary} />
                      <Text style={[styles.chipText, result === opt.key && styles.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {tournaments.length > 0 && (
                  <>
                    <Text style={[styles.label, { marginTop: 16 }]}>Tournament (optional)</Text>
                    <View style={[styles.chipRow, { flexWrap: 'wrap' }]}>
                      <TouchableOpacity style={[styles.chip, !tournamentBlockId && styles.chipActive]} onPress={() => setTournamentBlockId(null)}>
                        <Text style={[styles.chipText, !tournamentBlockId && styles.chipTextActive]}>None</Text>
                      </TouchableOpacity>
                      {tournaments.map(t => (
                        <TouchableOpacity key={t.id} style={[styles.chip, tournamentBlockId === t.id && styles.chipActive]} onPress={() => setTournamentBlockId(t.id)}>
                          <Text style={[styles.chipText, tournamentBlockId === t.id && styles.chipTextActive]}>{t.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                </>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>What mistakes did you see?</Text>
                <TextInput style={[styles.input, styles.multiline]} placeholder="e.g. Kept hitting long on the backhand side..." placeholderTextColor={Theme.textSecondary} value={weaknessesText} onChangeText={setWeaknessesText} multiline />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>What did they do well?</Text>
                <TextInput style={[styles.input, styles.multiline]} placeholder="e.g. Aggressive at the net, good court coverage..." placeholderTextColor={Theme.textSecondary} value={strengthsText} onChangeText={setStrengthsText} multiline />
              </View>

              <View style={styles.card}>
                <View style={styles.shareRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shareLabel}>Share this log with a coach</Text>
                    <Text style={styles.shareHint}>
                      {selectedCoachIds.length > 0 ? `Shared with ${selectedCoachIds.length} coach${selectedCoachIds.length > 1 ? 'es' : ''}.` : 'Off by default.'}
                    </Text>
                  </View>
                  <Switch
                    value={selectedCoachIds.length > 0}
                    onValueChange={(v) => setSelectedCoachIds(v ? shareableCoaches.map((c) => c.id) : [])}
                    trackColor={{ false: Theme.divider, true: Theme.eyebrowGreen }}
                    thumbColor="#FFFFFF"
                    disabled={shareableCoaches.length === 0}
                  />
                </View>
                {shareableCoaches.length === 0 ? (
                  <Text style={styles.shareHint}>No coach to share with yet.</Text>
                ) : selectedCoachIds.length > 0 && shareableCoaches.length > 1 && (
                  <View style={[styles.chipRow, { flexWrap: 'wrap', marginTop: 10 }]}>
                    {shareableCoaches.map((c) => {
                      const active = selectedCoachIds.includes(c.id);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setSelectedCoachIds((prev) => prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id])}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.full_name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>{appendMode ? 'Add My Notes' : 'Save'}</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  subtitle: { fontSize: 14, color: Theme.textSecondary, marginBottom: 16, lineHeight: 20 },
  scroll: { paddingBottom: 24, gap: 16 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 20, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, color: Theme.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Theme.background, borderRadius: 10, padding: 14, color: Theme.textPrimary,
    fontSize: 14, borderWidth: 1, borderColor: Theme.divider,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  suggestionList: { marginTop: 8, gap: 4 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Theme.divider },
  suggestionText: { flex: 1, fontSize: 14, color: Theme.textPrimary },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: Theme.background, borderWidth: 1, borderColor: Theme.divider },
  chipActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  chipText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareLabel: { fontSize: 14, fontWeight: '600', color: Theme.textPrimary },
  shareHint: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  mergeBanner: { backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 12, marginTop: 12 },
  mergeBannerText: { fontSize: 13, color: Theme.textPrimary, lineHeight: 18 },
  mergeBannerLink: { fontSize: 13, color: Theme.textSecondary, textDecorationLine: 'underline', marginTop: 8 },
  mergeBannerLinkStrong: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '700', textDecorationLine: 'underline' },
  footer: { paddingTop: 16 },
  primaryBtn: { backgroundColor: Theme.limeAccent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 15 },
});
