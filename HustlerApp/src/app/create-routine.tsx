import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import workouts from '../data/workouts';
import { DAY_LABELS, cancelRoutineReminders, scheduleRoutineReminders } from '../lib/routineReminders';

const CATEGORIES = ['strength', 'footwork', 'endurance', 'recovery'];
const SCHEDULE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Half-hour slots, 5:00 AM through 10:00 PM — a pill picker instead of a
// native time wheel so it looks and works the same on web and mobile.
const TIME_SLOTS: { value: string; label: string }[] = Array.from({ length: 35 }, (_, i) => {
  const totalMinutes = 5 * 60 + i * 30;
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  return {
    value: `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    label: `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`,
  };
});


const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'footprints',
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

  // Schedule — which days + what time to remind the player to do this
  // routine, one time per day (not one shared time for every day). Loaded
  // fresh from the row when editing, since the list/detail screens only
  // pass id/name/exercises through nav params.
  const [scheduledTimes, setScheduledTimes] = useState<Record<string, string>>({});
  const [lastPickedTime, setLastPickedTime] = useState('06:00');
  const [existingNotificationIds, setExistingNotificationIds] = useState<string[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const scheduledDays = SCHEDULE_DAYS.filter(d => scheduledTimes[d]);

  useEffect(() => { loadCustom(); loadCoachExercises(); loadSchedule(); }, []);

  const loadSchedule = async () => {
    if (!isEditing) return;
    const { data } = await supabase
      .from('routines')
      .select('scheduled_times, notification_ids')
      .eq('id', editId)
      .single();
    if (data) {
      setScheduledTimes(data.scheduled_times ?? {});
      setExistingNotificationIds(data.notification_ids ?? []);
    }
  };

  // Tapping an unscheduled day adds it (defaulting to whatever time was
  // most recently picked, for anyone, any day) and opens its time picker.
  // Tapping an already-scheduled day just opens/closes ITS time picker —
  // only one day's picker shows at a time instead of all of them at once.
  const selectDay = (day: string) => {
    if (!scheduledTimes[day]) {
      setScheduledTimes(prev => ({ ...prev, [day]: lastPickedTime }));
      setExpandedDay(day);
    } else {
      setExpandedDay(prev => (prev === day ? null : day));
    }
  };

  const removeDay = (day: string) => {
    setScheduledTimes(prev => {
      const { [day]: _removed, ...rest } = prev;
      return rest;
    });
    setExpandedDay(prev => (prev === day ? null : prev));
  };

  const setDayTime = (day: string, time: string) => {
    setScheduledTimes(prev => ({ ...prev, [day]: time }));
    setLastPickedTime(time);
  };

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
      const payload = {
        name: routineName.trim(),
        exercises: selected,
        scheduled_days: scheduledDays,
        scheduled_times: scheduledTimes,
      };
      const { data: saved, error } = isEditing
        ? await supabase.from('routines').update(payload)
            .eq('id', editId).eq('user_id', session.user.id).select('id').single()
        : await supabase.from('routines').insert({ ...payload, user_id: session.user.id })
            .select('id').single();
      if (error) {
        setSaveError(error.message);
        showAlert('Error', error.message);
        return;
      }

      // Reschedule reminders to match whatever the schedule now is — cancel
      // whatever this routine had before, then (re)create. The routine
      // itself is already saved at this point, so a reminder hiccup
      // shouldn't be reported as if the whole save failed.
      try {
        await cancelRoutineReminders(existingNotificationIds);
        const newIds = await scheduleRoutineReminders(saved.id, routineName.trim(), scheduledTimes);
        await supabase.from('routines').update({ notification_ids: newIds }).eq('id', saved.id);
      } catch (e) {
        console.log('Could not schedule routine reminders:', e);
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
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
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

        {/* Schedule — which days + what time to be reminded to do this
            routine. Optional: leave no days selected to skip reminders. */}
        <Text style={styles.label}>SCHEDULE (OPTIONAL)</Text>
        <Text style={styles.scheduleHint}>Pick the days you'll do this routine and we'll remind you. Tap a day to set its time.</Text>
        <View style={styles.dayRow}>
          {SCHEDULE_DAYS.map((day) => {
            const on = scheduledDays.includes(day);
            const expanded = expandedDay === day;
            return (
              <TouchableOpacity
                key={day}
                style={[styles.dayPill, on && styles.dayPillActive, expanded && styles.dayPillExpanded]}
                onPress={() => selectDay(day)}
              >
                <Text style={[styles.dayPillText, on && styles.dayPillTextActive]}>{DAY_LABELS[day]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {expandedDay && (
          <View style={styles.dayTimeBlock}>
            <View style={styles.dayTimeHeader}>
              <Text style={styles.dayTimeLabel}>{DAY_LABELS[expandedDay]} reminder</Text>
              <TouchableOpacity onPress={() => removeDay(expandedDay)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.dayTimeRemove}>Remove day</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {TIME_SLOTS.map((slot) => (
                <TouchableOpacity
                  key={slot.value}
                  style={[styles.filterPill, scheduledTimes[expandedDay] === slot.value && styles.filterPillActive]}
                  onPress={() => setDayTime(expandedDay, slot.value)}
                >
                  <Text style={[styles.filterPillText, scheduledTimes[expandedDay] === slot.value && styles.filterPillTextActive]}>
                    {slot.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {scheduledDays.length > 0 && (
          <Text style={styles.scheduleSummaryText}>
            {scheduledDays.map(d => `${DAY_LABELS[d]} ${TIME_SLOTS.find(s => s.value === scheduledTimes[d])?.label ?? ''}`).join(' · ')}
          </Text>
        )}

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
                    <Icon name="chevron-up" size={28} color={i === 0 ? Theme.textMuted : Theme.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveDown(i)} disabled={i === selected.length - 1} style={[styles.orderBtn, i === selected.length - 1 && styles.orderBtnDisabled]}>
                    <Icon name="chevron-down" size={28} color={i === selected.length - 1 ? Theme.textMuted : Theme.textPrimary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => toggle(ex)}>
                  <Icon name="close-circle" size={24} color="#E74C3C" />
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
            <Icon name="whistle-outline" size={14} color={categoryFilter === 'coach' ? '#fff' : Theme.textSecondary} />
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
                <Icon
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
                {sel && <Icon name="check" size={14} color="#fff" />}
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

  // Schedule
  scheduleHint: { fontSize: 13, color: Theme.textSecondary, marginTop: -4, marginBottom: 12, lineHeight: 18 },
  dayRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  dayPill: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  dayPillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  dayPillExpanded: { borderWidth: 2, borderColor: Theme.limeAccent },
  dayPillText: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary },
  dayPillTextActive: { color: '#fff' },
  dayTimeBlock: { backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 12, marginBottom: 14 },
  dayTimeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dayTimeLabel: { fontSize: 13, fontWeight: '600', color: Theme.textPrimary },
  dayTimeRemove: { fontSize: 12, fontWeight: '600', color: '#E74C3C' },
  scheduleSummaryText: { fontSize: 12, color: Theme.textSecondary, marginBottom: 20, lineHeight: 17 },

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
