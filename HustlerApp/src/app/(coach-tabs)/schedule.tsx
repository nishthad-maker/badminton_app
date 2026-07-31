import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { formatTime12h, firstName } from '../../lib/scheduling';
import { getMyClub, MyClub } from '../../lib/club';
import ClubCalendarScreen from '../(club-admin)/club-calendar';

type Tournament = {
  id: string;
  player_id: string;
  playerName: string;
  title: string;
  event_date: string;
  start_time: string | null;
  location: string | null;
};

type CoachEvent = {
  id: string;
  event_date: string;
  event_type: 'tournament' | 'private_lesson' | 'group_lesson' | 'other';
  title: string;
  event_time: string | null;
  player_id: string | null;
  playerName: string | null;
};

type DayItem = {
  key: string;
  time: string | null;
  icon: string;
  color: string;
  title: string;
  detailLines: string[];
  onDelete?: () => void;
};

// Sorts free-text times like "9:00 AM" / "14:30" chronologically; items with no
// or unparsed time sink to the bottom instead of breaking the sort.
const parseTimeToMinutes = (t: string | null): number => {
  if (!t) return 9999;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!m) return 9998;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

const TOURNAMENT_COLOR = '#E74C3C';
const COACH_TYPES = [
  { key: 'tournament', label: 'Tournament', icon: 'trophy', color: TOURNAMENT_COLOR, needsPlayer: true, multiPlayer: true },
  { key: 'private_lesson', label: 'Private Lesson', icon: 'account', color: '#3498DB', needsPlayer: true, multiPlayer: false },
  { key: 'group_lesson', label: 'Group Lesson', icon: 'account-group', color: '#2ECC71', needsPlayer: false, multiPlayer: false },
  { key: 'other', label: 'Note', icon: 'note-text-outline', color: '#F1C40F', needsPlayer: false, multiPlayer: false },
];

const getCoachTypeColor = (type: string) => COACH_TYPES.find(t => t.key === type)?.color ?? '#F1C40F';
const getCoachTypeIcon = (type: string) => COACH_TYPES.find(t => t.key === type)?.icon ?? 'note-text-outline';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
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

