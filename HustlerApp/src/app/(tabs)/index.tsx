import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { getDailyQuote } from '@/constants/dailyQuotes';
import { supabase } from '../../lib/supabase';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EVENT_TYPES = [
  { key: 'tournament', label: 'Tournament', icon: 'trophy', color: '#E74C3C' },
  { key: 'training', label: 'Training', icon: 'dumbbell', color: '#2ECC71' },
  { key: 'rest', label: 'Rest Day', icon: 'bed', color: '#3498DB' },
  { key: 'custom', label: 'Custom', icon: 'star', color: '#F1C40F' },
];

const getEventColor = (type: string) => EVENT_TYPES.find(t => t.key === type)?.color ?? '#F1C40F';
const getEventIcon = (type: string) => EVENT_TYPES.find(t => t.key === type)?.icon ?? 'star';

const getCategoryTheme = (cat: string) =>
  CategoryTheme[cat as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };

const getCategoryIcon = (cat: string) => {
  switch (cat) {
    case 'strength': return 'dumbbell';
    case 'footwork': return 'badminton';
    case 'endurance': return 'lightning-bolt';
    case 'recovery': return 'heart-pulse';
    default: return 'star';
  }
};

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
  const [totalSessions, setTotalSessions] = useState(0);
  const [strengthCount, setStrengthCount] = useState(0);
  const [footworkCount, setFootworkCount] = useState(0);
  const [enduranceCount, setEnduranceCount] = useState(0);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [weekDonedays, setWeekDoneDays] = useState<string[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [unreadAssignments, setUnreadAssignments] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
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
  const todayEyebrow = `${today.toLocaleDateString('en-US', { weekday: 'long' })}, ${today.getDate()} ${today.toLocaleDateString('en-US', { month: 'long' })}`.toUpperCase();
  const dailyQuote = getDailyQuote(today);

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
        .from('profiles').select('full_name, age').eq('id', currentUser.id).single();
      if (profileData?.full_name && !metaName) setUserName(profileData.full_name.split(' ')[0]);
      if (!profileData?.age) setNeedsOnboarding(true);

      const { data: unread } = await supabase
        .from('assignments').select('id').eq('player_id', currentUser.id).eq('seen', false);
      setUnreadAssignments((unread ?? []).length);

      const { data: unreadNotifs } = await supabase
        .from('notifications').select('id').eq('user_id', currentUser.id).eq('type', 'coach_feedback').eq('seen', false);
      const { data: unreadPlans } = await supabase
        .from('weekly_plans').select('id').eq('player_id', currentUser.id).eq('seen', false);
      setUnreadNotifCount((unreadNotifs ?? []).length + (unreadPlans ?? []).length);

      const { data } = await supabase
        .from('session_logs').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
      if (!data) return;

      setTotalSessions(countUniqueSessions(data));
      setRecentSessions(data.slice(0, 3));

      // This week
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - todayDayIndex);
      startOfWeek.setHours(0, 0, 0, 0);
      const thisWeekData = data.filter((s: any) => new Date(s.created_at) >= startOfWeek);
      const daysDone = thisWeekData.map((s: any) => { const d = new Date(s.created_at).getDay(); return d === 0 ? 6 : d - 1; });
      setWeekDoneDays([...new Set(daysDone)].map(String));

      // Category counts
      setStrengthCount(countUniqueSessions(data.filter((s: any) => s.category === 'strength')));
      setFootworkCount(countUniqueSessions(data.filter((s: any) => s.category === 'footwork')));
      setEnduranceCount(countUniqueSessions(data.filter((s: any) => s.category === 'endurance')));
      setRecoveryCount(countUniqueSessions(data.filter((s: any) => s.category === 'recovery')));

      // Personal bests — pick the single best-performing logged session per
      // exercise (not a Frankenstein of independently-maxed fields), then show
      // that whole session (sets, reps, weight, duration...) as logged.
      const bestMetricPriority = ['weight', 'height', 'distance', 'time', 'reps', 'duration'];
      const bestMap: Record<string, any> = {};
      data.forEach((s: any) => {
        const ld = s.log_data;
        if (!ld) return;
        const key = s.exercise_name;
        const metric = bestMetricPriority.find(m => (parseFloat(ld[m]) || 0) > 0);
        if (!metric) return;
        const value = parseFloat(ld[metric]) || 0;
        const existing = bestMap[key];
        if (!existing || value > existing.value) {
          bestMap[key] = { name: key, category: s.category, value, log: ld };
        }
      });
      setPersonalBests(Object.values(bestMap).slice(0, 10));

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

  const goToNotifications = () => {
    if (typeof window !== 'undefined') window.location.href = '/notifications';
    else router.push('/notifications' as any);
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

  const maxCount = Math.max(strengthCount, footworkCount, enduranceCount, recoveryCount, 1);
  const maxWeekly = Math.max(...weeklyActivity, 1);
  const totalUnread = unreadAssignments + unreadNotifCount;
  const quickAddDateEvents = quickAddDate ? getEventsForDate(quickAddDate) : [];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{todayEyebrow}</Text>
            <Text style={styles.greeting}>Hi, {userName}.</Text>
            <View style={styles.quoteBlock}>
              <Text style={styles.quoteText}>"{dailyQuote.quote}"</Text>
              {dailyQuote.author ? <Text style={styles.quoteAuthor}>— {dailyQuote.author}</Text> : null}
            </View>
          </View>
          <TouchableOpacity style={styles.bellButton} onPress={goToNotifications} activeOpacity={0.8}>
            <MaterialCommunityIcons name="bell-outline" size={26} color={Theme.textPrimary} />
            {totalUnread > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{totalUnread > 9 ? '9+' : totalUnread}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Coach banner */}
        {unreadAssignments > 0 && (
          <TouchableOpacity style={styles.tintedBanner} onPress={goToAssignments} activeOpacity={0.85}>
            <View style={styles.bannerIconWrap}>
              <MaterialCommunityIcons name="clipboard-text" size={22} color={Theme.textPrimary} />
            </View>
            <View style={styles.bannerTextWrap}>
              <Text style={styles.bannerTitle}>New workout{unreadAssignments > 1 ? 's' : ''} from your coach</Text>
              <Text style={styles.bannerDesc}>Tap to see what your coach sent you.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Theme.textPrimary} />
          </TouchableOpacity>
        )}

        {/* Onboarding banner */}
        {needsOnboarding && (
          <TouchableOpacity style={styles.tintedBanner} onPress={goToOnboarding} activeOpacity={0.85}>
            <View style={styles.bannerIconWrap}>
              <MaterialCommunityIcons name="badminton" size={22} color={Theme.textPrimary} />
            </View>
            <View style={styles.bannerTextWrap}>
              <Text style={styles.bannerTitle}>Complete your profile</Text>
              <Text style={styles.bannerDesc}>Get personalized recommendations built just for you.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Theme.textPrimary} />
          </TouchableOpacity>
        )}

        {/* Weekly Calendar */}
        <View style={styles.whiteCard}>
          <View style={styles.calendarHeader}>
            <Text style={styles.eyebrowSection}>THIS WEEK</Text>
            <TouchableOpacity onPress={goToCalendar} style={styles.fullCalBtn}>
              <MaterialCommunityIcons name="calendar-month" size={16} color={Theme.todayBlue} />
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
                    {isDone
                      ? <MaterialCommunityIcons name="check" size={16} color={Theme.limeAccentDark} />
                      : <Text style={[styles.dayNum, isToday && styles.dayNumActive]}>{dateInfo.date}</Text>}
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

        {/* ── PROGRESS CARD ── */}
        <Text style={styles.sectionHeadline}>My progress</Text>
        <TouchableOpacity
          style={[styles.progressCardHeader, progressExpanded && styles.progressCardHeaderExpanded]}
          onPress={() => setProgressExpanded(!progressExpanded)}
          activeOpacity={0.8}
        >
          <View style={styles.progressHeaderLeft}>
            <MaterialCommunityIcons name="chart-line" size={20} color={Theme.todayBlue} />
            <Text style={styles.progressHeaderTitle}>Overview</Text>
          </View>
          <View style={styles.progressHeaderRight}>
            <Text style={styles.progressHeaderSub}>{totalSessions} sessions total</Text>
            <MaterialCommunityIcons name={progressExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={Theme.textSecondary} />
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
                    <MaterialCommunityIcons name="trophy-outline" size={36} color={Theme.textMuted} />
                    <Text style={styles.progressEmptyText}>Log some sessions to see your personal bests here.</Text>
                  </View>
                ) : (
                  personalBests.map((b: any, i: number) => {
                    const cat = getCategoryTheme(b.category);
                    const ld = b.log;
                    return (
                      <View key={i} style={styles.bestRow}>
                        <View style={[styles.bestIcon, { backgroundColor: cat.bg }]}>
                          <MaterialCommunityIcons name={getCategoryIcon(b.category) as any} size={16} color={cat.fg} />
                        </View>
                        <Text style={styles.bestName} numberOfLines={1}>{b.name}</Text>
                        <View style={styles.bestStats}>
                          {!!ld.weight && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.weight}kg</Text><Text style={styles.bestStatLabel}>weight</Text></View>}
                          {!!ld.sets && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.sets}</Text><Text style={styles.bestStatLabel}>sets</Text></View>}
                          {!!ld.reps && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.reps}</Text><Text style={styles.bestStatLabel}>reps</Text></View>}
                          {!!ld.height && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.height}in</Text><Text style={styles.bestStatLabel}>height</Text></View>}
                          {!!ld.time && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.time}s</Text><Text style={styles.bestStatLabel}>hold</Text></View>}
                          {!!ld.duration && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.duration}m</Text><Text style={styles.bestStatLabel}>duration</Text></View>}
                          {!!ld.distance && <View style={styles.bestStat}><Text style={styles.bestStatVal}>{ld.distance}</Text><Text style={styles.bestStatLabel}>distance</Text></View>}
                        </View>
                      </View>
                    );
                  })
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
                        <View style={[styles.weeklyBar, { height: barH, backgroundColor: isThisWeek ? Theme.limeAccent : Theme.divider }]} />
                        <Text style={[styles.weeklyLabel, isThisWeek && styles.weeklyLabelActive]}>
                          {i === 7 ? 'Now' : `W${i + 1}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <Text style={[styles.progressChartTitle, { marginTop: 20 }]}>CATEGORY BREAKDOWN</Text>
                {[
                  { key: 'strength', label: 'Strength', count: strengthCount, vivid: '#2E86DE' },
                  { key: 'footwork', label: 'Footwork', count: footworkCount, vivid: '#7CB342' },
                  { key: 'endurance', label: 'Endurance', count: enduranceCount, vivid: '#F2994A' },
                  { key: 'recovery', label: 'Recovery', count: recoveryCount, vivid: '#9575CD' },
                ].map(item => {
                  return (
                    <View key={item.label} style={styles.catBreakRow}>
                      <View style={[styles.catBreakDot, { backgroundColor: item.vivid }]} />
                      <Text style={styles.catBreakLabel}>{item.label}</Text>
                      <View style={styles.catBreakTrack}>
                        <View style={[styles.catBreakFill, { width: `${(item.count / maxCount) * 100}%`, backgroundColor: item.vivid }]} />
                      </View>
                      <Text style={styles.catBreakCount}>{item.count}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Recent Activity */}
        <Text style={styles.sectionHeadline}>Recent activity</Text>
        <View style={styles.whiteCard}>
          {recentSessions.length === 0 ? (
            <Text style={styles.emptyText}>No sessions logged yet. Start training!</Text>
          ) : (
            recentSessions.map((s, i) => {
              const cat = getCategoryTheme(s.category);
              return (
                <View key={i} style={[styles.activityRow, i < recentSessions.length - 1 && styles.activityBorder]}>
                  <View style={[styles.activityIcon, { backgroundColor: cat.bg }]}>
                    <MaterialCommunityIcons name={getCategoryIcon(s.category) as any} size={18} color={cat.fg} />
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityName}>{s.exercise_name}</Text>
                    <Text style={styles.activityDate}>{s.log_data?.date ?? ''}</Text>
                  </View>
                  <View style={[styles.categoryPill, { backgroundColor: cat.bg }]}>
                    <Text style={[styles.categoryPillText, { color: cat.fg }]}>{s.category}</Text>
                  </View>
                </View>
              );
            })
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
                <MaterialCommunityIcons name="close" size={24} color={Theme.textSecondary} />
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
            <TextInput style={styles.formInput} placeholder="e.g. Leg Day, Tournament" placeholderTextColor={Theme.textMuted} value={quickAddTitle} onChangeText={setQuickAddTitle} autoFocus />
            <Text style={styles.formLabel}>Type</Text>
            <View style={styles.typeRow}>
              {EVENT_TYPES.map(t => (
                <TouchableOpacity key={t.key} style={[styles.typePill, quickAddType === t.key && { backgroundColor: t.color, borderColor: t.color }]} onPress={() => setQuickAddType(t.key)}>
                  <MaterialCommunityIcons name={t.icon as any} size={14} color={quickAddType === t.key ? '#FFFFFF' : Theme.textSecondary} />
                  <Text style={[styles.typePillText, quickAddType === t.key && styles.typePillTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={saveQuickEvent}>
              <Text style={styles.saveBtnText}>Add Event</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fullDetailsBtn} onPress={() => { setShowQuickAdd(false); goToCalendar(); }}>
              <Text style={styles.fullDetailsBtnText}>Add with full details</Text>
              <MaterialCommunityIcons name="chevron-right" size={19} color={Theme.eyebrowGreen} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 170 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: '#0B7D62', letterSpacing: 1, marginBottom: 6 },
  greeting: { fontFamily: Fonts.serifMedium, fontSize: 36, color: Theme.textPrimary },
  quoteBlock: { borderLeftWidth: 2, borderLeftColor: '#0B7D62', paddingLeft: 12, marginTop: 8 },
  quoteText: { fontFamily: Fonts.sansItalic, fontSize: 19, color: Theme.textMuted, lineHeight: 26 },
  quoteAuthor: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textMuted, marginTop: 6 },
  bellButton: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: Theme.cardWhite,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: '#D64545', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5, borderWidth: 2, borderColor: Theme.background,
  },
  bellBadgeText: { fontFamily: Fonts.sansBold, color: '#FFFFFF', fontSize: 11 },

  // Tier 2 tinted banners
  tintedBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardTinted, borderRadius: 16, padding: 16, marginBottom: 16 },
  bannerIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  bannerTextWrap: { flex: 1 },
  bannerTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary, marginBottom: 3 },
  bannerDesc: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, lineHeight: 20 },

  // Section headers
  eyebrowSection: { fontFamily: Fonts.sansMedium, fontSize: 11, color: '#0B7D62', letterSpacing: 1, marginBottom: 4 },
  sectionHeadline: { fontFamily: Fonts.serifMedium, fontSize: 26, color: Theme.textPrimary, marginBottom: 12 },

  // Tier 1 white card
  whiteCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 24 },

  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  fullCalBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fullCalText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.todayBlue },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', flex: 1 },
  dayLabel: { fontFamily: Fonts.sansBold, fontSize: 15, color: Theme.textSecondary, marginBottom: 6 },
  dayLabelActive: { color: Theme.eyebrowGreen },
  dayCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  dayCircleToday: { backgroundColor: '#D8F35C' },
  dayCircleDone: { backgroundColor: Theme.limeAccent },
  dayNum: { fontFamily: Fonts.sansBold, fontSize: 17, color: Theme.textSecondary },
  dayNumActive: { color: '#0B7D62' },
  eventDotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 12, marginTop: 6, gap: 4 },
  eventDot: { width: 7, height: 7, borderRadius: 3.5 },
  todayEventsSection: { marginTop: 14 },
  todayEventsDivider: { height: 1, backgroundColor: Theme.divider, marginBottom: 10 },
  todayEventsLabel: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.textSecondary, letterSpacing: 1, marginBottom: 8 },
  todayEventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  todayEventDot: { width: 9, height: 9, borderRadius: 4.5 },
  todayEventTitle: { fontFamily: Fonts.sansMedium, flex: 1, fontSize: 15, color: Theme.textPrimary },
  todayEventTime: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary },
  todayEventsMore: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen, marginTop: 4 },

  // Progress card
  progressCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 16 },
  progressCardHeaderExpanded: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 },
  progressHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressHeaderTitle: { fontFamily: Fonts.sansBold, fontSize: 17, color: Theme.textPrimary },
  progressHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressHeaderSub: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary },
  progressCardBody: { backgroundColor: Theme.cardWhite, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingHorizontal: 16, paddingBottom: 16, marginBottom: 24, borderTopWidth: 1, borderTopColor: Theme.divider },
  progressTabRow: { flexDirection: 'row', gap: 8, paddingTop: 14, marginBottom: 16 },
  progressTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: Theme.background },
  progressTabActive: { backgroundColor: '#D8F35C' },
  progressTabText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  progressTabTextActive: { color: Theme.limeAccentDark },
  progressSection: { gap: 10 },
  progressEmpty: { paddingVertical: 32, alignItems: 'center', gap: 10 },
  progressEmptyText: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, textAlign: 'center' },

  // Personal bests
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Theme.divider },
  bestIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bestName: { fontFamily: Fonts.sansSemiBold, flex: 1, fontSize: 16, color: Theme.textPrimary },
  bestStats: { flexDirection: 'row', gap: 12 },
  bestStat: { alignItems: 'center', minWidth: 32 },
  bestStatVal: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.eyebrowGreen },
  bestStatLabel: { fontFamily: Fonts.sansRegular, fontSize: 12, color: Theme.textSecondary, marginTop: 1 },

  // Weekly activity
  progressChartTitle: { fontFamily: Fonts.sansBold, fontSize: 12, color: Theme.textSecondary, letterSpacing: 1, marginBottom: 12 },
  weeklyChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 120 },
  weeklyCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  weeklyCount: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.textSecondary, height: 14 },
  weeklyBar: { width: '100%', borderRadius: 4 },
  weeklyLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.textSecondary },
  weeklyLabelActive: { color: Theme.eyebrowGreen },
  catBreakRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBreakDot: { width: 8, height: 8, borderRadius: 4 },
  catBreakLabel: { fontFamily: Fonts.sansRegular, width: 72, fontSize: 13, color: Theme.textSecondary },
  catBreakTrack: { flex: 1, height: 6, backgroundColor: Theme.background, borderRadius: 3, overflow: 'hidden' },
  catBreakFill: { height: '100%', borderRadius: 3 },
  catBreakCount: { fontFamily: Fonts.sansSemiBold, width: 24, fontSize: 13, color: Theme.textPrimary, textAlign: 'right' },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: Theme.divider },
  activityIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activityInfo: { flex: 1 },
  activityName: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  activityDate: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  categoryPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  categoryPillText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  emptyText: { fontFamily: Fonts.sansItalic, fontSize: 15, color: Theme.textSecondary },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary },
  modalDate: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen, marginBottom: 16 },
  existingEventsSection: { marginBottom: 8 },
  existingEventsLabel: { fontFamily: Fonts.sansBold, fontSize: 12, color: Theme.textSecondary, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  existingEventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: Theme.cardWhite, borderRadius: 10, marginBottom: 6 },
  existingEventBar: { width: 3, height: 20, borderRadius: 2 },
  existingEventTitle: { fontFamily: Fonts.sansMedium, flex: 1, fontSize: 14, color: Theme.textPrimary },
  existingEventTime: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary },
  existingEventsDivider: { height: 1, backgroundColor: Theme.divider, marginTop: 8 },
  formLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary, marginBottom: 6, marginTop: 12 },
  formInput: { fontFamily: Fonts.sansRegular, backgroundColor: Theme.cardWhite, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, color: Theme.textPrimary, fontSize: 15, borderWidth: 1, borderColor: Theme.divider },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  typePillText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary },
  typePillTextActive: { color: '#FFFFFF' },
  saveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 15 },
  fullDetailsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  fullDetailsBtnText: { fontFamily: Fonts.sansSemiBold, color: Theme.eyebrowGreen, fontSize: 14 },
});
