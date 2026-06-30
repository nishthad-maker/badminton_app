import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function HomeScreen() {
  const [userName, setUserName] = useState('');
  const [streak, setStreak] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [weekSessions, setWeekSessions] = useState(0);
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [strengthCount, setStrengthCount] = useState(0);
  const [footworkCount, setFootworkCount] = useState(0);
  const [enduranceCount, setEnduranceCount] = useState(0);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [weekDonedays, setWeekDoneDays] = useState<string[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const today = new Date();
  const todayDayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;

  const getWeekDates = () => {
    const dates = [];
    const monday = new Date(today);
    monday.setDate(today.getDate() - todayDayIndex);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d.getDate());
    }
    return dates;
  };
  const weekDates = getWeekDates();

  const countUniqueSessions = (data: any[]) => {
    return new Set(
      data.map(s => `${new Date(s.created_at).toDateString()}_${s.category}`)
    ).size;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const metaName = user.user_metadata?.full_name;
      if (metaName) {
        setUserName(metaName.split(' ')[0]);
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, weekly_goal, age')
        .eq('id', user.id)
        .single();

      if (profileData?.full_name && !metaName) {
        setUserName(profileData.full_name.split(' ')[0]);
      }
      if (profileData?.weekly_goal) setWeeklyGoal(profileData.weekly_goal);

      // Check if onboarding is needed
      if (!profileData?.age) {
        setNeedsOnboarding(true);
      }

      const { data } = await supabase
        .from('session_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!data) return;

      setTotalSessions(countUniqueSessions(data));
      setRecentSessions(data.slice(0, 3));

      const dates = [...new Set(data.map(s =>
        new Date(s.created_at).toDateString()
      ))];
      let currentStreak = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (dates.includes(d.toDateString())) {
          currentStreak++;
        } else if (i > 0) {
          break;
        }
      }
      setStreak(currentStreak);

      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - todayDayIndex);
      startOfWeek.setHours(0, 0, 0, 0);
      const thisWeekData = data.filter(s => new Date(s.created_at) >= startOfWeek);
      setWeekSessions(countUniqueSessions(thisWeekData));

      const daysDone = thisWeekData.map(s => {
        const d = new Date(s.created_at).getDay();
        return d === 0 ? 6 : d - 1;
      });
      setWeekDoneDays([...new Set(daysDone)].map(String));

      const strengthData = data.filter(s => s.category === 'strength');
      const footworkData = data.filter(s => s.category === 'footwork');
      const enduranceData = data.filter(s => s.category === 'endurance');
      const recoveryData = data.filter(s => s.category === 'recovery');
      setStrengthCount(countUniqueSessions(strengthData));
      setFootworkCount(countUniqueSessions(footworkData));
      setEnduranceCount(countUniqueSessions(enduranceData));
      setRecoveryCount(countUniqueSessions(recoveryData));

    } catch (e) {
      console.log('Error loading home data', e);
    }
  };

  const goToOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/onboarding';
    } else {
      router.push('/onboarding' as any);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'strength': return '#2ECC71';
      case 'footwork': return '#3498DB';
      case 'endurance': return '#E67E22';
      case 'recovery': return '#9B59B6';
      default: return Colors.accent;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'strength': return 'dumbbell';
      case 'footwork': return 'badminton';
      case 'endurance': return 'lightning-bolt';
      case 'recovery': return 'heart-pulse';
      default: return 'star';
    }
  };

  const maxCount = Math.max(strengthCount, footworkCount, enduranceCount, recoveryCount, 1);
  const weekProgress = Math.min(weekSessions / weeklyGoal, 1);

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hi {userName} 👋</Text>
            <Text style={styles.subGreeting}>Ready to train today?</Text>
          </View>
          <View style={styles.streakBadge}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakCount}>{streak}</Text>
            <Text style={styles.streakLabel}>day streak</Text>
          </View>
        </View>

        {/* Onboarding Banner */}
        {needsOnboarding && (
          <TouchableOpacity style={styles.onboardingBanner} onPress={goToOnboarding}>
            <View style={styles.onboardingIconWrap}>
              <MaterialCommunityIcons name="badminton" size={26} color={Colors.accent} />
            </View>
            <View style={styles.onboardingTextWrap}>
              <Text style={styles.onboardingTitle}>Complete Your Profile</Text>
              <Text style={styles.onboardingDesc}>
                Get personalized recommendations built just for you, your goals, and your skill level.
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#1a1a1a" />
          </TouchableOpacity>
        )}

        {/* Weekly Calendar */}
        <View style={styles.calendarCard}>
          <Text style={styles.sectionLabel}>THIS WEEK</Text>
          <View style={styles.daysRow}>
            {DAYS.map((day, i) => {
              const isToday = i === todayDayIndex;
              const isDone = weekDonedays.includes(String(i));
              return (
                <View key={day} style={styles.dayCol}>
                  <Text style={[styles.dayLabel, isToday && styles.dayLabelActive]}>{day}</Text>
                  <View style={[
                    styles.dayCircle,
                    isToday && styles.dayCircleToday,
                    isDone && styles.dayCircleDone,
                  ]}>
                    {isDone
                      ? <MaterialCommunityIcons name="check" size={14} color="#fff" />
                      : <Text style={[styles.dayNum, isToday && styles.dayNumActive]}>{weekDates[i]}</Text>
                    }
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Weekly Goal */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>THIS WEEK'S GOAL</Text>
          <View style={styles.goalRow}>
            <Text style={styles.goalText}>{weekSessions} / {weeklyGoal} sessions</Text>
            <Text style={styles.goalPercent}>{Math.round(weekProgress * 100)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${weekProgress * 100}%` }]} />
          </View>
          {weekSessions >= weeklyGoal ? (
            <Text style={styles.goalAchieved}>🎉 Weekly goal achieved!</Text>
          ) : (
            <Text style={styles.goalRemaining}>
              {weeklyGoal - weekSessions} more session{weeklyGoal - weekSessions !== 1 ? 's' : ''} to reach your goal
            </Text>
          )}
        </View>

        {/* Sessions by Category */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>SESSIONS BY CATEGORY</Text>
          {[
            { label: 'Strength', count: strengthCount, color: '#2ECC71' },
            { label: 'Footwork', count: footworkCount, color: '#3498DB' },
            { label: 'Endurance', count: enduranceCount, color: '#E67E22' },
            { label: 'Recovery', count: recoveryCount, color: '#9B59B6' },
          ].map((item) => (
            <View key={item.label} style={styles.barRow}>
              <Text style={styles.barLabel}>{item.label}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, {
                  width: `${(item.count / maxCount) * 100}%`,
                  backgroundColor: item.color,
                }]} />
              </View>
              <Text style={styles.barCount}>{item.count}</Text>
            </View>
          ))}
        </View>

        {/* Recent Activity */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.activityCard}>
          {recentSessions.length === 0 ? (
            <Text style={styles.emptyText}>No sessions logged yet. Start training!</Text>
          ) : (
            recentSessions.map((s, i) => (
              <View key={i} style={[styles.activityRow, i < recentSessions.length - 1 && styles.activityBorder]}>
                <View style={[styles.activityIcon, { backgroundColor: `${getCategoryColor(s.category)}20` }]}>
                  <MaterialCommunityIcons
                    name={getCategoryIcon(s.category) as any}
                    size={18}
                    color={getCategoryColor(s.category)}
                  />
                </View>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityName}>{s.exercise_name}</Text>
                  <Text style={styles.activityDate}>{s.log_data?.date ?? ''}</Text>
                </View>
                <View style={[styles.categoryPill, { backgroundColor: `${getCategoryColor(s.category)}20` }]}>
                  <Text style={[styles.categoryPillText, { color: getCategoryColor(s.category) }]}>
                    {s.category}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary },
  subGreeting: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  streakBadge: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  streakEmoji: { fontSize: 20 },
  streakCount: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
  streakLabel: { fontSize: 10, color: Colors.textSecondary },
  onboardingBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  onboardingIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingTextWrap: { flex: 1 },
  onboardingTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 3,
  },
  onboardingDesc: {
    fontSize: 12,
    color: '#555555',
    lineHeight: 17,
  },
  calendarCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.accent,
    letterSpacing: 1,
    marginBottom: 12,
  },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  dayLabelActive: { color: Colors.accent },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  dayCircleToday: { borderWidth: 2, borderColor: Colors.accent },
  dayCircleDone: { backgroundColor: Colors.accent, borderWidth: 0 },
  dayNum: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  dayNumActive: { color: Colors.accent },
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.accent,
    letterSpacing: 1,
    marginBottom: 16,
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  goalText: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  goalPercent: { fontSize: 16, fontWeight: 'bold', color: Colors.accent },
  progressTrack: {
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 6,
  },
  goalAchieved: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  goalRemaining: { fontSize: 13, color: Colors.textSecondary },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  barLabel: { width: 72, fontSize: 13, color: Colors.textSecondary },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  barCount: { width: 24, fontSize: 13, color: Colors.textPrimary, fontWeight: '600', textAlign: 'right' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  activityCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  activityBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityInfo: { flex: 1 },
  activityName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  activityDate: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryPillText: { fontSize: 11, fontWeight: '600' },
  emptyText: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
});