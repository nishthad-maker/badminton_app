import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import workouts from '../data/workouts';

const CATEGORIES = ['strength', 'footwork', 'endurance', 'recovery'];

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'badminton',
  endurance: 'lightning-bolt',
  recovery: 'heart-pulse',
};

const catTheme = (cat: string) => CategoryTheme[cat as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

// All library exercises
const LIBRARY: { name: string; category: string; logType: string; description: string; steps: string[]; muscles: string[]; videoUrl: string; imageUrl: string }[] =
  CATEGORIES.flatMap(cat =>
    ((workouts as any)[cat] ?? []).map((ex: any) => ({
      name: ex.name,
      category: cat,
      logType: ex.logType ?? cat,
      description: ex.description ?? '',
      steps: ex.steps ?? [],
      muscles: ex.muscles ?? [],
      videoUrl: ex.videoUrl ?? '',
      imageUrl: ex.imageUrl ?? '',
    }))
  );

export default function CreateRoutineScreen() {
  const { id: editId, name: editName, exercises: editExercisesParam } = useLocalSearchParams();
  const isEditing = !!editId;

  const [routineName, setRoutineName] = useState(typeof editName === 'string' ? editName : '');
  const [selected, setSelected] = useState<any[]>(() => {
    if (typeof editExercisesParam === 'string' && editExercisesParam) {
      try { return JSON.parse(editExercisesParam); } catch { return []; }
    }
    return [];
  });
  const [categoryFilter, setCategoryFilter] = useState('');
  const [customExercises, setCustomExercises] = useState<any[]>([]);
  const [coachExercises, setCoachExercises] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => { loadCustom(); loadCoachExercises(); }, []);

  const loadCustom = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase
      .from('custom_exercises')
      .select('*')
      .eq('user_id', session.user.id);
    if (data) {
      setCustomExercises(data.map((ex: any) => ({
        name: ex.name,
        category: ex.category,
        logType: ex.log_type ?? ex.category,
        description: ex.description ?? '',
        steps: ex.steps ?? [],
        muscles: [],
        videoUrl: ex.video_url ?? '',
        imageUrl: '',
        isCustom: true,
      })));
    }
  };

  const loadCoachExercises = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase
      .from('weekly_plans')
      .select('plan')
      .eq('player_id', session.user.id);
    if (!data) return;
    const seen = new Set<string>();
    const flattened: any[] = [];
    data.forEach((row: any) => {
      const plan = row.plan ?? {};
      Object.values(plan).forEach((dayExercises: any) => {
        (dayExercises ?? []).forEach((ex: any) => {
          if (seen.has(ex.name)) return;
          seen.add(ex.name);
          flattened.push({ ...ex, isCoach: true });
        });
      });
    });
    setCoachExercises(flattened);
  };

  const allExercises = [...LIBRARY, ...customExercises];
  const filtered = categoryFilter === 'coach'
    ? coachExercises
    : categoryFilter
    ? allExercises.filter(e => e.category === categoryFilter)
    : allExercises;

  const isSelected = (name: string) => selected.some(s => s.name === name);

  const toggle = (ex: any) => {
    if (isSelected(ex.name)) {
      setSelected(prev => prev.filter(s => s.name !== ex.name));
    } else {
      setSelected(prev => [...prev, ex]);
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...selected];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setSelected(updated);
  };

  const moveDown = (index: number) => {
    if (index === selected.length - 1) return;
    const updated = [...selected];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setSelected(updated);
  };

  const save = async () => {
    if (!routineName.trim()) { showAlert('Missing name', 'Give your routine a name.'); return; }
    if (selected.length === 0) { showAlert('No exercises', 'Pick at least one exercise.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setSaveError("You're not signed in. Please log in again and retry.");
        showAlert('Not signed in', "You're not signed in. Please log in again and retry.");
        return;
      }
      const { error } = isEditing
        ? await supabase.from('routines').update({
            name: routineName.trim(),
            exercises: selected,
          }).eq('id', editId).eq('user_id', session.user.id)
        : await supabase.from('routines').insert({
            user_id: session.user.id,
            name: routineName.trim(),
            exercises: selected,
          });
      if (error) {
        setSaveError(error.message);
        showAlert('Error', error.message);
        return;
      }
      goBack();
    } catch (e: any) {
      const msg = e?.message ?? 'Something went wrong. Please try again.';
      setSaveError(msg);
      showAlert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{isEditing ? 'Edit Routine' : 'Create Routine'}</Text>
        </View>

        {/* Routine name */}
        <Text style={styles.label}>ROUTINE NAME</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="e.g. Full Body, Morning Drill, Leg Day"
          placeholderTextColor={Theme.textSecondary}
          value={routineName}
          onChangeText={setRoutineName}
        />

        {/* Selected exercises — reorderable */}
        {selected.length > 0 && (
          <View style={styles.selectedSection}>
            <Text style={styles.label}>YOUR ROUTINE ({selected.length})</Text>
            {selected.map((ex, i) => (
              <View key={ex.name} style={styles.selectedRow}>
                <View style={[styles.selectedDot, { backgroundColor: catTheme(ex.category).fg }]} />
                <Text style={styles.selectedName} numberOfLines={1}>{ex.name}</Text>
                {ex.isCustom && <View style={styles.customTag}><Text style={styles.customTagText}>Custom</Text></View>}
                {ex.isCoach && <View style={styles.coachTag}><Text style={styles.coachTagText}>Coach</Text></View>}
                <View style={styles.orderBtns}>
                  <TouchableOpacity onPress={() => moveUp(i)} disabled={i === 0} style={[styles.orderBtn, i === 0 && styles.orderBtnDisabled]}>
                    <MaterialCommunityIcons name="chevron-up" size={28} color={i === 0 ? Theme.textMuted : Theme.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveDown(i)} disabled={i === selected.length - 1} style={[styles.orderBtn, i === selected.length - 1 && styles.orderBtnDisabled]}>
                    <MaterialCommunityIcons name="chevron-down" size={28} color={i === selected.length - 1 ? Theme.textMuted : Theme.textPrimary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => toggle(ex)}>
                  <MaterialCommunityIcons name="close-circle" size={24} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Category filter */}
        <Text style={styles.label}>PICK EXERCISES</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
          <TouchableOpacity
            style={[styles.filterPill, categoryFilter === '' && styles.filterPillActive]}
            onPress={() => setCategoryFilter('')}
          >
            <Text style={[styles.filterPillText, categoryFilter === '' && styles.filterPillTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterPill, styles.coachPill, categoryFilter === 'coach' && styles.filterPillActive]}
            onPress={() => setCategoryFilter('coach')}
          >
            <MaterialCommunityIcons name="whistle-outline" size={14} color={categoryFilter === 'coach' ? '#fff' : Theme.textSecondary} />
            <Text style={[styles.filterPillText, categoryFilter === 'coach' && styles.filterPillTextActive]}>Coach</Text>
          </TouchableOpacity>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.filterPill, categoryFilter === c && { backgroundColor: catTheme(c).fg, borderColor: catTheme(c).fg }]}
              onPress={() => setCategoryFilter(c)}
            >
              <Text style={[styles.filterPillText, categoryFilter === c && styles.filterPillTextActive]}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {categoryFilter === 'coach' && coachExercises.length === 0 && (
          <Text style={styles.coachEmptyText}>No coach-assigned exercises yet. They'll show up here once your coach sends a weekly plan.</Text>
        )}

        {/* Exercise grid */}
        {filtered.map((ex, i) => {
          const sel = isSelected(ex.name);
          const cat = catTheme(ex.category);
          return (
            <TouchableOpacity
              key={i}
              style={[styles.exCard, sel && { borderColor: cat.fg, backgroundColor: cat.bg }]}
              onPress={() => toggle(ex)}
            >
              <View style={[styles.exIcon, { backgroundColor: cat.bg }]}>
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[ex.category] as any}
                  size={18}
                  color={cat.fg}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exName, sel && { color: cat.fg }]}>{ex.name}</Text>
                <Text style={styles.exCat}>{ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}{ex.isCustom ? ' · Custom' : ''}{ex.isCoach ? ' · Coach' : ''}</Text>
              </View>
              <View style={[styles.checkbox, sel && { backgroundColor: cat.fg, borderColor: cat.fg }]}>
                {sel && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        })}

      </ScrollView>

      {/* Save — fixed footer so it's always reachable without scrolling */}
      <View style={styles.saveFooter}>
        <TouchableOpacity
          style={[styles.saveBtn, (saving || selected.length === 0 || !routineName.trim()) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving || selected.length === 0 || !routineName.trim()}
        >
          <Text style={[styles.saveBtnText, (saving || selected.length === 0 || !routineName.trim()) && styles.saveBtnTextDisabled]}>
            {saving
              ? 'Saving...'
              : `${isEditing ? 'Save Changes' : 'Save Routine'}${selected.length > 0 ? ` (${selected.length})` : ''}`}
          </Text>
        </TouchableOpacity>
        {!saving && !routineName.trim() && (
          <Text style={styles.saveHintText}>Give your routine a name above to save it.</Text>
        )}
        {!saving && !!routineName.trim() && selected.length === 0 && (
          <Text style={styles.saveHintText}>Pick at least one exercise to save.</Text>
        )}
        {saveError !== '' && <Text style={styles.saveErrorText}>{saveError}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 24 },
  saveFooter: {
    backgroundColor: Theme.background,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: Theme.divider,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  label: { fontSize: 13, fontWeight: '700', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 10 },
  nameInput: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 14,
    color: Theme.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Theme.divider,
    marginBottom: 24,
  },

  // Selected list
  selectedSection: { marginBottom: 24 },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  selectedDot: { width: 10, height: 10, borderRadius: 5 },
  selectedName: { flex: 1, fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  customTag: { backgroundColor: Theme.cardTinted, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  customTagText: { fontSize: 12, color: Theme.eyebrowGreen, fontWeight: '600' },
  coachTag: { backgroundColor: '#F9C9DE', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  coachTagText: { fontSize: 12, color: '#C0135E', fontWeight: '600' },
  orderBtns: { flexDirection: 'row', gap: 4 },
  orderBtn: { padding: 4 },
  orderBtnDisabled: { opacity: 0.3 },

  // Filter pills
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  filterPillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  filterPillText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  filterPillTextActive: { color: '#fff' },
  coachPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  coachEmptyText: { fontSize: 14, color: Theme.textSecondary, fontStyle: 'italic', marginBottom: 14, lineHeight: 20 },

  // Exercise cards
  exCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  exIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  exName: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  exCat: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Theme.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveBtn: { backgroundColor: '#44403C', borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  saveBtnDisabled: { backgroundColor: Theme.divider },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  saveBtnTextDisabled: { color: Theme.textMuted },
  saveHintText: { color: Theme.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 10 },
  saveErrorText: { color: '#E74C3C', fontSize: 13, textAlign: 'center', marginTop: 10 },
});