const fmtDate = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function CoachScheduleScreen() {
  const [myId, setMyId] = useState<string | null>(null);
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [coachEvents, setCoachEvents] = useState<CoachEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(today.toISOString().split('T')[0]);

  const [showModal, setShowModal] = useState(false);
  const [formType, setFormType] = useState<'tournament' | 'private_lesson' | 'group_lesson' | 'other'>('private_lesson');
  const [formTitle, setFormTitle] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formPlayerIds, setFormPlayerIds] = useState<string[]>([]);

  // Club Schedule sub-tab — only shown once a coach has actually joined a
  // club (see the same gate on the Players tab). Reuses the club-admin
  // calendar screen wholesale rather than re-building the by-coach view: it
  // already resolves "me" as the default selected coach and already locks
  // editing another coach's schedule behind canEditOtherSchedules, so a
  // staff coach gets read-only visibility into everyone but edit access to
  // their own for free.
  const [myClub, setMyClub] = useState<MyClub | null>(null);
  const [myName, setMyName] = useState('');
  const [scheduleTab, setScheduleTab] = useState<'mine' | 'club'>('mine');

  useFocusEffect(useCallback(() => { load(); }, [viewMonth, viewYear]));

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }
    const me = session.user.id;
    setMyId(me);
    setMyClub(await getMyClub());
    const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', me).maybeSingle();
    setMyName(myProfile?.full_name ?? '');

    const { data: conns } = await supabase
      .from('coach_connections').select('player_id').eq('coach_id', me).eq('status', 'accepted');
    const playerIds = (conns ?? []).map((c: any) => c.player_id);

    const nameMap: Record<string, string> = {};
    if (playerIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', playerIds);
      (profs ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name ?? 'Player'; });
    }
    setRoster(playerIds.map((id: string) => ({ id, name: nameMap[id] ?? 'Player' })));

    const startDate = new Date(viewYear, viewMonth - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(viewYear, viewMonth + 2, 0).toISOString().split('T')[0];

    if (playerIds.length) {
      const { data: tourneys } = await supabase
        .from('calendar_events').select('*')
        .in('user_id', playerIds).eq('event_type', 'tournament')
        .gte('event_date', startDate).lte('event_date', endDate)
        .order('event_date', { ascending: true });
      setTournaments((tourneys ?? []).map((t: any) => ({
        id: t.id, player_id: t.user_id, playerName: firstName(nameMap[t.user_id]),
        title: t.title, event_date: t.event_date, start_time: t.start_time, location: t.location,
      })));
    } else {
      setTournaments([]);
    }

    const { data: coachEvs } = await supabase
      .from('coach_schedule_events').select('*').eq('coach_id', me)
      .gte('event_date', startDate).lte('event_date', endDate)
      .order('event_date', { ascending: true });
    setCoachEvents((coachEvs ?? []).map((e: any) => ({
      id: e.id, event_date: e.event_date, event_type: e.event_type, title: e.title, event_time: e.event_time,
      player_id: e.player_id, playerName: e.player_id ? firstName(nameMap[e.player_id]) : null,
    })));

    setLoading(false);
  };

  const openAddModal = () => {
    setFormType('private_lesson');
    setFormTitle('');
    setFormTime('');
    setFormPlayerIds(roster[0] ? [roster[0].id] : []);
    setShowModal(true);
  };

  const formNeedsPlayer = COACH_TYPES.find(t => t.key === formType)?.needsPlayer ?? false;
  const formMultiPlayer = COACH_TYPES.find(t => t.key === formType)?.multiPlayer ?? false;

  const togglePlayer = (id: string) => {
    if (formMultiPlayer) {
      setFormPlayerIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    } else {
      setFormPlayerIds([id]);
    }
  };

  const saveCoachEvent = async () => {
    if (!formTitle.trim()) { showAlert('Title required', 'Please enter a title or note.'); return; }
    if (!myId) return;
    if (formNeedsPlayer && formPlayerIds.length === 0) {
      showAlert('Pick a player', `${COACH_TYPES.find(t => t.key === formType)?.label} needs at least one player selected.`);
      return;
    }
    const playerIds = formNeedsPlayer ? formPlayerIds : [null];
    await supabase.from('coach_schedule_events').insert(playerIds.map(playerId => ({
      coach_id: myId,
      player_id: playerId,
      event_date: selectedDate,
      event_type: formType,
      title: formTitle.trim(),
      event_time: formTime.trim() || null,
    })));
    setShowModal(false);
    load();
  };

  const deleteCoachEvent = (event: CoachEvent) => {
    showConfirm('Delete event?', `Remove "${event.title}" from your schedule?`, async () => {
      await supabase.from('coach_schedule_events').delete().eq('id', event.id);
      load();
    });
  };

  const jumpToDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(dateStr);
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(today.toISOString().split('T')[0]);
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => {
    const d = new Date(year, month, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const dotsForDate = (dateStr: string) => {
    const dots: string[] = [];
    tournaments.filter(t => t.event_date === dateStr).forEach(() => dots.push(TOURNAMENT_COLOR));
    coachEvents.filter(e => e.event_date === dateStr).forEach(e => dots.push(getCoachTypeColor(e.event_type)));
    return dots.slice(0, 4);
  };

  const upcomingTournaments = tournaments
    .filter(t => t.event_date >= today.toISOString().split('T')[0])
    .sort((a, b) => a.event_date === b.event_date
      ? parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)
      : a.event_date.localeCompare(b.event_date))
    .slice(0, 5);

  const selectedTournaments = tournaments.filter(t => t.event_date === selectedDate);
  const selectedCoachEvents = coachEvents.filter(e => e.event_date === selectedDate);

  const selectedDayItems: DayItem[] = [
    ...selectedTournaments.map((t): DayItem => ({
      key: `tourney-${t.id}`, time: t.start_time, icon: 'trophy', color: TOURNAMENT_COLOR,
      title: `${t.playerName} — ${t.title}`,
      detailLines: [t.location, `From ${t.playerName}'s calendar`].filter(Boolean) as string[],
    })),
    ...selectedCoachEvents.map((e): DayItem => ({
      key: `coach-${e.id}`, time: e.event_time, icon: getCoachTypeIcon(e.event_type), color: getCoachTypeColor(e.event_type),
      title: e.title,
      detailLines: e.playerName ? [`${e.event_type === 'tournament' ? 'for' : 'with'} ${e.playerName}`] : [],
      onDelete: () => deleteCoachEvent(e),
    })),
  ].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

  const renderCalendarGrid = () => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const todayStr = today.toISOString().split('T')[0];
    const cells = [];

    for (let i = 0; i < firstDay; i++) cells.push(<View key={`empty-${i}`} style={styles.dayCell} />);

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;
      const dots = dotsForDate(dateStr);

      cells.push(
        <TouchableOpacity
          key={day}
          style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && !isSelected && styles.dayCellToday]}
          onPress={() => setSelectedDate(dateStr)}
        >
          <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected, isToday && !isSelected && styles.dayCellTextToday]}>
            {day}
          </Text>
          {dots.length > 0 && (
            <View style={styles.dotRow}>
              {dots.map((color, i) => <View key={i} style={[styles.eventDot, { backgroundColor: color }]} />)}
            </View>
          )}
        </TouchableOpacity>
      );
    }

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const rowCells = cells.slice(i, i + 7);
      while (rowCells.length < 7) rowCells.push(<View key={`pad-${i}-${rowCells.length}`} style={styles.dayCell} />);
      rows.push(<View key={`row-${i}`} style={styles.calendarRow}>{rowCells}</View>);
    }
    return rows;
  };

  if (myClub) {
    const tabRow = (
      <View style={[styles.scheduleTabRow, styles.scheduleTabRowStandalone]}>
        <TouchableOpacity style={[styles.scheduleTabBtn, scheduleTab === 'mine' && styles.scheduleTabBtnActive]} onPress={() => setScheduleTab('mine')}>
          <Text style={[styles.scheduleTabText, scheduleTab === 'mine' && styles.scheduleTabTextActive]}>{firstName(myName)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.scheduleTabBtn, scheduleTab === 'club' && styles.scheduleTabBtnActive]} onPress={() => setScheduleTab('club')}>
          <Text style={[styles.scheduleTabText, scheduleTab === 'club' && styles.scheduleTabTextActive]}>Club</Text>
        </TouchableOpacity>
      </View>
    );
    return (
      <View style={styles.container}>
        {tabRow}
        {scheduleTab === 'mine' ? <ClubCalendarScreen embedded lockToSelf /> : <ClubCalendarScreen embedded />}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <TouchableOpacity onPress={goToToday}>
          <Text style={styles.todayBtn}>Today</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : (
          <>
            {/* Upcoming tournaments */}
            {upcomingTournaments.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>UPCOMING TOURNAMENTS</Text>
                {upcomingTournaments.map(t => (
                  <TouchableOpacity key={t.id} style={styles.tourneyCard} onPress={() => jumpToDate(t.event_date)}>
                    <View style={styles.tourneyIcon}>
                      <Icon name="trophy" size={16} color={TOURNAMENT_COLOR} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tourneyName}>{t.playerName} — {t.title}</Text>
                      {t.location ? <Text style={styles.tourneyLocation}>{t.location}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.tourneyDate}>{fmtDate(t.event_date)}</Text>
                      {t.start_time ? <Text style={styles.tourneyLocation}>{formatTime12h(t.start_time)}</Text> : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.calendarCard}>
              {/* Month nav */}
              <View style={styles.monthNav}>
                <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
                  <Icon name="chevron-left" size={28} color={Theme.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
                <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
                  <Icon name="chevron-right" size={28} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={styles.dayHeaderRow}>
                {DAY_HEADERS.map(d => (
                  <View key={d} style={styles.dayHeaderCell}><Text style={styles.dayHeaderText}>{d}</Text></View>
                ))}
              </View>

              <View style={styles.calendarGrid}>{renderCalendarGrid()}</View>

              <View style={styles.calendarDivider} />

              <View style={styles.legendRow}>
                {COACH_TYPES.map(t => (
                  <View key={t.key} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: t.color }]} />
                    <Text style={styles.legendLabel}>{t.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Selected day panel */}
            <View style={styles.selectedDateCard}>
              <View style={styles.selectedDateHeader}>
                <Text style={styles.selectedDateTitle}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
                  <Icon name="plus" size={24} color={Theme.limeAccentDark} />
                </TouchableOpacity>
              </View>

              {selectedDayItems.length === 0 ? (
                <Text style={styles.noEventsText}>Nothing scheduled</Text>
              ) : (
                selectedDayItems.map(item => (
                  <View key={item.key} style={styles.eventCard}>
                    <View style={[styles.eventColorBar, { backgroundColor: item.color }]} />
                    <View style={styles.eventContent}>
                      <View style={styles.eventTopRow}>
                        <View style={styles.eventTitleRow}>
                          <Icon name={item.icon as any} size={15} color={item.color} />
                          <Text style={styles.eventTitle}>{item.title}</Text>
                        </View>
                        {item.onDelete && (
                          <TouchableOpacity onPress={item.onDelete}>
                            <Icon name="trash-can-outline" size={18} color="#FF6B6B" />
                          </TouchableOpacity>
                        )}
                      </View>
                      {item.time && (
                        <View style={styles.eventDetailRow}>
                          <Icon name="clock-outline" size={12} color={Theme.textSecondary} />
                          <Text style={styles.eventDetailText}>{formatTime12h(item.time)}</Text>
                        </View>
                      )}
                      {item.detailLines.map((line, i) => (
                        <Text key={i} style={i === item.detailLines.length - 1 && !item.onDelete ? styles.eventReadOnly : styles.eventDetailText}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add to Schedule</Text>
                <Text style={styles.modalDate}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Icon name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>Type</Text>
              <View style={styles.typePillRow}>
                {COACH_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.typePill, formType === t.key && { backgroundColor: t.color, borderColor: t.color }]}
                    onPress={() => {
                      setFormType(t.key as any);
                      // Collapse to a single selection when leaving a multi-select type.
                      if (!t.multiPlayer) setFormPlayerIds(prev => prev.slice(0, 1));
                    }}
                  >
                    <Icon name={t.icon as any} size={14} color={formType === t.key ? '#FFFFFF' : Theme.textSecondary} />
                    <Text style={[styles.typePillText, formType === t.key && styles.typePillTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {formNeedsPlayer && (
                <>
                  <Text style={styles.formLabel}>{formMultiPlayer ? 'Players' : 'Player'}</Text>
                  {roster.length === 0 ? (
                    <Text style={styles.noEventsText}>No connected players yet.</Text>
                  ) : (
                    <View style={styles.typePillRow}>
                      {roster.map(p => (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.typePill, formPlayerIds.includes(p.id) && styles.typePillActivePlayer]}
                          onPress={() => togglePlayer(p.id)}
                        >
                          <Text style={[styles.typePillText, formPlayerIds.includes(p.id) && styles.typePillTextActive]}>{p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <Text style={styles.formLabel}>{formType === 'other' ? 'Note' : 'Title'}</Text>
              <TextInput
                style={[styles.formInput, formType === 'other' && styles.formNotesInput]}
                placeholder={
                  formType === 'tournament' ? 'e.g. State Championships'
                    : formType === 'private_lesson' ? 'e.g. Footwork session'
                    : formType === 'group_lesson' ? 'e.g. Saturday group class'
                    : 'e.g. Club tournament weekend — reduce intensity'
                }
                placeholderTextColor={Theme.textSecondary}
                value={formTitle}
                onChangeText={setFormTitle}
                multiline={formType === 'other'}
                numberOfLines={formType === 'other' ? 3 : 1}
              />

              {formType !== 'other' && (
                <>
                  <Text style={styles.formLabel}>Time (optional)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 4:00 PM"
                    placeholderTextColor={Theme.textSecondary}
                    value={formTime}
                    onChangeText={setFormTime}
                  />
                </>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={saveCoachEvent}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary },
  todayBtn: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '600' },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  muted: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic' },

  // Same white-track/dark-green-active language used on the club-calendar
  // toggle (Theme.eyebrowGreen, the app's real accent) instead of a bright
  // ad hoc green.
  scheduleTabRow: {
    flexDirection: 'row', gap: 4, marginHorizontal: 24, marginBottom: 16,
    backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 4,
    borderWidth: 1, borderColor: Theme.divider,
  },
  scheduleTabRowStandalone: { marginTop: 60 },
  scheduleTabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  scheduleTabBtnActive: { backgroundColor: Theme.eyebrowGreen },
  scheduleTabText: { fontSize: 17, fontWeight: '700', color: Theme.eyebrowGreen },
  scheduleTabTextActive: { color: '#FFFFFF' },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 12 },
  tourneyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardWhite, borderRadius: 12, padding: 12, marginBottom: 8 },
  tourneyIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(231,76,60,0.12)', alignItems: 'center', justifyContent: 'center' },
  tourneyName: { fontSize: 14, fontWeight: '600', color: Theme.textPrimary },
  tourneyLocation: { fontSize: 13, color: Theme.textSecondary, marginTop: 1 },
  tourneyDate: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },

  calendarCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.divider,
    padding: 20,
    marginBottom: 16,
  },
  calendarDivider: { height: 1, backgroundColor: Theme.divider, marginVertical: 16 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  monthArrow: { padding: 4 },
  monthTitle: { fontSize: 24, fontWeight: 'bold', color: Theme.textPrimary },
  dayHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  dayHeaderCell: { flex: 1, alignItems: 'center' },
  dayHeaderText: { fontSize: 14, fontWeight: '600', color: Theme.textSecondary },
  calendarGrid: { marginBottom: 16 },
  calendarRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 10, minHeight: 58 },
  dayCellSelected: { backgroundColor: Theme.limeAccent, borderRadius: 14 },
  dayCellToday: { borderWidth: 1.5, borderColor: Theme.eyebrowGreen, borderRadius: 14 },
  dayCellText: { fontSize: 18, color: Theme.textPrimary, fontWeight: '500' },
  dayCellTextSelected: { color: Theme.limeAccentDark, fontWeight: 'bold' },
  dayCellTextToday: { color: Theme.eyebrowGreen, fontWeight: 'bold' },
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 5 },
  eventDot: { width: 6, height: 6, borderRadius: 3 },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 15, color: Theme.textSecondary },

  selectedDateCard: { backgroundColor: Theme.cardWhite, borderRadius: 18, padding: 20, marginBottom: 20 },
  selectedDateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  selectedDateTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.limeAccent, alignItems: 'center', justifyContent: 'center' },
  noEventsText: { fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
  eventCard: { flexDirection: 'row', backgroundColor: Theme.background, borderRadius: 10, overflow: 'hidden', marginBottom: 8 },
  eventColorBar: { width: 4 },
  eventContent: { flex: 1, padding: 12, gap: 3 },
  eventTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: Theme.textPrimary, flexShrink: 1 },
  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventDetailText: { fontSize: 13, color: Theme.textSecondary },
  eventReadOnly: { fontSize: 12, color: Theme.textSecondary, fontStyle: 'italic', marginTop: 2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Theme.textPrimary },
  modalDate: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  formLabel: { fontSize: 13, color: Theme.textSecondary, marginBottom: 8, fontWeight: '600', marginTop: 4 },
  formInput: { backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 14, color: Theme.textPrimary, fontSize: 15, marginBottom: 8, borderWidth: 1, borderColor: Theme.divider },
  formNotesInput: { minHeight: 80, textAlignVertical: 'top' },
  typePillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  typePillActivePlayer: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  typePillText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  typePillTextActive: { color: '#FFFFFF' },
  saveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginTop: 12, marginBottom: 24 },
  saveBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 15 },
});
