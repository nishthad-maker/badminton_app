import { View, StyleSheet, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

const CATEGORIES = [
  { key: 'strength', title: 'Strength Training', sub: 'Legs, Core, Upper Body', icon: 'dumbbell' },
  { key: 'footwork', title: 'Footwork Drills', sub: 'Speed, Agility, Court Movement', icon: 'badminton' },
  { key: 'endurance', title: 'Endurance', sub: 'Stamina, Rally Fitness, Interval', icon: 'lightning-bolt' },
  { key: 'recovery', title: 'Recovery', sub: 'Stretching, Foam Rolling, Breathing', icon: 'heart-pulse' },
];

export default function TrainScreen() {
  const [customCounts, setCustomCounts] = useState<Record<string, number>>({});
  const [routineCount, setRoutineCount] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    loadCustomCounts();
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
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>YOUR PRACTICE HUB</Text>
        <Text style={styles.title}>Training Focus</Text>

        <View style={styles.cards}>
          <View style={styles.categoryGroup}>
            {CATEGORIES.map((cat, i) => {
              const theme = CategoryTheme[cat.key as keyof typeof CategoryTheme];
              const isFirst = i === 0;
              const isLast = i === CATEGORIES.length - 1;
              return (
                <Pressable
                  key={cat.key}
                  style={[
                    styles.card,
                    { borderColor: theme.bg },
                    isFirst && styles.cardFirst,
                    isLast && styles.cardLast,
                    !isFirst && !isLast && styles.cardMiddle,
                    !isFirst && styles.cardJoined,
                    hoveredCard === cat.key && { backgroundColor: theme.bg },
                  ]}
                  onPress={() => navigate(cat.key)}
                  onHoverIn={() => setHoveredCard(cat.key)}
                  onHoverOut={() => setHoveredCard(null)}
                  onPressIn={() => setHoveredCard(cat.key)}
                  onPressOut={() => setHoveredCard(null)}
                >
                  <View style={[styles.iconBox, { backgroundColor: theme.bg }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={28} color={theme.fg} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{cat.title}</Text>
                    <View style={styles.cardSubRow}>
                      <Text style={styles.cardSub}>{cat.sub}</Text>
                      {customCounts[cat.key] ? (
                        <View style={[styles.customBadge, { backgroundColor: theme.bg }]}>
                          <Text style={[styles.customBadgeText, { color: theme.fg }]}>+{customCounts[cat.key]} custom</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={Theme.textMuted} />
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>My Training</Text>

          {/* My Routines */}
          <TouchableOpacity style={styles.cardVertical} onPress={goToRoutines}>
            <View style={[styles.iconCircle, { backgroundColor: '#E7E5E0' }]}>
              <MaterialCommunityIcons name="playlist-check" size={26} color="#44403C" />
            </View>
            <Text style={styles.cardTitleLg}>My Routines</Text>
            <Text style={styles.cardDesc}>{routineCount} custom routine{routineCount !== 1 ? 's' : ''}</Text>
            <View style={styles.cardLinkRow}>
              <Text style={[styles.cardLinkText, { color: '#44403C' }]}>View routines</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#44403C" />
            </View>
          </TouchableOpacity>

          {/* My Workouts */}
          <TouchableOpacity style={styles.cardVertical} onPress={goToCustomWorkouts}>
            <View style={[styles.iconCircle, { backgroundColor: '#E7E5E0' }]}>
              <MaterialCommunityIcons name="plus" size={26} color="#44403C" />
            </View>
            <Text style={styles.cardTitleLg}>Create Exercise</Text>
            <Text style={styles.cardDesc}>
              {Object.values(customCounts).reduce((a, b) => a + b, 0) > 0
                ? `${Object.values(customCounts).reduce((a, b) => a + b, 0)} custom exercise${Object.values(customCounts).reduce((a, b) => a + b, 0) !== 1 ? 's' : ''}`
                : 'Build your own custom exercises.'}
            </Text>
            <View style={styles.cardLinkRow}>
              <Text style={[styles.cardLinkText, { color: '#44403C' }]}>Add an exercise</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#44403C" />
            </View>
          </TouchableOpacity>

          <View style={styles.sectionDivider} />

          {/* Coach Plan — highlights workouts/routines assigned by the coach */}
          <TouchableOpacity style={styles.coachPlanCard} onPress={goToCoach}>
            <View style={styles.coachPlanHeader}>
              <View style={styles.coachPlanIconCircle}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={26} color="#123C35" />
              </View>
              <Text style={styles.coachPlanEyebrow}>COACH PLAN</Text>
            </View>
            <Text style={styles.coachPlanTitle}>New workouts, ready to train</Text>
            <Text style={styles.coachPlanDesc}>Your coach added new workouts and routines to your plan this week.</Text>
            <View style={styles.coachPlanBtn}>
              <Text style={styles.coachPlanBtnText}>View plan</Text>
              <MaterialCommunityIcons name="chevron-right" size={19} color="#123C35" />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 170 },
  eyebrow: { fontSize: 13, fontWeight: '500', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 6 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 36, color: Theme.textPrimary, marginBottom: 28 },
  cards: { gap: 14 },
  categoryGroup: {},
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1.5, borderColor: 'transparent' },
  cardFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  cardLast: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  cardMiddle: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  cardJoined: { marginTop: -1.5 },
  iconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardVertical: { backgroundColor: Theme.cardWhite, borderRadius: 20, padding: 20, alignItems: 'flex-start' },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  cardTitleLg: { fontSize: 19, fontWeight: '700', color: Theme.textPrimary, marginBottom: 4 },
  cardDesc: { fontSize: 14, color: Theme.textSecondary, marginBottom: 14, lineHeight: 19 },
  cardLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cardLinkText: { fontSize: 14, fontWeight: '700' },
  sectionDivider: { height: 1, backgroundColor: Theme.divider, marginVertical: 6 },
  coachPlanCard: { backgroundColor: '#123C35', borderRadius: 26, padding: 28, alignItems: 'flex-start' },
  coachPlanHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  coachPlanIconCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#BEE6DA', alignItems: 'center', justifyContent: 'center' },
  coachPlanEyebrow: { fontSize: 14, fontWeight: '700', color: '#BEE6DA', letterSpacing: 1.2 },
  coachPlanTitle: { fontSize: 26, fontWeight: '700', color: '#FFFFFF', marginBottom: 12, lineHeight: 32 },
  coachPlanDesc: { fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 23, marginBottom: 22 },
  coachPlanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 28, paddingHorizontal: 24, paddingVertical: 14 },
  coachPlanBtnText: { fontSize: 16, fontWeight: '700', color: '#123C35' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 19, fontWeight: '600', color: Theme.textPrimary },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  cardSub: { fontSize: 15, color: Theme.textSecondary },
  customBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  customBadgeText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontFamily: Fonts.serifMedium, fontSize: 36, color: Theme.textPrimary, marginTop: 12, marginBottom: 4 },
});
