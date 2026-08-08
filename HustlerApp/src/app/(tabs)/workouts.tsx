import { View, StyleSheet, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { getPlayerClubMembership } from '../../lib/club';
import { getClubCoachesForPlayer } from '../../lib/playerClub';
import { PepTalkModal } from '@/components/PepTalkModal';

const CATEGORIES = [
  { key: 'strength', title: 'Strength Training', sub: 'Legs, Core, Upper Body', icon: 'dumbbell' },
  { key: 'footwork', title: 'Footwork Drills', sub: 'Speed, Agility, Court Movement', icon: 'footprints' },
  { key: 'endurance', title: 'Endurance', sub: 'Stamina, Rally Fitness, Interval', icon: 'lightning-bolt' },
  { key: 'recovery', title: 'Recovery', sub: 'Stretching, Foam Rolling, Breathing', icon: 'heart-pulse' },
];

export default function TrainScreen() {
  const [customCounts, setCustomCounts] = useState<Record<string, number>>({});
  const [routineCount, setRoutineCount] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [showPepTalk, setShowPepTalk] = useState(false);

  // Coach Plan card's club/coach connection tag — a lightweight lookup
  // (just the club name + priority coach), not the full membership detail
  // that used to live on this tab (that's now on Profile's "My Club").
  const [clubTag, setClubTag] = useState<{ clubName: string; coachName: string | null } | null>(null);
  // Whether a coach has actually assigned anything yet (a workout or a
  // weekly plan) — starts true so the card doesn't flash an empty state
  // before this resolves; the "New workouts" copy below only ever refers to
  // something a coach really did, never a default placeholder.
  const [hasAssignedPlan, setHasAssignedPlan] = useState(true);

  useFocusEffect(useCallback(() => {
    loadCustomCounts();
    loadRoutineCount();
    loadClubTag();
    loadPlanStatus();
  }, []));

  const loadPlanStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const [{ count: asgCount }, { count: planCount }] = await Promise.all([
      supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('player_id', session.user.id),
      supabase.from('weekly_plans').select('id', { count: 'exact', head: true }).eq('player_id', session.user.id),
    ]);
    setHasAssignedPlan((asgCount ?? 0) > 0 || (planCount ?? 0) > 0);
  };

  const loadClubTag = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const active = await getPlayerClubMembership(session.user.id);
    if (!active) { setClubTag(null); return; }
    const coaches = await getClubCoachesForPlayer(session.user.id, active.clubId);
    const priority = coaches.find((c) => c.isPriority) ?? coaches[0] ?? null;
    setClubTag({ clubName: active.clubName, coachName: priority?.full_name ?? null });
  };

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
                    <Icon name={cat.icon as any} size={28} color={theme.fg} />
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
                  <Icon name="chevron-right" size={22} color={Theme.textMuted} />
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>My Training</Text>

          {/* My Routines */}
          <TouchableOpacity style={styles.cardVertical} onPress={goToRoutines}>
            <View style={[styles.iconCircle, { backgroundColor: '#E7E5E0' }]}>
              <Icon name="playlist-check" size={26} color="#44403C" />
            </View>
            <Text style={styles.cardTitleLg}>My Routines</Text>
            <Text style={styles.cardDesc}>{routineCount} custom routine{routineCount !== 1 ? 's' : ''}</Text>
            <View style={styles.cardLinkRow}>
              <Text style={[styles.cardLinkText, { color: '#44403C' }]}>View routines</Text>
              <Icon name="chevron-right" size={18} color="#44403C" />
            </View>
          </TouchableOpacity>

          {/* My Workouts */}
          <TouchableOpacity style={styles.cardVertical} onPress={goToCustomWorkouts}>
            <View style={[styles.iconCircle, { backgroundColor: '#E7E5E0' }]}>
              <Icon name="plus" size={26} color="#44403C" />
            </View>
            <Text style={styles.cardTitleLg}>Create Exercise</Text>
            <Text style={styles.cardDesc}>
              {Object.values(customCounts).reduce((a, b) => a + b, 0) > 0
                ? `${Object.values(customCounts).reduce((a, b) => a + b, 0)} custom exercise${Object.values(customCounts).reduce((a, b) => a + b, 0) !== 1 ? 's' : ''}`
                : 'Build your own custom exercises.'}
            </Text>
            <View style={styles.cardLinkRow}>
              <Text style={[styles.cardLinkText, { color: '#44403C' }]}>Add an exercise</Text>
              <Icon name="chevron-right" size={18} color="#44403C" />
            </View>
          </TouchableOpacity>

          {/* Mental Prep — for a rough training day, not tied to any logged
              data (unlike the categories above), just an on-demand boost. */}
          <TouchableOpacity style={styles.cardVertical} onPress={() => setShowPepTalk(true)}>
            <View style={[styles.iconCircle, { backgroundColor: '#FCE7D2' }]}>
              <Icon name="heart-pulse" size={26} color={Theme.flameOrange} />
            </View>
            <Text style={styles.cardTitleLg}>Mental Prep</Text>
            <Text style={styles.cardDesc}>Having a rough training day? Get a quick pep talk.</Text>
            <View style={styles.cardLinkRow}>
              <Text style={[styles.cardLinkText, { color: Theme.flameOrange }]}>Get a pep talk</Text>
              <Icon name="chevron-right" size={18} color={Theme.flameOrange} />
            </View>
          </TouchableOpacity>

          <View style={styles.sectionDivider} />

          {/* Coach Plan — highlights workouts/routines assigned by the coach */}
          <TouchableOpacity style={styles.coachPlanCard} onPress={goToCoach}>
            <View style={styles.coachPlanHeader}>
              <View style={styles.coachPlanIconCircle}>
                <Icon name="clipboard-text-outline" size={26} color="#123C35" />
              </View>
              <Text style={styles.coachPlanEyebrow}>COACH PLAN</Text>
            </View>
            {clubTag && (
              <View style={styles.coachPlanTag}>
                <Icon name="account-badge" size={13} color="#BEE6DA" />
                <Text style={styles.coachPlanTagText}>
                  {clubTag.coachName ? `${clubTag.coachName} · ` : ''}{clubTag.clubName}
                </Text>
              </View>
            )}
            <Text style={styles.coachPlanTitle}>
              {hasAssignedPlan ? 'New workouts, ready to train' : clubTag ? 'Nothing assigned yet' : 'No coach plan yet'}
            </Text>
            <Text style={styles.coachPlanDesc}>
              {hasAssignedPlan
                ? 'Your coach added new workouts and routines to your plan this week.'
                : clubTag
                  ? "Your coach hasn't assigned any workouts or a plan yet — check back soon."
                  : 'Connect with a coach to get workouts and a weekly plan built for you.'}
            </Text>
            <View style={styles.coachPlanBtn}>
              <Text style={styles.coachPlanBtnText}>View plan</Text>
              <Icon name="chevron-right" size={19} color="#123C35" />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <PepTalkModal visible={showPepTalk} onClose={() => setShowPepTalk(false)} />
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
  coachPlanTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  coachPlanTagText: { fontSize: 13, fontWeight: '600', color: '#BEE6DA' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 19, fontWeight: '600', color: Theme.textPrimary },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  cardSub: { fontSize: 15, color: Theme.textSecondary },
  customBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  customBadgeText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontFamily: Fonts.serifMedium, fontSize: 36, color: Theme.textPrimary, marginTop: 12, marginBottom: 4 },
});
