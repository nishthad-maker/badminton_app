import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

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

  useFocusEffect(useCallback(() => { load(); }, [viewMonth, viewYear]));

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }
    const me = session.user.id;
    setMyId(me);

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
        id: t.id, player_id: t.user_id, playerName: nameMap[t.user_id] ?? 'Player',
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
      player_id: e.player_id, playerName: e.player_id ? (nameMap[e.player_id] ?? 'Player') : null,
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

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
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
                      <MaterialCommunityIcons name="trophy" size={16} color={TOURNAMENT_COLOR} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tourneyName}>{t.playerName} — {t.title}</Text>
                      {t.location ? <Text style={styles.tourneyLocation}>{t.location}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.tourneyDate}>{fmtDate(t.event_date)}</Text>
                      {t.start_time ? <Text style={styles.tourneyLocation}>{t.start_time}</Text> : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Month nav */}
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
                <MaterialCommunityIcons name="chevron-left" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
              <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
                <MaterialCommunityIcons name="chevron-right" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.dayHeaderRow}>
              {DAY_HEADERS.map(d => (
                <View key={d} style={styles.dayHeaderCell}><Text style={styles.dayHeaderText}>{d}</Text></View>
              ))}
            </View>

            <View style={styles.calendarGrid}>{renderCalendarGrid()}</View>

            <View style={styles.legendRow}>
              {COACH_TYPES.map(t => (
                <View key={t.key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: t.color }]} />
                  <Text style={styles.legendLabel}>{t.label}</Text>
                </View>
              ))}
            </View>

            {/* Selected day panel */}
            <View style={styles.selectedDateCard}>
              <View style={styles.selectedDateHeader}>
                <Text style={styles.selectedDateTitle}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
                  <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
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
                          <MaterialCommunityIcons name={item.icon as any} size={15} color={item.color} />
                          <Text style={styles.eventTitle}>{item.title}</Text>
                        </View>
                        {item.onDelete && (
                          <TouchableOpacity onPress={item.onDelete}>
                            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF6B6B" />
                          </TouchableOpacity>
                        )}
                      </View>
                      {item.time && (
                        <View style={styles.eventDetailRow}>
                          <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.textSecondary} />
                          <Text style={styles.eventDetailText}>{item.time}</Text>
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
                <MaterialCommunityIcons name="close" size={24} color={Colors.textPrimary} />
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
                    <MaterialCommunityIcons name={t.icon as any} size={14} color={formType === t.key ? '#FFFFFF' : Colors.textSecondary} />
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
                placeholderTextColor={Colors.textSecondary}
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
                    placeholderTextColor={Colors.textSecondary}
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  muted: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1, marginBottom: 12 },
  tourneyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, marginBottom: 8 },
  tourneyIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(231,76,60,0.12)', alignItems: 'center', justifyContent: 'center' },
  tourneyName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  tourneyLocation: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  tourneyDate: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },

  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  monthArrow: { padding: 4 },
  monthTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
  dayHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  dayHeaderCell: { flex: 1, alignItems: 'center' },
  dayHeaderText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  calendarGrid: { marginBottom: 16 },
  calendarRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 8, minHeight: 48 },
  dayCellSelected: { backgroundColor: Colors.accent, borderRadius: 12 },
  dayCellToday: { borderWidth: 1.5, borderColor: Colors.accent, borderRadius: 12 },
  dayCellText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  dayCellTextSelected: { color: '#FFFFFF', fontWeight: 'bold' },
  dayCellTextToday: { color: Colors.accent, fontWeight: 'bold' },
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 4 },
  eventDot: { width: 5, height: 5, borderRadius: 2.5 },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: Colors.textSecondary },

  selectedDateCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 20 },
  selectedDateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  selectedDateTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  noEventsText: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
  eventCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 },
  eventColorBar: { width: 4 },
  eventContent: { flex: 1, padding: 12, gap: 3 },
  eventTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  eventTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventDetailText: { fontSize: 11, color: Colors.textSecondary },
  eventReadOnly: { fontSize: 10, color: Colors.textSecondary, fontStyle: 'italic', marginTop: 2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.backgroundBottom, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
  modalDate: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  formLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8, fontWeight: '600', marginTop: 4 },
  formInput: { backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 14, color: Colors.textPrimary, fontSize: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  formNotesInput: { minHeight: 80, textAlignVertical: 'top' },
  typePillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  typePillActivePlayer: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  typePillText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  typePillTextActive: { color: '#FFFFFF' },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginTop: 12, marginBottom: 24 },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});
