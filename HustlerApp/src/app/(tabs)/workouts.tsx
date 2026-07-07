import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

const CATEGORIES = [
  { key: 'strength', title: 'Strength Training', sub: 'Legs, Core, Upper Body', icon: 'dumbbell', color: '#2ECC71', bg: 'rgba(46,204,113,0.15)' },
  { key: 'footwork', title: 'Footwork Drills', sub: 'Speed, Agility, Court Movement', icon: 'badminton', color: '#3498DB', bg: 'rgba(52,152,219,0.15)' },
  { key: 'endurance', title: 'Endurance', sub: 'Stamina, Rally Fitness, Interval', icon: 'lightning-bolt', color: '#E67E22', bg: 'rgba(230,126,34,0.15)' },
  { key: 'recovery', title: 'Recovery', sub: 'Stretching, Foam Rolling, Breathing', icon: 'heart-pulse', color: '#9B59B6', bg: 'rgba(155,89,182,0.15)' },
];

export default function TrainScreen() {
  const [customCounts, setCustomCounts] = useState<Record<string, number>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [routineCount, setRoutineCount] = useState(0);

  useFocusEffect(useCallback(() => {
    loadCustomCounts();
    loadUnread();
    loadRoutineCount();
  }, []));

  const loadCustomCounts = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase.from('custom_exercises').select('category').eq('user_id', session.user.id);
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((ex: any) => { counts[ex.category] = (counts[ex.category] || 0) + 1; });
      setCustomCounts(counts);
    }
  };

  const loadUnread = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const userId = session.user.id;
    const { data: unreadAsgs } = await supabase.from('assignments').select('id').eq('player_id', userId).eq('seen', false);
    const { data: unreadNotifs } = await supabase.from('notifications').select('id').eq('user_id', userId).eq('type', 'coach_feedback').eq('seen', false);
    setUnreadCount((unreadAsgs ?? []).length + (unreadNotifs ?? []).length);
  };

  const loadRoutineCount = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { count } = await supabase.from('routines').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id);
    setRoutineCount(count ?? 0);
  };

  const navigate = (category: string) => router.push({ pathname: '/exercise-list', params: { category } });

  const goToCustomWorkouts = () => {
    if (typeof window !== 'undefined') window.location.href = '/custom-workouts';
    else router.push('/custom-workouts' as any);
  };

  const goToRoutines = () => {
    if (typeof window !== 'undefined') window.location.href = '/routines';
    else router.push('/routines' as any);
  };

  const goToCoach = () => {
    if (typeof window !== 'undefined') window.location.href = '/coach-section';
    else router.push('/coach-section' as any);
  };

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Train</Text>

        <View style={styles.cards}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity key={cat.key} style={styles.card} onPress={() => navigate(cat.key)}>
              <View style={[styles.iconBox, { backgroundColor: cat.bg }]}>
                <MaterialCommunityIcons name={cat.icon as any} size={24} color={cat.color} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{cat.title}</Text>
                <View style={styles.cardSubRow}>
                  <Text style={styles.cardSub}>{cat.sub}</Text>
                  {customCounts[cat.key] ? (
                    <View style={styles.customBadge}>
                      <Text style={styles.customBadgeText}>+{customCounts[cat.key]} custom</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          ))}

          <View style={styles.divider} />

          {/* My Workouts */}
          <TouchableOpacity style={[styles.card, styles.customCard]} onPress={goToCustomWorkouts}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <MaterialCommunityIcons name="plus-circle-outline" size={24} color={Colors.textPrimary} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>My Workouts</Text>
              <Text style={styles.cardSub}>
                {Object.values(customCounts).reduce((a, b) => a + b, 0) > 0
                  ? `${Object.values(customCounts).reduce((a, b) => a + b, 0)} custom exercise${Object.values(customCounts).reduce((a, b) => a + b, 0) !== 1 ? 's' : ''}`
                  : 'Your custom exercises'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          {/* My Routines */}
          <TouchableOpacity style={[styles.card, styles.routineCard]} onPress={goToRoutines}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <MaterialCommunityIcons name="playlist-check" size={24} color={Colors.textPrimary} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>My Routines</Text>
              <Text style={styles.cardSub}>
                {routineCount > 0
                  ? `${routineCount} routine${routineCount !== 1 ? 's' : ''} saved`
                  : 'Build your own workout routines'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          {/* Coach */}
          <TouchableOpacity style={[styles.card, styles.coachCard]} onPress={goToCoach}>
            <View style={[styles.iconBox, { backgroundColor: Colors.accentMuted }]}>
              <MaterialCommunityIcons name="whistle-outline" size={24} color={Colors.accent} />
              {unreadCount > 0 && (
                <View style={styles.iconBadge}>
                  <Text style={styles.iconBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, styles.coachCardTitle]}>Coach</Text>
              <Text style={styles.cardSub}>
                {unreadCount > 0
                  ? `${unreadCount} new update${unreadCount !== 1 ? 's' : ''} from your coach`
                  : 'Workouts and weekly plans from your coach'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 120 },
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 24 },
  cards: { gap: 12 },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  customCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed' },
  routineCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed' },
  coachCard: { borderWidth: 1, borderColor: Colors.accent },
  coachCardTitle: { color: Colors.accent },
  iconBox: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconBadge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: Colors.backgroundTop },
  iconBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  cardSub: { fontSize: 12, color: Colors.textSecondary },
  customBadge: { backgroundColor: Colors.accentMuted, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  customBadgeText: { fontSize: 10, color: Colors.accent, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.border },
});
