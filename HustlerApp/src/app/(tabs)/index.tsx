import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EVENT_TYPES = [
  { key: 'tournament', label: 'Tournament', icon: 'trophy', color: '#F1C40F' },
  { key: 'training', label: 'Training', icon: 'dumbbell', color: '#2ECC71' },
  { key: 'rest', label: 'Rest Day', icon: 'bed', color: '#3498DB' },
  { key: 'custom', label: 'Custom', icon: 'star', color: '#9B59B6' },
];

const getEventColor = (type: string) => {
  return EVENT_TYPES.find(t => t.key === type)?.color ?? '#9B59B6';
};

const getEventIcon = (type: string) => {
  return EVENT_TYPES.find(t => t.key === type)?.icon ?? 'star';
};

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

type CalendarEvent = {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
};

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
  const [user, setUser] = useState<any>(null);

  // Calendar events state
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState('');
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddType, setQuickAddType] = useState('training');

  const today = new Date();
  const todayDayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;

  const getWeekDates = () => {
    const dates: { date: number; full: string }[] = [];
    const monday = new Date(today);
    monday.setDate(today.getDate() - todayDayIndex);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push({
        date: d.getDate(),
        full: d.toISOString().split('T')[0],
      });
    }
    return dates;
  };
  const weekDates = getWeekDates();

  const getEventsForDate = (dateStr: string) => weekEvents.filter(e => e.event_date === dateStr);

  const getDotsForDate = (dateStr: string) => {
    const dayEvents = getEventsForDate(dateStr);
    const uniqueTypes = [...new Set(dayEvents.map(e => e.event_type))];
    return uniqueTypes.slice(0, 3);
  };

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
      const currentUser = session?.user;
      if (!currentUser) return;
      setUser(currentUser);

      const metaName = currentUser.user_metadata?.full_name;
      if (metaName) {
        setUserName(metaName.split(' ')[0]);
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, weekly_goal, age')
        .eq('id', currentUser.id)
        .single();

      if (profileData?.full_name && !metaName) {
        setUserName(profileData.full_name.split(' ')[0]);
      }
      if (profileData?.weekly_goal) setWeeklyGoal(profileData.weekly_goal);

      if (!profileData?.age) {
        setNeedsOnboarding(true);
      }

      const { data } = await supabase
        .from('session_logs')
        .select('*')
        .eq('user_id', currentUser.id)
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

      // Load week's calendar events
      const weekStart = weekDates[0].full;
      const weekEnd = weekDates[6].full;
      const { data: eventsData } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('event_date', weekStart)
        .lte('event_date', weekEnd);

      if (eventsData) setWeekEvents(eventsData);

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

  const goToCalendar = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/calendar';
    } else {
      router.push('/calendar' as any);
    }
  };

  const openQuickAdd = (dateStr: string) => {
    setQuickAddDate(dateStr);
    setQuickAddTitle('');
    setQuickAddType('training');
    setShowQuickAdd(true);
  };

  const saveQuickEvent = async () => {
    if (!quickAddTitle.trim()) {
      showAlert('Missing title', 'Please enter a title for this event.');
      return;
    }
    if (!user) return;

    try {
      const { error } = await supabase.from('calendar_events').insert({
        user_id: user.id,
        title: quickAddTitle.trim(),
        event_type: quickAddType,
        event_date: quickAddDate,
      });
      if (error) throw error;

      setShowQuickAdd(false);
      // Reload events
      const weekStart = weekDates[0].full;
      const weekEnd = weekDates[6].full;
      const { data: eventsData } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('event_date', weekStart)
        .lte('event_date', weekEnd);
      if (eventsData) setWeekEvents(eventsData);
    } catch (e) {
      console.log('Quick add error:', e);
      showAlert('Error', 'Could not save event.');
    }
  };

  const formatQuickAddDate = () => {
    const d = new Date(quickAddDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

  // Get existing events for the currently selected quick-add date
  const quickAddDateEvents = quickAddDate ? getEventsForDate(quickAddDate) : [];

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

        {/* Weekly Calendar — now tappable with event dots */}
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Text style={styles.sectionLabel}>THIS WEEK</Text>
            <TouchableOpacity onPress={goToCalendar} style={styles.fullCalBtn}>
              <MaterialCommunityIcons name="calendar-month" size={16} color={Colors.accent} />
              <Text style={styles.fullCalText}>Full Calendar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.daysRow}>
            {DAYS.map((day, i) => {
              const isToday = i === todayDayIndex;
              const isDone = weekDonedays.includes(String(i));
              const dateInfo = weekDates[i];
              const dots = getDotsForDate(dateInfo.full);

              return (
                <TouchableOpacity
                  key={day}
                  style={styles.dayCol}
                  onPress={() => openQuickAdd(dateInfo.full)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dayLabel, isToday && styles.dayLabelActive]}>{day}</Text>
                  <View style={[
                    styles.dayCircle,
                    isToday && styles.dayCircleToday,
                    isDone && styles.dayCircleDone,
                  ]}>
                    {isDone
                      ? <MaterialCommunityIcons name="check" size={14} color="#fff" />
                      : <Text style={[styles.dayNum, isToday && styles.dayNumActive]}>{dateInfo.date}</Text>
                    }
                  </View>
                  {/* Event dots below the circle — fixed alignment */}
                  <View style={styles.eventDotsRow}>
                    {dots.map((type, di) => (
                      <View
                        key={di}
                        style={[styles.eventDot, { backgroundColor: getEventColor(type) }]}
                      />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Today's events preview */}
          {(() => {
            const todayStr = weekDates[todayDayIndex].full;
            const todayEvents = getEventsForDate(todayStr);
            if (todayEvents.length === 0) return null;
            return (
              <View style={styles.todayEventsSection}>
                <View style={styles.todayEventsDivider} />
                <Text style={styles.todayEventsLabel}>TODAY</Text>
                {todayEvents.slice(0, 2).map(event => (
                  <View key={event.id} style={styles.todayEventRow}>
                    <View style={[styles.todayEventDot, { backgroundColor: getEventColor(event.event_type) }]} />
                    <Text style={styles.todayEventTitle} numberOfLines={1}>{event.title}</Text>
                    {event.start_time ? (
                      <Text style={styles.todayEventTime}>{event.start_time}</Text>
                    ) : null}
                  </View>
                ))}
                {todayEvents.length > 2 && (
                  <TouchableOpacity onPress={goToCalendar}>
                    <Text style={styles.todayEventsMore}>+{todayEvents.length - 2} more</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}
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

      {/* Quick Add Modal */}
      <Modal visible={showQuickAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Add</Text>
              <TouchableOpacity onPress={() => setShowQuickAdd(false)}>
                <MaterialCommunityIcons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDate}>{quickAddDate ? formatQuickAddDate() : ''}</Text>

            {/* Existing events for this date */}
            {quickAddDateEvents.length > 0 && (
              <View style={styles.existingEventsSection}>
                <Text style={styles.existingEventsLabel}>
                  {quickAddDateEvents.length} event{quickAddDateEvents.length !== 1 ? 's' : ''} scheduled
                </Text>
                {quickAddDateEvents.map(event => (
                  <View key={event.id} style={styles.existingEventRow}>
                    <View style={[styles.existingEventBar, { backgroundColor: getEventColor(event.event_type) }]} />
                    <MaterialCommunityIcons
                      name={getEventIcon(event.event_type) as any}
                      size={16}
                      color={getEventColor(event.event_type)}
                    />
                    <Text style={styles.existingEventTitle} numberOfLines={1}>{event.title}</Text>
                    {event.start_time ? (
                      <Text style={styles.existingEventTime}>{event.start_time}</Text>
                    ) : null}
                  </View>
                ))}
                <View style={styles.existingEventsDivider} />
              </View>
            )}

            <Text style={styles.formLabel}>Title *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. Leg Day, Tournament"
              placeholderTextColor={Colors.textSecondary}
              value={quickAddTitle}
              onChangeText={setQuickAddTitle}
              autoFocus
            />

            <Text style={styles.formLabel}>Type</Text>
            <View style={styles.typeRow}>
              {EVENT_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.typePill,
                    quickAddType === t.key && { backgroundColor: t.color, borderColor: t.color },
                  ]}
                  onPress={() => setQuickAddType(t.key)}
                >
                  <MaterialCommunityIcons
                    name={t.icon as any}
                    size={14}
                    color={quickAddType === t.key ? '#FFFFFF' : Colors.textSecondary}
                  />
                  <Text style={[
                    styles.typePillText,
                    quickAddType === t.key && styles.typePillTextActive,
                  ]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={saveQuickEvent}>
              <Text style={styles.saveBtnText}>Add Event</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.fullDetailsBtn} onPress={() => {
              setShowQuickAdd(false);
              goToCalendar();
            }}>
              <Text style={styles.fullDetailsBtnText}>Add with full details →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.accent,
    letterSpacing: 1,
  },
  fullCalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fullCalText: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
  },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', flex: 1 },
  dayLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4 },
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
  eventDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 10,
    marginTop: 4,
    gap: 4,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Today's events preview
  todayEventsSection: {
    marginTop: 12,
  },
  todayEventsDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  todayEventsLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  todayEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  todayEventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  todayEventTitle: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  todayEventTime: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  todayEventsMore: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '600',
    marginTop: 4,
  },

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

  // Quick Add Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.backgroundTop,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  modalDate: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '600',
    marginBottom: 16,
  },

  // Existing events in Quick Add modal
  existingEventsSection: {
    marginBottom: 8,
  },
  existingEventsLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  existingEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    marginBottom: 6,
  },
  existingEventBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  existingEventTitle: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  existingEventTime: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  existingEventsDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 8,
  },

  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: Colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  typePillTextActive: {
    color: '#FFFFFF',
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  fullDetailsBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  fullDetailsBtnText: {
    color: Colors.accent,
    fontWeight: '600',
    fontSize: 13,
  },
});
