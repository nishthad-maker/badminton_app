import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import workouts from '../data/workouts';

const CATEGORIES = ['strength', 'footwork', 'endurance', 'recovery'];

const CATEGORY_COLORS: Record<string, string> = {
  strength: '#2ECC71',
  footwork: '#3498DB',
  endurance: '#E67E22',
  recovery: '#9B59B6',
};

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'badminton',
  endurance: 'lightning-bolt',
  recovery: 'heart-pulse',
};

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
  const [routineName, setRoutineName] = useState('');
  const [selected, setSelected] = useState<any[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [customExercises, setCustomExercises] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCustom(); }, []);

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

  const allExercises = [...LIBRARY, ...customExercises];
  const filtered = categoryFilter ? allExercises.filter(e => e.category === categoryFilter) : allExercises;

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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setSaving(false); return; }
    const { error } = await supabase.from('routines').insert({
      user_id: session.user.id,
      name: routineName.trim(),
      exercises: selected,
    });
    setSaving(false);
    if (error) { showAlert('Error', error.message); return; }
    router.back();
  };

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.title}>Create Routine</Text>
        </View>

        {/* Routine name */}
        <Text style={styles.label}>Routine Name</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="e.g. Full Body, Morning Drill, Leg Day"
          placeholderTextColor={Colors.textSecondary}
          value={routineName}
          onChangeText={setRoutineName}
        />

        {/* Selected exercises — reorderable */}
        {selected.length > 0 && (
          <View style={styles.selectedSection}>
            <Text style={styles.label}>Your Routine ({selected.length})</Text>
            {selected.map((ex, i) => (
              <View key={ex.name} style={styles.selectedRow}>
                <View style={[styles.selectedDot, { backgroundColor: CATEGORY_COLORS[ex.category] ?? Colors.accent }]} />
                <Text style={styles.selectedName} numberOfLines={1}>{ex.name}</Text>
                {ex.isCustom && <View style={styles.customTag}><Text style={styles.customTagText}>Custom</Text></View>}
                <View style={styles.orderBtns}>
                  <TouchableOpacity onPress={() => moveUp(i)} disabled={i === 0} style={[styles.orderBtn, i === 0 && styles.orderBtnDisabled]}>
                    <MaterialCommunityIcons name="chevron-up" size={16} color={i === 0 ? Colors.textSecondary : Colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveDown(i)} disabled={i === selected.length - 1} style={[styles.orderBtn, i === selected.length - 1 && styles.orderBtnDisabled]}>
                    <MaterialCommunityIcons name="chevron-down" size={16} color={i === selected.length - 1 ? Colors.textSecondary : Colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => toggle(ex)}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Category filter */}
        <Text style={styles.label}>Pick Exercises</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
          <TouchableOpacity
            style={[styles.filterPill, categoryFilter === '' && styles.filterPillActive]}
            onPress={() => setCategoryFilter('')}
          >
            <Text style={[styles.filterPillText, categoryFilter === '' && styles.filterPillTextActive]}>All</Text>
          </TouchableOpacity>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.filterPill, categoryFilter === c && styles.filterPillActive]}
              onPress={() => setCategoryFilter(c)}
            >
              <Text style={[styles.filterPillText, categoryFilter === c && styles.filterPillTextActive]}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Exercise grid */}
        {filtered.map((ex, i) => {
          const sel = isSelected(ex.name);
          return (
            <TouchableOpacity
              key={i}
              style={[styles.exCard, sel && styles.exCardSelected]}
              onPress={() => toggle(ex)}
            >
              <View style={[styles.exIcon, { backgroundColor: `${CATEGORY_COLORS[ex.category]}20` }]}>
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[ex.category] as any}
                  size={18}
                  color={CATEGORY_COLORS[ex.category]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exName, sel && styles.exNameSelected]}>{ex.name}</Text>
                <Text style={styles.exCat}>{ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}{ex.isCustom ? ' · Custom' : ''}</Text>
              </View>
              <View style={[styles.checkbox, sel && styles.checkboxSelected]}>
                {sel && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, (saving || selected.length === 0 || !routineName.trim()) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving || selected.length === 0 || !routineName.trim()}
        >
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving...' : `Save Routine${selected.length > 0 ? ` (${selected.length})` : ''}`}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 80 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
  label: { fontSize: 12, fontWeight: '700', color: Colors.accent, letterSpacing: 0.5, marginBottom: 10 },
  nameInput: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },

  // Selected list
  selectedSection: { marginBottom: 24 },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  selectedDot: { width: 8, height: 8, borderRadius: 4 },
  selectedName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  customTag: { backgroundColor: Colors.accentMuted, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  customTagText: { fontSize: 10, color: Colors.accent, fontWeight: '600' },
  orderBtns: { flexDirection: 'row', gap: 2 },
  orderBtn: { padding: 2 },
  orderBtnDisabled: { opacity: 0.3 },

  // Filter pills
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  filterPillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterPillText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  filterPillTextActive: { color: '#fff' },

  // Exercise cards
  exCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  exCardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentMuted },
  exIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  exName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  exNameSelected: { color: Colors.accent },
  exCat: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },

  saveBtn: { backgroundColor: Colors.accent, borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
