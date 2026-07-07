import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
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

const CATEGORY_COLORS: Record<string, string> = {
  strength: '#2ECC71', footwork: '#3498DB', endurance: '#E67E22', recovery: '#9B59B6',
};

const getEventColor = (type: string) => EVENT_TYPES.find(t => t.key === type)?.color ?? '#9B59B6';
const getEventIcon = (type: string) => EVENT_TYPES.find(t => t.key === type)?.icon ?? 'star';

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

type CalendarEvent = {
  id: string; title: string; event_type: string; event_date: string;
  start_time: string | null; end_time: string | null; location: string | null; notes: string | null;
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
  const [unreadAssignments, setUnreadAssignments] = useState(0);
  const [user, setUser] = useState<any>(null);

  // Calendar
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState('');
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddType, setQuickAddType] = useState('training');

  // Progress card
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [progressTab, setProgressTab] = useState<'bests' | 'weekly'>('bests');
  const [personalBests, setPersonalBests] = useState<any[]>([]);
  const [weeklyActivity, setWeeklyActivity] = useState<number[]>([]);

  const today = new Date();
  const todayDayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;

  const getWeekDates = () => {
    const dates: { date: number; full: string }[] = [];
    const monday = new Date(today);
    monday.setDate(today.getDate() - todayDayIndex);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push({ date: d.getDate(), full: d.toISOString().split('T')[0] });
    }
    return dates;
  };
  const weekDates = getWeekDates();

  const getEventsForDate = (dateStr: string) => weekEvents.filter(e => e.event_date === dateStr);
  const getDotsForDate = (dateStr: string) =>
    [...new Set(getEventsForDate(dateStr).map(e => e.event_type))].slice(0, 3);

  const countUniqueSessions = (data: any[]) =>
    new Set(data.map(s => `${new Date(s.created_at).toDateString()}_${s.category}`)).size;

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user;
      if (!currentUser) return;
      setUser(currentUser);

      const metaName = currentUser.user_metadata?.full_name;
      if (metaName) setUserName(metaName.split(' ')[0]);

      const { data: profileData } = await supabase
        .from('profiles').select('full_name, weekly_goal, age').eq('id', currentUser.id).single();
      if (profileData?.full_name && !metaName) setUserName(profileData.full_name.split(' ')[0]);
      if (profileData?.weekly_goal) setWeeklyGoal(profileData.weekly_goal);
      if (!profileData?.age) setNeedsOnboarding(true);

      const { data: unread } = await supabase
        .from('assignments').select('id').eq('player_id', currentUser.id).eq('seen', false);
      setUnreadAssignments((unread ?? []).length);

      const { data } = await supabase
        .from('session_logs').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
      if (!data) return;

      setTotalSessions(countUniqueSessions(data));
      setRecentSessions(data.slice(0, 3));

      // Streak
      const dates = [...new Set(data.map((s: any) => new Date(s.created_at).toDateString()))];
      let currentStreak = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (dates.includes(d.toDateString())) currentStreak++;
        else if (i > 0) break;
      }
      setStreak(currentStreak);

      // This week
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - todayDayIndex);
      startOfWeek.setHours(0, 0, 0, 0);
      const thisWeekData = data.filter((s: any) => new Date(s.created_at) >= startOfWeek);
      setWeekSessions(countUniqueSessions(thisWeekData));
      const daysDone = thisWeekData.map((s: any) => { const d = new Date(s.created_at).getDay(); return d === 0 ? 6 : d - 1; });
      setWeekDoneDays([...new Set(daysDone)].map(String));

      // Category counts
      setStrengthCount(countUniqueSessions(data.filter((s: any) => s.category === 'strength')));
      setFootworkCount(countUniqueSessions(data.filter((s: any) => s.category === 'footwork')));
      setEnduranceCount(countUniqueSessions(data.filter((s: any) => s.category === 'endurance')));
      setRecoveryCount(countUniqueSessions(data.filter((s: any) => s.category === 'recovery')));

      // Personal bests
      const bestMap: Record<string, any> = {};
      data.forEach((s: any) => {
        const ld = s.log_data;
        if (!ld) return;
        const key = s.exercise_name;
        if (!bestMap[key]) bestMap[key] = { name: key, category: s.category, weight: 0, reps: 0, time: 0, duration: 0 };
        if (ld.weight) bestMap[key].weight = Math.max(bestMap[key].weight, parseFloat(ld.weight) || 0);
        if (ld.reps) bestMap[key].reps = Math.max(bestMap[key].reps, parseInt(ld.reps) || 0);
        if (ld.time) bestMap[key].time = Math.max(bestMap[key].time, parseInt(ld.time) || 0);
        if (ld.duration) bestMap[key].duration = Math.max(bestMap[key].duration, parseInt(ld.duration) || 0);
      });
      setPersonalBests(
        Object.values(bestMap)
          .filter((b: any) => b.weight > 0 || b.reps > 0 || b.time > 0 || b.duration > 0)
          .slice(0, 10)
      );

      // Weekly activity — last 8 weeks
      const weekly: number[] = [];
      for (let w = 7; w >= 0; w--) {
        const wStart = new Date();
        wStart.setDate(wStart.getDate() - (w * 7) - ((wStart.getDay() + 6) % 7));
        wStart.setHours(0, 0, 0, 0);
        const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7);
        const count = new Set(
          data.filter((s: any) => { const d = new Date(s.created_at); return d >= wStart && d < wEnd; })
            .map((s: any) => new Date(s.created_at).toDateString())
        ).size;
        weekly.push(count);
      }
      setWeeklyActivity(weekly);

      // Calendar events
      const { data: eventsData } = await supabase
        .from('calendar_events').select('*').eq('user_id', currentUser.id)
        .gte('event_date', weekDates[0].full).lte('event_date', weekDates[6].full);
      if (eventsData) setWeekEvents(eventsData);

    } catch (e) { console.log('Error loading home data', e); }
  };

  const goToOnboarding = () => {
    if (typeof window !== 'undefined') window.location.href = '/onboarding';
    else router.push('/onboarding' as any);
  };

  const goToAssignments = () => {
    if (typeof window !== 'undefined') window.location.href = '/coach-section';
    else router.push('/coach-section' as any);
  };

  const goToCalendar = () => {
    if (typeof window !== 'undefined') window.location.href = '/calendar';
    else router.push('/calendar' as any);
  };

  const openQuickAdd = (dateStr: string) => {
    setQuickAddDate(dateStr); setQuickAddTitle(''); setQuickAddType('training'); setShowQuickAdd(true);
  };

  const saveQuickEvent = async () => {
    if (!quickAddTitle.trim()) { showAlert('Missing title', 'Please enter a title.'); return; }
    if (!user) return;
    try {
      const { error } = await supabase.from('calendar_events').insert({
        user_id: user.id, title: quickAddTitle.trim(), event_type: quickAddType, event_date: quickAddDate,
      });
      if (error) throw error;
      setShowQuickAdd(false);
      const { data: eventsData } = await supabase.from('calendar_events').select('*')
        .eq('user_id', user.id).gte('event_date', weekDates[0].full).lte('event_date', weekDates[6].full);
      if (eventsData) setWeekEvents(eventsData);
    } catch (e) { showAlert('Error', 'Could not save event.'); }
  };

  const formatQuickAddDate = () =>
    new Date(quickAddDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const getCategoryColor = (cat: string) => CATEGORY_COLORS[cat] ?? Colors.accent;
  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'strength': return 'dumbbell';
      case 'footwork': return 'badminton';
      case 'endurance': return 'lightning-bolt';
      case 'recovery': return 'heart-pulse';
      default: return 'star';
    }
  };

  const maxCount = Math.max(strengthCount, footworkCount, enduranceCount, recoveryCount, 1);
  const weekProgress = Math.min(weekSessions / weeklyGoal, 1);
  const maxWeekly = Math.max(...weeklyActivity, 1);
  const quickAddDateEvents = quickAddDate ? getEventsForDate(quickAddDate) : [];

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
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

        {/* Coach banner */}
        {unreadAssignments > 0 && (
          <TouchableOpacity style={styles.assignBanner} onPress={goToAssignments} activeOpacity={0.85}>
            <View style={styles.assignIconWrap}>
              <MaterialCommunityIcons name="clipboard-text" size={22} color={Colors.accent} />
              <View style={styles.redBadge}><Text style={styles.redBadgeText}>{unreadAssignments}</Text></View>
            </View>
            <View style={styles.assignTextWrap}>
              <Text style={styles.assignTitle}>New workout{unreadAssignments > 1 ? 's' : ''} from your coach</Text>
              <Text style={styles.assignDesc}>Tap to see what your coach sent you.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.accent} />
          </TouchableOpacity>
        )}

        {/* Onboarding banner */}
        {needsOnboarding && (
          <TouchableOpacity style={styles.onboardingBanner} onPress={goToOnboarding}>
            <View style={styles.onboardingIconWrap}>
              <MaterialCommunityIcons name="badminton" size={26} color={Colors.accent} />
            </View>
            <View style={styles.onboardingTextWrap}>
              <Text style={styles.onboardingTitle}>Complete Your Profile</Text>
              <Text style={styles.onboardingDesc}>Get personalized recommendations built just for you.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#1a1a1a" />
          </TouchableOpacity>
        )}

        {/* Weekly Calendar */}
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
                <TouchableOpacity key={day} style={styles.dayCol} onPress={() => openQuickAdd(dateInfo.full)} activeOpacity={0.7}>
                  <Text style={[styles.dayLabel, isToday && styles.dayLabelActive]}>{day}</Text>
                  <View style={[styles.dayCircle, isToday && styles.dayCircleToday, isDone && styles.dayCircleDone]}>
                    {isDone ? <MaterialCommunityIcons name="check" size={14} color="#fff" /> : <Text style={[styles.dayNum, isToday && styles.dayNumActive]}>{dateInfo.date}</Text>}
                  </View>
                  <View style={styles.eventDotsRow}>
                    {dots.map((type, di) => <View key={di} style={[styles.eventDot, { backgroundColor: getEventColor(type) }]} />)}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
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
                    {event.start_time ? <Text style={styles.todayEventTime}>{event.start_time}</Text> : null}
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
          {weekSessions >= weeklyGoal
            ? <Text style={styles.goalAchieved}>🎉 Weekly goal achieved!</Text>
            : <Text style={styles.goalRemaining}>{weeklyGoal - weekSessions} more session{weeklyGoal - weekSessions !== 1 ? 's' : ''} to reach your goal</Text>
          }
        </View>

        {/* ── PROGRESS CARD ── */}
        <TouchableOpacity
          style={[styles.progressCardHeader, progressExpanded && styles.progressCardHeaderExpanded]}
          onPress={() => setProgressExpanded(!progressExpanded)}
          activeOpacity={0.8}
        >
          <View style={styles.progressHeaderLeft}>
            <MaterialCommunityIcons name="chart-line" size={20} color={Colors.accent} />
            <Text style={styles.progressHeaderTitle}>My Progress</Text>
          </View>
          <View style={styles.progressHeaderRight}>
            <Text style={styles.progressHeaderSub}>{totalSessions} sessions total</Text>
            <MaterialCommunityIcons name={progressExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} />
          </View>
        </TouchableOpacity>

        {progressExpanded && (
          <View style={styles.progressCardBody}>
            {/* Tab row */}
            <View style={styles.progressTabRow}>
              {([['bests', 'Personal Bests'], ['weekly', 'Activity']] as const).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.progressTab, progressTab === key && styles.progressTabActive]}
                  onPress={() => setProgressTab(key)}
                >
                  <Text style={[styles.progressTabText, progressTab === key && styles.progressTabTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── PERSONAL BESTS ── */}
            {progressTab === 'bests' && (
              <View style={styles.progressSection}>
                {personalBests.length === 0 ? (
                  <View style={styles.progressEmpty}>
                    <MaterialCommunityIcons name="trophy-outline" size={36} color={Colors.textSecondary} />
                    <Text style={styles.progressEmptyText}>Log some sessions to see your personal bests here.</Text>
                  </View>
                ) : (
                  personalBests.map((b: any, i: number) => (
                    <View key={i} style={styles.bestRow}>
                      <View style={[styles.bestIcon, { backgroundColor: `${CATEGORY_COLORS[b.category] ?? Colors.accent}20` }]}>
                        <MaterialCommunityIcons name={getCategoryIcon(b.category) as any} size={16} color={CATEGORY_COLORS[b.category] ?? Colors.accent} />
                      </View>
                      <Text style={styles.bestName} numberOfLines={1}>{b.name}</Text>
                      <View style={styles.bestStats}>
                        {b.weight > 0 && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{b.weight}kg</Text><Text style={styles.bestStatLabel}>best</Text></View>}
                        {b.reps > 0 && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{b.reps}</Text><Text style={styles.bestStatLabel}>reps</Text></View>}
                        {b.time > 0 && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{b.time}s</Text><Text style={styles.bestStatLabel}>hold</Text></View>}
                        {b.duration > 0 && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{b.duration}m</Text><Text style={styles.bestStatLabel}>min</Text></View>}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* ── ACTIVITY ── */}
            {progressTab === 'weekly' && (
              <View style={styles.progressSection}>
                <Text style={styles.progressChartTitle}>SESSIONS PER WEEK · LAST 8 WEEKS</Text>
                <View style={styles.weeklyChart}>
                  {weeklyActivity.map((count, i) => {
                    const isThisWeek = i === 7;
                    const barH = maxWeekly > 0 ? Math.max((count / maxWeekly) * 90, count > 0 ? 8 : 2) : 2;
                    return (
                      <View key={i} style={styles.weeklyCol}>
                        <Text style={styles.weeklyCount}>{count > 0 ? count : ''}</Text>
                        <View style={[styles.weeklyBar, { height: barH, backgroundColor: isThisWeek ? Colors.accent : 'rgba(255,255,255,0.15)' }]} />
                        <Text style={[styles.weeklyLabel, isThisWeek && styles.weeklyLabelActive]}>
                          {i === 7 ? 'Now' : `W${i + 1}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <Text style={[styles.progressChartTitle, { marginTop: 20 }]}>CATEGORY BREAKDOWN</Text>
                {[
                  { label: 'Strength', count: strengthCount, color: '#2ECC71' },
                  { label: 'Footwork', count: footworkCount, color: '#3498DB' },
                  { label: 'Endurance', count: enduranceCount, color: '#E67E22' },
                  { label: 'Recovery', count: recoveryCount, color: '#9B59B6' },
                ].map(item => (
                  <View key={item.label} style={styles.catBreakRow}>
                    <View style={[styles.catBreakDot, { backgroundColor: item.color }]} />
                    <Text style={styles.catBreakLabel}>{item.label}</Text>
                    <View style={styles.catBreakTrack}>
                      <View style={[styles.catBreakFill, { width: `${(item.count / maxCount) * 100}%`, backgroundColor: item.color }]} />
                    </View>
                    <Text style={styles.catBreakCount}>{item.count}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Sessions by Category */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>SESSIONS BY CATEGORY</Text>
          {[
            { label: 'Strength', count: strengthCount, color: '#2ECC71' },
            { label: 'Footwork', count: footworkCount, color: '#3498DB' },
            { label: 'Endurance', count: enduranceCount, color: '#E67E22' },
            { label: 'Recovery', count: recoveryCount, color: '#9B59B6' },
          ].map(item => (
            <View key={item.label} style={styles.barRow}>
              <Text style={styles.barLabel}>{item.label}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(item.count / maxCount) * 100}%`, backgroundColor: item.color }]} />
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
                  <MaterialCommunityIcons name={getCategoryIcon(s.category) as any} size={18} color={getCategoryColor(s.category)} />
                </View>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityName}>{s.exercise_name}</Text>
                  <Text style={styles.activityDate}>{s.log_data?.date ?? ''}</Text>
                </View>
                <View style={[styles.categoryPill, { backgroundColor: `${getCategoryColor(s.category)}20` }]}>
                  <Text style={[styles.categoryPillText, { color: getCategoryColor(s.category) }]}>{s.category}</Text>
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
            {quickAddDateEvents.length > 0 && (
              <View style={styles.existingEventsSection}>
                <Text style={styles.existingEventsLabel}>{quickAddDateEvents.length} event{quickAddDateEvents.length !== 1 ? 's' : ''} scheduled</Text>
                {quickAddDateEvents.map(event => (
                  <View key={event.id} style={styles.existingEventRow}>
                    <View style={[styles.existingEventBar, { backgroundColor: getEventColor(event.event_type) }]} />
                    <MaterialCommunityIcons name={getEventIcon(event.event_type) as any} size={16} color={getEventColor(event.event_type)} />
                    <Text style={styles.existingEventTitle} numberOfLines={1}>{event.title}</Text>
                    {event.start_time ? <Text style={styles.existingEventTime}>{event.start_time}</Text> : null}
                  </View>
                ))}
                <View style={styles.existingEventsDivider} />
              </View>
            )}
            <Text style={styles.formLabel}>Title *</Text>
            <TextInput style={styles.formInput} placeholder="e.g. Leg Day, Tournament" placeholderTextColor={Colors.textSecondary} value={quickAddTitle} onChangeText={setQuickAddTitle} autoFocus />
            <Text style={styles.formLabel}>Type</Text>
            <View style={styles.typeRow}>
              {EVENT_TYPES.map(t => (
                <TouchableOpacity key={t.key} style={[styles.typePill, quickAddType === t.key && { backgroundColor: t.color, borderColor: t.color }]} onPress={() => setQuickAddType(t.key)}>
                  <MaterialCommunityIcons name={t.icon as any} size={14} color={quickAddType === t.key ? '#FFFFFF' : Colors.textSecondary} />
                  <Text style={[styles.typePillText, quickAddType === t.key && styles.typePillTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={saveQuickEvent}>
              <Text style={styles.saveBtnText}>Add Event</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fullDetailsBtn} onPress={() => { setShowQuickAdd(false); goToCalendar(); }}>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  greeting: { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary },
  subGreeting: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  streakBadge: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, alignItems: 'center' },
  streakEmoji: { fontSize: 20 },
  streakCount: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
  streakLabel: { fontSize: 10, color: Colors.textSecondary },
  assignBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.accent },
  assignIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  redBadge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: Colors.backgroundCard },
  redBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  assignTextWrap: { flex: 1 },
  assignTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 3 },
  assignDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  onboardingBanner: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  onboardingIconWrap: { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  onboardingTextWrap: { flex: 1 },
  onboardingTitle: { fontSize: 15, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 3 },
  onboardingDesc: { fontSize: 12, color: '#555555', lineHeight: 17 },
  calendarCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 16 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1 },
  fullCalBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fullCalText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', flex: 1 },
  dayLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4 },
  dayLabelActive: { color: Colors.accent },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  dayCircleToday: { borderWidth: 2, borderColor: Colors.accent },
  dayCircleDone: { backgroundColor: Colors.accent, borderWidth: 0 },
  dayNum: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  dayNumActive: { color: Colors.accent },
  eventDotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 10, marginTop: 4, gap: 4 },
  eventDot: { width: 6, height: 6, borderRadius: 3 },
  todayEventsSection: { marginTop: 12 },
  todayEventsDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 10 },
  todayEventsLabel: { fontSize: 10, fontWeight: 'bold', color: Colors.textSecondary, letterSpacing: 1, marginBottom: 8 },
  todayEventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  todayEventDot: { width: 8, height: 8, borderRadius: 4 },
  todayEventTitle: { flex: 1, fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  todayEventTime: { fontSize: 11, color: Colors.textSecondary },
  todayEventsMore: { fontSize: 11, color: Colors.accent, fontWeight: '600', marginTop: 4 },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1, marginBottom: 16 },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  goalText: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  goalPercent: { fontSize: 16, fontWeight: 'bold', color: Colors.accent },
  progressTrack: { height: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 6 },
  goalAchieved: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  goalRemaining: { fontSize: 13, color: Colors.textSecondary },

  // Progress card
  progressCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 16 },
  progressCardHeaderExpanded: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 },
  progressHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressHeaderTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  progressHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressHeaderSub: { fontSize: 12, color: Colors.textSecondary },
  progressCardBody: { backgroundColor: Colors.backgroundCard, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingHorizontal: 16, paddingBottom: 16, marginBottom: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  progressTabRow: { flexDirection: 'row', gap: 8, paddingTop: 14, marginBottom: 16 },
  progressTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  progressTabActive: { backgroundColor: Colors.accent },
  progressTabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  progressTabTextActive: { color: '#fff' },
  progressSection: { gap: 10 },
  progressEmpty: { paddingVertical: 32, alignItems: 'center', gap: 10 },
  progressEmptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },

  // Personal bests
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  bestIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bestName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  bestStats: { flexDirection: 'row', gap: 12 },
  bestStat: { alignItems: 'center', minWidth: 32 },
  bestStatVal: { fontSize: 13, fontWeight: 'bold', color: Colors.accent },
  bestStatLabel: { fontSize: 9, color: Colors.textSecondary, marginTop: 1 },

  // Weekly activity
  progressChartTitle: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: 12 },
  weeklyChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 120 },
  weeklyCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  weeklyCount: { fontSize: 9, color: Colors.textSecondary, fontWeight: '600', height: 12 },
  weeklyBar: { width: '100%', borderRadius: 4 },
  weeklyLabel: { fontSize: 9, color: Colors.textSecondary, fontWeight: '600' },
  weeklyLabelActive: { color: Colors.accent },
  catBreakRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBreakDot: { width: 8, height: 8, borderRadius: 4 },
  catBreakLabel: { width: 68, fontSize: 12, color: Colors.textSecondary },
  catBreakTrack: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  catBreakFill: { height: '100%', borderRadius: 3 },
  catBreakCount: { width: 20, fontSize: 12, color: Colors.textPrimary, fontWeight: '600', textAlign: 'right' },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  barLabel: { width: 72, fontSize: 13, color: Colors.textSecondary },
  barTrack: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barCount: { width: 24, fontSize: 13, color: Colors.textPrimary, fontWeight: '600', textAlign: 'right' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
  activityCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  activityIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activityInfo: { flex: 1 },
  activityName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  activityDate: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  categoryPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  categoryPillText: { fontSize: 11, fontWeight: '600' },
  emptyText: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.backgroundTop, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
  modalDate: { fontSize: 13, color: Colors.accent, fontWeight: '600', marginBottom: 16 },
  existingEventsSection: { marginBottom: 8 },
  existingEventsLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.textSecondary, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  existingEventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, marginBottom: 6 },
  existingEventBar: { width: 3, height: 20, borderRadius: 2 },
  existingEventTitle: { flex: 1, fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  existingEventTime: { fontSize: 11, color: Colors.textSecondary },
  existingEventsDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 8 },
  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 12 },
  formInput: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, color: Colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  typePillText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  typePillTextActive: { color: '#FFFFFF' },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  fullDetailsBtn: { alignItems: 'center', paddingVertical: 12 },
  fullDetailsBtnText: { color: Colors.accent, fontWeight: '600', fontSize: 13 },
});
