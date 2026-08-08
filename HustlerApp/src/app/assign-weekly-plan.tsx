import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifyWeeklyPlan } from '../lib/notifications';
import { getMyClub, getClubRosterForCoach } from '../lib/club';
import workouts from '../data/workouts';
import { localDateStr } from '../lib/scheduling';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const CATEGORIES = ['strength', 'footwork', 'endurance', 'recovery'];

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell', footwork: 'footprints', endurance: 'lightning-bolt', recovery: 'heart-pulse',
};

const catTheme = (cat: string) => CategoryTheme[cat as keyof typeof CategoryTheme] ?? { bg: Theme.onDarkAccent, fg: Theme.eyebrowGreen };

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const ALL_EXERCISES = CATEGORIES.flatMap(cat =>
  ((workouts as any)[cat] ?? []).map((ex: any) => ({
    name: ex.name, category: cat, logType: ex.logType ?? cat,
    description: ex.description ?? '', steps: ex.steps ?? [],
    muscles: ex.muscles ?? [], videoUrl: ex.videoUrl ?? '', imageUrl: ex.imageUrl ?? '',
  }))
);

export default function AssignWeeklyPlanScreen() {
  const { playerId, name, multiMode, coachId } = useLocalSearchParams();
  const isMultiMode = multiMode === 'true';

  // Multi-player state
  const [connectedPlayers, setConnectedPlayers] = useState<{ id: string; name: string }[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(
    playerId ? [playerId as string] : []
  );
  const [loadingPlayers, setLoadingPlayers] = useState(isMultiMode);

  // plan[dayKey] = array of exercises
  const [plan, setPlan] = useState<Record<string, any[]>>({});
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [saving, setSaving] = useState(false);

  // Adding to a day: pick from the exercise library, or write your own
  // workout (with your own sets/reps notes) from scratch.
  const [addMode, setAddMode] = useState<'library' | 'custom'>('library');
  const [customTitle, setCustomTitle] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [customCategory, setCustomCategory] = useState('');

  // Load connected players in multi mode
  useEffect(() => {
    if (!isMultiMode) return;
    const loadPlayers = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const [{ data: conns }, club] = await Promise.all([
        supabase.from('coach_connections').select('player_id').eq('coach_id', session.user.id).eq('status', 'accepted'),
        getMyClub(),
      ]);
      let pIds = (conns ?? []).map((c: any) => c.player_id);
      // A club-joined coach's roster comes from club_members, not
      // coach_connections — union both so bulk-assign can reach club players too.
      if (club) {
        const batches = await getClubRosterForCoach(club.clubId);
        const clubIds = batches.flatMap((b) => b.players.map((p) => p.id));
        pIds = [...new Set([...pIds, ...clubIds])];
      }
      if (!pIds.length) { setLoadingPlayers(false); return; }
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', pIds);
      setConnectedPlayers((profs ?? []).map((p: any) => ({ id: p.id, name: p.full_name ?? 'Player' })));
      setLoadingPlayers(false);
    };
    loadPlayers();
  }, []);

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const selectDay = (key: string) => {
    setActiveDay(prev => prev === key ? null : key);
    setAddMode('library');
    setCustomTitle('');
    setCustomNotes('');
    setCustomCategory('');
  };

  const toggleExercise = (dayKey: string, ex: any) => {
    setPlan(prev => {
      const current = prev[dayKey] ?? [];
      const exists = current.some((e: any) => e.name === ex.name);
      return {
        ...prev,
        [dayKey]: exists ? current.filter((e: any) => e.name !== ex.name) : [...current, ex],
      };
    });
  };

  const removeExercise = (dayKey: string, exName: string) => {
    setPlan(prev => ({
      ...prev,
      [dayKey]: (prev[dayKey] ?? []).filter((e: any) => e.name !== exName),
    }));
  };

  const addCustomExercise = () => {
    if (!activeDay) return;
    if (!customTitle.trim()) { showAlert('Missing title', 'Give the workout a title.'); return; }
    const ex = {
      name: customTitle.trim(),
      category: customCategory,
      description: customNotes.trim(),
      steps: [], muscles: [], videoUrl: '', imageUrl: '',
    };
    setPlan(prev => ({ ...prev, [activeDay]: [...(prev[activeDay] ?? []), ex] }));
    setCustomTitle('');
    setCustomNotes('');
    setCustomCategory('');
  };

  const isSelected = (dayKey: string, exName: string) =>
    (plan[dayKey] ?? []).some((e: any) => e.name === exName);

  const totalExercises = Object.values(plan).reduce((sum, exs) => sum + exs.length, 0);
  const activeDaysCount = Object.values(plan).filter(exs => exs.length > 0).length;

  const filtered = categoryFilter ? ALL_EXERCISES.filter(e => e.category === categoryFilter) : ALL_EXERCISES;

  const save = async () => {
    if (totalExercises === 0) { showAlert('Empty plan', 'Add at least one exercise to any day.'); return; }
    if (selectedPlayerIds.length === 0) { showAlert('No players selected', 'Select at least one player.'); return; }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setSaving(false); return; }

    // Get monday of current week
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStart = localDateStr(monday);

    const inserts = selectedPlayerIds.map(pid => ({
      coach_id: session.user.id,
      player_id: pid,
      week_start: weekStart,
      plan,
    }));

    const { error } = await supabase.from('weekly_plans').insert(inserts);

    setSaving(false);
    if (error) { showAlert('Error', error.message); return; }

    // Notify each selected player
    const { data: coachProfile } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).single();
    for (const pid of selectedPlayerIds) {
      await notifyWeeklyPlan(pid, coachProfile?.full_name ?? 'Your coach');
    }

    const recipientNames = isMultiMode
      ? connectedPlayers.filter(p => selectedPlayerIds.includes(p.id)).map(p => p.name).join(', ')
      : (name || 'your player');

    showAlert('Plan sent!', `Weekly training plan sent to ${recipientNames}.`);
    goBack();
  };

  const activeDayExercises = activeDay ? (plan[activeDay] ?? []) : [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <Icon name="arrow-left" size={26} color={Theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Weekly Plan</Text>
            {name ? <Text style={styles.forWho}>For {name}</Text> : null}
          </View>
          {totalExercises > 0 && (
            <View style={styles.summaryChip}>
              <Text style={styles.summaryChipText}>{activeDaysCount}d · {totalExercises}ex</Text>
            </View>
          )}
        </View>

        {/* Multi-player selector — compact wrap grid so long rosters don't push
            the day picker and exercise list far down the page. */}
        {isMultiMode && (
          <View style={styles.playerSelectSection}>
            <View style={styles.playerSelectHeader}>
              <Text style={styles.label}>Select Players</Text>
              {connectedPlayers.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSelectedPlayerIds(
                    selectedPlayerIds.length === connectedPlayers.length ? [] : connectedPlayers.map(p => p.id)
                  )}
                >
                  <Text style={styles.selectAllText}>
                    {selectedPlayerIds.length === connectedPlayers.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {loadingPlayers ? (
              <ActivityIndicator color={Theme.eyebrowGreen} />
            ) : connectedPlayers.length === 0 ? (
              <Text style={styles.noPlayersText}>No connected players found.</Text>
            ) : (
              <>
                <View style={styles.playerGrid}>
                  {connectedPlayers.map(p => {
                    const sel = selectedPlayerIds.includes(p.id);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.playerChip, sel && styles.playerChipActive]}
                        onPress={() => setSelectedPlayerIds(prev =>
                          sel ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        )}
                      >
                        <View style={[styles.playerChipAvatar, sel && styles.playerChipAvatarActive]}>
                          <Text style={[styles.playerChipAvatarText, sel && styles.playerChipAvatarTextActive]}>
                            {p.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.playerChipName, sel && styles.playerChipNameActive]} numberOfLines={1}>{p.name}</Text>
                        {sel && (
                          <View style={styles.playerChipCheck}>
                            <Icon name="check" size={14} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {selectedPlayerIds.length > 0 && (
                  <Text style={styles.selectedCount}>{selectedPlayerIds.length} player{selectedPlayerIds.length !== 1 ? 's' : ''} selected</Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Day selector — doubles as the weekly overview, so tapping a day
            and seeing what's already on it happen in the same place instead
            of two separate rows repeating the same 7 days. */}
        <Text style={styles.sectionLabel}>SELECT A DAY</Text>
        <View style={styles.weekOverview}>
          {DAY_KEYS.map((key, i) => {
            const dayExs = plan[key] ?? [];
            return (
              <TouchableOpacity
                key={key}
                style={[styles.dayOverviewCard, activeDay === key && styles.dayOverviewCardActive]}
                onPress={() => selectDay(key)}
              >
                <Text style={styles.dayOverviewLabel}>{DAYS[i].slice(0, 3)}</Text>
                {dayExs.length === 0 ? (
                  <View style={styles.restDay}>
                    <Text style={styles.restDayText}>Rest</Text>
                  </View>
                ) : (
                  <View style={styles.dayExList}>
                    {dayExs.slice(0, 3).map((ex: any, ei: number) => (
                      <View key={ei} style={[styles.dayExDot, { backgroundColor: catTheme(ex.category).fg }]} />
                    ))}
                    {dayExs.length > 3 && <Text style={styles.dayExMore}>+{dayExs.length - 3}</Text>}
                  </View>
                )}
                <Text style={styles.dayExCount}>{dayExs.length > 0 ? `${dayExs.length}` : '—'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Exercise picker for selected day */}
        {activeDay && (
          <View>
            <Text style={[styles.sectionLabel, { marginTop: 22 }]}>
              ADD TO {DAYS[DAY_KEYS.indexOf(activeDay)].toUpperCase()}
            </Text>

            {/* Already added to this day */}
            {activeDayExercises.length > 0 && (
              <View style={styles.addedSection}>
                {activeDayExercises.map((ex: any, i: number) => {
                  const cat = catTheme(ex.category);
                  return (
                    <View key={i} style={styles.addedCard}>
                      <View style={[styles.exIcon, { backgroundColor: cat.bg }]}>
                        <Icon
                          name={(ex.category && CATEGORY_ICONS[ex.category]) || 'clipboard-text-outline' as any}
                          size={17}
                          color={cat.fg}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.exName} numberOfLines={1}>{ex.name}</Text>
                        {ex.description ? <Text style={styles.exCat} numberOfLines={1}>{ex.description}</Text> : null}
                      </View>
                      <TouchableOpacity onPress={() => removeExercise(activeDay, ex.name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Icon name="close-circle" size={22} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Library vs custom workout toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, addMode === 'library' && styles.modeBtnActive]}
                onPress={() => setAddMode('library')}
              >
                <Icon name="book-open-outline" size={17} color={addMode === 'library' ? '#fff' : Theme.textSecondary} />
                <Text style={[styles.modeBtnText, addMode === 'library' && styles.modeBtnTextActive]} numberOfLines={1}>From Library</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, addMode === 'custom' && styles.modeBtnActive]}
                onPress={() => setAddMode('custom')}
              >
                <Icon name="pencil-outline" size={17} color={addMode === 'custom' ? '#fff' : Theme.textSecondary} />
                <Text style={[styles.modeBtnText, addMode === 'custom' && styles.modeBtnTextActive]} numberOfLines={1}>Write Your Own</Text>
              </TouchableOpacity>
            </View>

            {addMode === 'library' ? (
              <>
                {/* Category filter */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 9 }}>
                  <TouchableOpacity style={[styles.filterPill, categoryFilter === '' && styles.filterPillActive]} onPress={() => setCategoryFilter('')}>
                    <Text style={[styles.filterPillText, categoryFilter === '' && styles.filterPillTextActive]}>All</Text>
                  </TouchableOpacity>
                  {CATEGORIES.map(c => (
                    <TouchableOpacity key={c} style={[styles.filterPill, categoryFilter === c && styles.filterPillActive]} onPress={() => setCategoryFilter(c)}>
                      <Text style={[styles.filterPillText, categoryFilter === c && styles.filterPillTextActive]}>{c.charAt(0).toUpperCase() + c.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {filtered.map((ex, i) => {
                  const sel = isSelected(activeDay, ex.name);
                  const cat = catTheme(ex.category);
                  return (
                    <TouchableOpacity key={i} style={[styles.exCard, sel && styles.exCardActive]} onPress={() => toggleExercise(activeDay, ex)}>
                      <View style={[styles.exIcon, { backgroundColor: cat.bg }]}>
                        <Icon name={CATEGORY_ICONS[ex.category] as any} size={19} color={cat.fg} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.exName, sel && styles.exNameActive]}>{ex.name}</Text>
                        <Text style={styles.exCat}>{ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}</Text>
                      </View>
                      <View style={[styles.checkbox, sel && styles.checkboxActive]}>
                        {sel && <Icon name="check" size={15} color={Theme.eyebrowGreen} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              <View style={styles.customForm}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Bulgarian split squat"
                  placeholderTextColor={Theme.textSecondary}
                  value={customTitle}
                  onChangeText={setCustomTitle}
                />

                <Text style={styles.label}>Notes <Text style={styles.labelOptional}>(sets, reps, etc.)</Text></Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 3 sets of 12 each leg"
                  placeholderTextColor={Theme.textSecondary}
                  value={customNotes}
                  onChangeText={setCustomNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <Text style={styles.label}>Category <Text style={styles.labelOptional}>(optional)</Text></Text>
                <View style={styles.catRow}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.filterPill, customCategory === c && styles.filterPillActive]}
                      onPress={() => setCustomCategory(customCategory === c ? '' : c)}
                    >
                      <Text style={[styles.filterPillText, customCategory === c && styles.filterPillTextActive]}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.addCustomBtn} onPress={addCustomExercise}>
                  <Icon name="plus-circle-outline" size={20} color={Theme.eyebrowGreen} />
                  <Text style={styles.addCustomBtnText}>Add to {DAYS[DAY_KEYS.indexOf(activeDay)]}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {!activeDay && totalExercises === 0 && (
          <View style={styles.emptyHint}>
            <Icon name="calendar-edit" size={44} color={Theme.textMuted} />
            <Text style={styles.emptyHintText}>Tap a day above to start adding exercises</Text>
          </View>
        )}

      </ScrollView>

      {/* Sticky footer so Send is always reachable without scrolling to the bottom */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.sendBtn, (saving || totalExercises === 0) && styles.sendBtnDisabled]}
          onPress={save}
          disabled={saving || totalExercises === 0}
        >
          <Text style={styles.sendBtnText}>
            {saving ? 'Sending...' : `Send Weekly Plan${totalExercises > 0 ? ` (${activeDaysCount} days)` : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 26 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Theme.textPrimary },
  forWho: { fontSize: 15, color: Theme.eyebrowGreen, fontWeight: '600', marginTop: 2 },
  summaryChip: { backgroundColor: Theme.onDarkAccent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'flex-start' },
  summaryChipText: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '700' },
  sectionLabel: { fontSize: 13, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 13 },

  // Week overview grid — also the day selector, so it's sized a little
  // taller/roomier than a plain summary strip would need to be.
  weekOverview: { flexDirection: 'row', gap: 7, marginBottom: 26 },
  dayOverviewCard: { flex: 1, backgroundColor: Theme.cardWhite, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 9, borderWidth: 1.5, borderColor: 'transparent' },
  dayOverviewCardActive: { borderColor: Theme.eyebrowGreen, backgroundColor: Theme.onDarkAccent },
  dayOverviewLabel: { fontSize: 13, fontWeight: 'bold', color: Theme.textSecondary },
  restDay: { height: 28, justifyContent: 'center' },
  restDayText: { fontSize: 13, color: Theme.textSecondary },
  dayExList: { flexDirection: 'column', gap: 4, alignItems: 'center' },
  dayExDot: { width: 10, height: 10, borderRadius: 5 },
  dayExMore: { fontSize: 13, color: Theme.textSecondary },
  dayExCount: { fontSize: 14, fontWeight: 'bold', color: Theme.textPrimary },

  // Library vs custom toggle (mirrors assign-workout's mode toggle)
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  modeBtnActive: { backgroundColor: Theme.eyebrowGreen },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: Theme.textSecondary },
  modeBtnTextActive: { color: '#FFFFFF' },

  // Already-added-to-day list
  addedSection: { marginBottom: 16, gap: 10 },
  addedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 13,
  },

  // Custom workout form
  customForm: { marginBottom: 4 },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 15,
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Theme.eyebrowGreen,
    borderStyle: 'dashed',
  },
  addCustomBtnText: { fontSize: 16, fontWeight: '700', color: Theme.eyebrowGreen },

  // Exercise picker
  filterPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  filterPillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  filterPillText: { fontSize: 14, color: Theme.textSecondary, fontWeight: '600' },
  filterPillTextActive: { color: '#fff' },
  exCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 15, marginBottom: 11, borderWidth: 2, borderColor: 'transparent' },
  exCardActive: { borderColor: Theme.limeAccent, backgroundColor: Theme.onDarkAccent },
  exIcon: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  exName: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  exNameActive: { color: Theme.eyebrowGreen },
  exCat: { fontSize: 14, color: Theme.textSecondary, marginTop: 2 },
  checkbox: { width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: Theme.divider, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: Theme.limeAccent, borderColor: Theme.limeAccent },

  // Form (shared: label / input / labelOptional used by custom form + player selector)
  label: { fontSize: 15, color: Theme.textSecondary, marginBottom: 9, fontWeight: '600' },
  labelOptional: { fontWeight: '400', color: Theme.textSecondary, fontSize: 14 },
  input: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
    color: Theme.textPrimary,
    fontSize: 17,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.divider,
    minHeight: 52,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 18 },

  emptyHint: { alignItems: 'center', paddingTop: 44, gap: 14 },
  emptyHintText: { fontSize: 16, color: Theme.textSecondary, textAlign: 'center' },

  // Sticky footer
  footer: {
    backgroundColor: Theme.background,
    borderTopWidth: 1,
    borderTopColor: Theme.divider,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 24,
  },
  sendBtn: { backgroundColor: Theme.eyebrowGreen, borderRadius: 30, paddingVertical: 19, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 18 },

  // Multi-player selector — compact wrap grid so long rosters don't push
  // the day picker and exercise list far down the page.
  playerSelectSection: { marginBottom: 24 },
  playerSelectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  noPlayersText: { fontSize: 14, color: Theme.textSecondary, fontStyle: 'italic' },
  selectAllText: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '700' },
  playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  playerChip: {
    width: '47%',
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 13,
    borderWidth: 2, borderColor: 'transparent',
  },
  playerChipActive: { borderColor: Theme.eyebrowGreen, backgroundColor: Theme.onDarkAccent },
  playerChipAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Theme.onDarkAccent, alignItems: 'center', justifyContent: 'center' },
  playerChipAvatarActive: { backgroundColor: Theme.eyebrowGreen },
  playerChipAvatarText: { fontSize: 17, fontWeight: 'bold', color: Theme.eyebrowGreen },
  playerChipAvatarTextActive: { color: '#FFFFFF' },
  playerChipName: { flex: 1, fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  playerChipNameActive: { color: Theme.eyebrowGreen },
  playerChipCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: Theme.eyebrowGreen, alignItems: 'center', justifyContent: 'center' },
  selectedCount: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '700', textAlign: 'center', marginTop: 8 },
});
