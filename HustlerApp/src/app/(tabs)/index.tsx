import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const navigate = (category: string) => {
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = `/workouts?category=${category}`;
  } else {
    router.push({ pathname: '/workouts', params: { category } });
  }
};

export default function HomeScreen() {
  const [userName, setUserName] = useState('');
  const [totalSessions, setTotalSessions] = useState(0);
  const [weekSessions, setWeekSessions] = useState<string[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);

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
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        if (profile?.full_name) {
          setUserName(profile.full_name.split(' ')[0]);
        } else {
          setUserName('Athlete');
        }
      }

      const { data } = await supabase
        .from('session_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!data) return;

      setTotalSessions(data.length);
      setRecentSessions(data.slice(0, 3));

      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - todayDayIndex);
      startOfWeek.setHours(0, 0, 0, 0);

      const thisWeek = data.filter(s => new Date(s.created_at) >= startOfWeek);
      const daysDone = thisWeek.map(s => {
        const d = new Date(s.created_at).getDay();
        return d === 0 ? 6 : d - 1;
      });
      setWeekSessions([...new Set(daysDone)].map(String));
    } catch (e) {
      console.log('Error loading home data', e);
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
            <Text style={styles.streakCount}>{totalSessions}</Text>
            <Text style={styles.streakLabel}>sessions</Text>
          </View>
        </View>

        {/* Weekly Calendar */}
        <View style={styles.calendarCard}>
          <Text style={styles.sectionLabel}>THIS WEEK</Text>
          <View style={styles.daysRow}>
            {DAYS.map((day, i) => {
              const isToday = i === todayDayIndex;
              const isDone = weekSessions.includes(String(i));
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

        {/* Workout Categories */}
        <Text style={styles.sectionTitle}>Start Training</Text>
        <View style={styles.categoryCards}>
          <TouchableOpacity
            style={styles.categoryCard}
            onPress={() => navigate('strength')}
          >
            <View style={[styles.iconBox, { backgroundColor: 'rgba(46,204,113,0.15)' }]}>
              <MaterialCommunityIcons name="dumbbell" size={22} color={Colors.accent} />
            </View>
            <Text style={styles.categoryTitle}>Strength</Text>
            <Text style={styles.categorySub}>13 exercises</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.categoryCard}
            onPress={() => navigate('footwork')}
          >
            <View style={[styles.iconBox, { backgroundColor: 'rgba(52,152,219,0.15)' }]}>
              <MaterialCommunityIcons name="badminton" size={22} color="#3498DB" />
            </View>
            <Text style={styles.categoryTitle}>Footwork</Text>
            <Text style={styles.categorySub}>3 drills</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.categoryCard}
            onPress={() => navigate('endurance')}
          >
            <View style={[styles.iconBox, { backgroundColor: 'rgba(230,126,34,0.15)' }]}>
              <MaterialCommunityIcons name="lightning-bolt" size={22} color="#E67E22" />
            </View>
            <Text style={styles.categoryTitle}>Endurance</Text>
            <Text style={styles.categorySub}>4 workouts</Text>
          </TouchableOpacity>
        </View>

        {/* Recovery Card */}
        <TouchableOpacity
          style={styles.recoveryCard}
          onPress={() => navigate('recovery')}
        >
          <View style={[styles.iconBox, { backgroundColor: 'rgba(155,89,182,0.15)' }]}>
            <MaterialCommunityIcons name="heart-pulse" size={22} color="#9B59B6" />
          </View>
          <View style={styles.recoveryInfo}>
            <Text style={styles.recoveryTitle}>Recovery</Text>
            <Text style={styles.recoverySub}>Stretching, Foam Rolling, Breathing</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

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
  calendarCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
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
  dayCircleToday: {
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  dayCircleDone: {
    backgroundColor: Colors.accent,
    borderWidth: 0,
  },
  dayNum: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  dayNumActive: { color: Colors.accent },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  categoryCards: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  categoryCard: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  categorySub: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  recoveryCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  recoveryInfo: { flex: 1 },
  recoveryTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  recoverySub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
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