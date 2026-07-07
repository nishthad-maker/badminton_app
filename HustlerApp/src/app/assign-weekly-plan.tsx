import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import workouts from '../data/workouts';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const CATEGORIES = ['strength', 'footwork', 'endurance', 'recovery'];

const CATEGORY_COLORS: Record<string, string> = {
  strength: '#2ECC71', footwork: '#3498DB', endurance: '#E67E22', recovery: '#9B59B6',
};
const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell', footwork: 'badminton', endurance: 'lightning-bolt', recovery: 'heart-pulse',
};

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
  const { playerId, name } = useLocalSearchParams();

  // plan[dayKey] = array of exercises
  const [plan, setPlan] = useState<Record<string, any[]>>({});
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
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

  const isSelected = (dayKey: string, exName: string) =>
    (plan[dayKey] ?? []).some((e: any) => e.name === exName);

  const totalExercises = Object.values(plan).reduce((sum, exs) => sum + exs.length, 0);
  const activeDaysCount = Object.values(plan).filter(exs => exs.length > 0).length;

  const filtered = categoryFilter ? ALL_EXERCISES.filter(e => e.category === categoryFilter) : ALL_EXERCISES;

  const save = async () => {
    if (totalExercises === 0) { showAlert('Empty plan', 'Add at least one exercise to any day.'); return; }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setSaving(false); return; }

    // Get monday of current week
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStart = monday.toISOString().split('T')[0];

    const { error } = await supabase.from('weekly_plans').insert({
      coach_id: session.user.id,
      player_id: playerId as string,
      week_start: weekStart,
      plan,
    });

    setSaving(false);
    if (error) { showAlert('Error', error.message); return; }
    showAlert('Plan sent!', `Weekly training plan sent to ${name || 'your player'}.`);
    goBack();
  };

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
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

        {/* Day selector */}
        <Text style={styles.sectionLabel}>SELECT A DAY TO ADD EXERCISES</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
          {DAY_KEYS.map((key, i) => {
            const count = (plan[key] ?? []).length;
            const isActive = activeDay === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.dayPill, isActive && styles.dayPillActive, count > 0 && !isActive && styles.dayPillHasContent]}
                onPress={() => setActiveDay(activeDay === key ? null : key)}
              >
                <Text style={[styles.dayPillText, isActive && styles.dayPillTextActive, count > 0 && !isActive && styles.dayPillTextHasContent]}>
                  {DAYS[i].slice(0, 3)}
                </Text>
                {count > 0 && (
                  <View style={[styles.dayCount, isActive && styles.dayCountActive]}>
                    <Text style={[styles.dayCountText, isActive && styles.dayCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Weekly overview */}
        <Text style={styles.sectionLabel}>WEEKLY OVERVIEW</Text>
        <View style={styles.weekOverview}>
          {DAY_KEYS.map((key, i) => {
            const dayExs = plan[key] ?? [];
            return (
              <TouchableOpacity
                key={key}
                style={[styles.dayOverviewCard, activeDay === key && styles.dayOverviewCardActive]}
                onPress={() => setActiveDay(activeDay === key ? null : key)}
              >
                <Text style={styles.dayOverviewLabel}>{DAYS[i].slice(0, 3)}</Text>
                {dayExs.length === 0 ? (
                  <View style={styles.restDay}>
                    <Text style={styles.restDayText}>Rest</Text>
                  </View>
                ) : (
                  <View style={styles.dayExList}>
                    {dayExs.slice(0, 3).map((ex: any, ei: number) => (
                      <View key={ei} style={[styles.dayExDot, { backgroundColor: CATEGORY_COLORS[ex.category] ?? Colors.accent }]} />
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
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
              ADD TO {DAYS[DAY_KEYS.indexOf(activeDay)].toUpperCase()}
            </Text>

            {/* Category filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
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
              return (
                <TouchableOpacity key={i} style={[styles.exCard, sel && styles.exCardSelected]} onPress={() => toggleExercise(activeDay, ex)}>
                  <View style={[styles.exIcon, { backgroundColor: `${CATEGORY_COLORS[ex.category]}20` }]}>
                    <MaterialCommunityIcons name={CATEGORY_ICONS[ex.category] as any} size={18} color={CATEGORY_COLORS[ex.category]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.exName, sel && styles.exNameSelected]}>{ex.name}</Text>
                    <Text style={styles.exCat}>{ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}</Text>
                  </View>
                  <View style={[styles.checkbox, sel && styles.checkboxSelected]}>
                    {sel && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!activeDay && totalExercises === 0 && (
          <View style={styles.emptyHint}>
            <MaterialCommunityIcons name="calendar-edit" size={40} color={Colors.textSecondary} />
            <Text style={styles.emptyHintText}>Tap a day above to start adding exercises</Text>
          </View>
        )}

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendBtn, (saving || totalExercises === 0) && styles.sendBtnDisabled]}
          onPress={save}
          disabled={saving || totalExercises === 0}
        >
          <Text style={styles.sendBtnText}>
            {saving ? 'Sending...' : `Send Weekly Plan${totalExercises > 0 ? ` (${activeDaysCount} days)` : ''}`}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 80 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
  forWho: { fontSize: 13, color: Colors.accent, fontWeight: '600', marginTop: 2 },
  summaryChip: { backgroundColor: Colors.accentMuted, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  summaryChipText: { fontSize: 12, color: Colors.accent, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1, marginBottom: 12 },

  // Day pills
  dayPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayPillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayPillHasContent: { borderColor: Colors.accent },
  dayPillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  dayPillTextActive: { color: '#fff' },
  dayPillTextHasContent: { color: Colors.accent },
  dayCount: { backgroundColor: Colors.accent, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dayCountActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dayCountText: { fontSize: 10, color: '#fff', fontWeight: 'bold' },
  dayCountTextActive: { color: '#fff' },

  // Week overview grid
  weekOverview: { flexDirection: 'row', gap: 6 },
  dayOverviewCard: { flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 8, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'transparent' },
  dayOverviewCardActive: { borderColor: Colors.accent },
  dayOverviewLabel: { fontSize: 10, fontWeight: 'bold', color: Colors.textSecondary },
  restDay: { height: 24, justifyContent: 'center' },
  restDayText: { fontSize: 9, color: Colors.textSecondary },
  dayExList: { flexDirection: 'column', gap: 3, alignItems: 'center' },
  dayExDot: { width: 8, height: 8, borderRadius: 4 },
  dayExMore: { fontSize: 9, color: Colors.textSecondary },
  dayExCount: { fontSize: 11, fontWeight: 'bold', color: Colors.textPrimary },

  // Exercise picker
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  filterPillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterPillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  filterPillTextActive: { color: '#fff' },
  exCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'transparent' },
  exCardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentMuted },
  exIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  exName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  exNameSelected: { color: Colors.accent },
  exCat: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },

  emptyHint: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyHintText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },

  sendBtn: { backgroundColor: Colors.accent, borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
