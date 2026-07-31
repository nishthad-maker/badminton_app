import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { DAY_LABELS, cancelRoutineReminders } from '../../lib/routineReminders';

const SCHEDULE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const formatTime12h = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

// Just the next time this routine is actually coming up, not the whole
// week's schedule — "Today 6:00 AM" / "Tomorrow 6:30 AM" / "Wed 5:00 AM"
// instead of a long comma list that runs off the card.
const nextOccurrence = (times: Record<string, string>): string | null => {
  const scheduledDays = SCHEDULE_DAYS.filter(d => times[d]);
  if (!scheduledDays.length) return null;

  const now = new Date();
  const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday-first
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset < 7; offset++) {
    const day = SCHEDULE_DAYS[(todayIdx + offset) % 7];
    if (!times[day]) continue;
    if (offset === 0) {
      const [h, m] = times[day].split(':').map(Number);
      if (h * 60 + m <= nowMinutes) continue; // already passed today
    }
    const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : DAY_LABELS[day];
    return `${label} ${formatTime12h(times[day])}`;
  }

  // Only scheduled day is today and its time already passed — the next
  // occurrence is the same day next week.
  const day = scheduledDays[0];
  return `${DAY_LABELS[day]} ${formatTime12h(times[day])}`;
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

export default function RoutinesScreen() {
  const [routines, setRoutines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }
    const { data } = await supabase
      .from('routines')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    setRoutines(data ?? []);
    setLoading(false);
  };

  const deleteRoutine = (id: string, name: string) => {
    showConfirm('Delete Routine', `Delete "${name}"? This can't be undone.`, async () => {
      const notificationIds = routines.find(r => r.id === id)?.notification_ids ?? [];
      await cancelRoutineReminders(notificationIds);
      await supabase.from('routines').delete().eq('id', id);
      setRoutines(prev => prev.filter(r => r.id !== id));
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Routines</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/create-routine' as any)}
        >
          <Icon name="plus" size={22} color="#44403C" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : routines.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="dumbbell" size={48} color={Theme.textMuted} />
            <Text style={styles.emptyTitle}>No routines yet</Text>
            <Text style={styles.emptyDesc}>Tap the + button to create your first routine.</Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => router.push('/create-routine' as any)}
            >
              <Icon name="plus" size={18} color="#44403C" />
              <Text style={styles.createBtnText}>Create Routine</Text>
            </TouchableOpacity>
          </View>
        ) : (
          routines.map((r: any) => {
            const exercises: any[] = r.exercises ?? [];
            // Get unique categories for color dots
            const cats = [...new Set(exercises.map((e: any) => e.category))].slice(0, 4);
            return (
              <TouchableOpacity
                key={r.id}
                style={styles.routineCard}
                onPress={() => router.push({ pathname: '/routine-detail', params: { id: r.id, name: r.name, exercises: JSON.stringify(exercises) } })}
              >
                <View style={styles.routineLeft}>
                  {/* Category color dots */}
                  <View style={styles.catDots}>
                    {cats.map((cat: string, i: number) => (
                      <View key={i} style={[styles.catDot, { backgroundColor: (CategoryTheme[cat as keyof typeof CategoryTheme] ?? { fg: Theme.eyebrowGreen }).fg }]} />
                    ))}
                  </View>
                  <View style={styles.routineTextCol}>
                    <Text style={styles.routineName} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.routineSub} numberOfLines={1}>
                      {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
                      {exercises.length > 0 ? ` · ${exercises.map((e: any) => e.name).slice(0, 2).join(', ')}${exercises.length > 2 ? '...' : ''}` : ''}
                    </Text>
                    {r.scheduled_times && nextOccurrence(r.scheduled_times) && (
                      <View style={styles.scheduleBadge}>
                        <Icon name="clock-outline" size={12} color={Theme.eyebrowGreen} />
                        <Text style={styles.scheduleBadgeText} numberOfLines={1}>
                          {nextOccurrence(r.scheduled_times)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.routineRight}>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => deleteRoutine(r.id, r.name)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Icon name="trash-can-outline" size={18} color="#E74C3C" />
                  </TouchableOpacity>
                  <Icon name="chevron-right" size={20} color={Theme.textMuted} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingTop: 60, paddingBottom: 16 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E7E5E0', alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, paddingTop: 8, paddingBottom: 120 },
  muted: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E7E5E0', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  createBtnText: { color: '#44403C', fontWeight: 'bold', fontSize: 14 },
  routineCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 16, marginBottom: 12 },
  routineLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 },
  catDots: { flexDirection: 'column', gap: 4 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  routineTextCol: { flex: 1, minWidth: 0 },
  routineName: { fontSize: 16, fontWeight: '700', color: Theme.textPrimary, marginBottom: 3 },
  routineSub: { fontSize: 13, color: Theme.textSecondary },
  scheduleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  scheduleBadgeText: { flex: 1, fontSize: 12, color: Theme.eyebrowGreen, fontWeight: '600' },
  routineRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: { padding: 4 },
});
