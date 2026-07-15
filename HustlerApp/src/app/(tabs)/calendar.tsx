import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { Text } from '@/components/Text';
import { useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type CalendarEvent = {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
};

const EVENT_TYPES = [
  { key: 'tournament', label: 'Tournament', icon: 'trophy', color: '#E74C3C' },
  { key: 'training', label: 'Training', icon: 'lightning-bolt', color: '#2ECC71' },
  { key: 'rest', label: 'Rest Day', icon: 'bed', color: '#3498DB' },
  { key: 'custom', label: 'Custom', icon: 'star', color: '#F1C40F' },
];

const getEventColor = (type: string) => {
  return EVENT_TYPES.find(t => t.key === type)?.color ?? '#F1C40F';
};

const getEventIcon = (type: string) => {
  return EVENT_TYPES.find(t => t.key === type)?.icon ?? 'star';
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
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

export default function CalendarScreen() {
  const params = useLocalSearchParams();
  const [user, setUser] = useState<any>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(
    today.toISOString().split('T')[0]
  );

  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState('training');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) loadEvents();
  }, [user, viewMonth, viewYear]);

  useEffect(() => {
    if (params.addDate && typeof params.addDate === 'string') {
      setSelectedDate(params.addDate);
      const d = new Date(params.addDate + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      openAddModal(params.addDate);
    }
  }, [params.addDate]);

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
  };

  const loadEvents = async () => {
    if (!user) return;

    const startDate = new Date(viewYear, viewMonth - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(viewYear, viewMonth + 2, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (data) setEvents(data as CalendarEvent[]);
  };

  const openAddModal = (date?: string) => {
    setEditingEvent(null);
    setFormTitle('');
    setFormType('training');
    setFormStartTime('');
    setFormEndTime('');
    setFormLocation('');
    setFormNotes('');
    if (date) setSelectedDate(date);
    setShowModal(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormType(event.event_type);
    setFormStartTime(event.start_time ?? '');
    setFormEndTime(event.end_time ?? '');
    setFormLocation(event.location ?? '');
    setFormNotes(event.notes ?? '');
    setSelectedDate(event.event_date);
    setShowModal(true);
  };

  const saveEvent = async () => {
    if (!formTitle.trim()) {
      showAlert('Title required', 'Please enter a title for your event.');
      return;
    }
    if (!user) return;

    const eventData = {
      user_id: user.id,
      title: formTitle.trim(),
      event_type: formType,
      event_date: selectedDate,
      start_time: formStartTime || null,
      end_time: formEndTime || null,
      location: formLocation.trim() || null,
      notes: formNotes.trim() || null,
    };

    if (editingEvent) {
      await supabase
        .from('calendar_events')
        .update(eventData)
        .eq('id', editingEvent.id);
    } else {
      await supabase
        .from('calendar_events')
        .insert(eventData);
    }

    setShowModal(false);
    loadEvents();
  };

  const deleteEvent = (event: CalendarEvent) => {
    showConfirm('Delete Event', `Delete "${event.title}"?`, async () => {
      await supabase.from('calendar_events').delete().eq('id', event.id);
      loadEvents();
    });
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

  const getFirstDayOfMonth = (year: number, month: number) => {
    const d = new Date(year, month, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(today.toISOString().split('T')[0]);
  };

  const getEventsForDate = (dateStr: string) => {
    return events.filter(e => e.event_date === dateStr);
  };

  const selectedEvents = getEventsForDate(selectedDate);

  const formatSelectedDate = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  };

  const renderCalendarGrid = () => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const todayStr = today.toISOString().split('T')[0];

    const cells = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;
      const dayEvents = getEventsForDate(dateStr);

      cells.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.dayCell,
            isSelected && styles.dayCellSelected,
            isToday && !isSelected && styles.dayCellToday,
          ]}
          onPress={() => setSelectedDate(dateStr)}
          onLongPress={() => {
            setSelectedDate(dateStr);
            openAddModal(dateStr);
          }}
        >
          <Text style={[
            styles.dayCellText,
            isSelected && styles.dayCellTextSelected,
            isToday && !isSelected && styles.dayCellTextToday,
          ]}>
            {day}
          </Text>
          {dayEvents.length > 0 && (
            <View style={styles.dotRow}>
              {dayEvents.slice(0, 3).map((e, i) => (
                <View
                  key={i}
                  style={[styles.eventDot, { backgroundColor: getEventColor(e.event_type) }]}
                />
              ))}
            </View>
          )}
        </TouchableOpacity>
      );
    }

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const rowCells = cells.slice(i, i + 7);
      while (rowCells.length < 7) {
        rowCells.push(<View key={`pad-${i}-${rowCells.length}`} style={styles.dayCell} />);
      }
      rows.push(
        <View key={`row-${i}`} style={styles.calendarRow}>
          {rowCells}
        </View>
      );
    }

    return rows;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity onPress={goToToday}>
          <Text style={styles.todayBtn}>Today</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.calendarCard}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={Theme.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
              <MaterialCommunityIcons name="chevron-right" size={28} color={Theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.dayHeaderRow}>
            {DAY_HEADERS.map(d => (
              <View key={d} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderText}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {renderCalendarGrid()}
          </View>

          <View style={styles.calendarDivider} />

          <View style={styles.legendRow}>
            {EVENT_TYPES.map(t => (
              <View key={t.key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: t.color }]} />
                <Text style={styles.legendLabel}>{t.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.selectedDateCard}>
          <View style={styles.selectedDateHeader}>
            <Text style={styles.selectedDateTitle}>{formatSelectedDate()}</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => openAddModal()}
            >
              <MaterialCommunityIcons name="plus" size={20} color={Theme.limeAccentDark} />
            </TouchableOpacity>
          </View>

          {selectedEvents.length === 0 ? (
            <View style={styles.noEventsWrap}>
              <Text style={styles.noEventsText}>No events planned</Text>
              <TouchableOpacity onPress={() => openAddModal()}>
                <Text style={styles.addEventLink}>+ Add an event</Text>
              </TouchableOpacity>
            </View>
          ) : (
            selectedEvents.map((event) => (
              <View key={event.id} style={styles.eventCard}>
                <View style={[styles.eventColorBar, { backgroundColor: getEventColor(event.event_type) }]} />
                <View style={styles.eventContent}>
                  <View style={styles.eventTopRow}>
                    <View style={styles.eventTitleRow}>
                      <MaterialCommunityIcons
                        name={getEventIcon(event.event_type) as any}
                        size={16}
                        color={getEventColor(event.event_type)}
                      />
                      <Text style={styles.eventTitle}>{event.title}</Text>
                    </View>
                    <View style={styles.eventActions}>
                      <TouchableOpacity onPress={() => openEditModal(event)}>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={Theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteEvent(event)}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {event.start_time && (
                    <View style={styles.eventDetailRow}>
                      <MaterialCommunityIcons name="clock-outline" size={13} color={Theme.textSecondary} />
                      <Text style={styles.eventDetailText}>
                        {event.start_time}{event.end_time ? ` — ${event.end_time}` : ''}
                      </Text>
                    </View>
                  )}
                  {event.location && (
                    <View style={styles.eventDetailRow}>
                      <MaterialCommunityIcons name="map-marker-outline" size={13} color={Theme.textSecondary} />
                      <Text style={styles.eventDetailText}>{event.location}</Text>
                    </View>
                  )}
                  {event.notes && (
                    <Text style={styles.eventNotes}>{event.notes}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {editingEvent ? 'Edit Event' : 'Add Event'}
                </Text>
                <Text style={styles.modalDate}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>Title *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Leg Day, Tournament"
                placeholderTextColor={Theme.textSecondary}
                value={formTitle}
                onChangeText={setFormTitle}
              />

              <Text style={styles.formLabel}>Type</Text>
              <View style={styles.typePillRow}>
                {EVENT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.typePill,
                      formType === t.key && { backgroundColor: t.color, borderColor: t.color },
                    ]}
                    onPress={() => setFormType(t.key)}
                  >
                    <MaterialCommunityIcons
                      name={t.icon as any}
                      size={14}
                      color={formType === t.key ? '#FFFFFF' : Theme.textSecondary}
                    />
                    <Text style={[
                      styles.typePillText,
                      formType === t.key && styles.typePillTextActive,
                    ]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Time (optional)</Text>
              <View style={styles.timeRow}>
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  placeholder="Start (e.g. 9:00 AM)"
                  placeholderTextColor={Theme.textSecondary}
                  value={formStartTime}
                  onChangeText={setFormStartTime}
                />
                <Text style={styles.timeDash}>—</Text>
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  placeholder="End (e.g. 11:00 AM)"
                  placeholderTextColor={Theme.textSecondary}
                  value={formEndTime}
                  onChangeText={setFormEndTime}
                />
              </View>

              <Text style={styles.formLabel}>Location (optional)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Community Center"
                placeholderTextColor={Theme.textSecondary}
                value={formLocation}
                onChangeText={setFormLocation}
              />

              <Text style={styles.formLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.formInput, styles.formNotesInput]}
                placeholder="Any details to remember..."
                placeholderTextColor={Theme.textSecondary}
                value={formNotes}
                onChangeText={setFormNotes}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity style={styles.saveBtn} onPress={saveEvent}>
                <Text style={styles.saveBtnText}>
                  {editingEvent ? 'Save Changes' : 'Add Event'}
                </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary },
  todayBtn: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '600' },
  scroll: { paddingHorizontal: 24, paddingBottom: 120 },
  calendarCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.divider,
    padding: 20,
    marginBottom: 16,
  },
  calendarDivider: {
    height: 1,
    backgroundColor: Theme.divider,
    marginVertical: 16,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  monthArrow: { padding: 4 },
  monthTitle: { fontSize: 24, fontWeight: 'bold', color: Theme.textPrimary },
  dayHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  dayHeaderCell: { flex: 1, alignItems: 'center' },
  dayHeaderText: { fontSize: 14, fontWeight: '600', color: Theme.textSecondary },
  calendarGrid: { marginBottom: 16 },
  calendarRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: 58,
  },
  dayCellSelected: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 14,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: Theme.eyebrowGreen,
    borderRadius: 14,
  },
  dayCellText: { fontSize: 18, color: Theme.textPrimary, fontWeight: '500' },
  dayCellTextSelected: { color: Theme.limeAccentDark, fontWeight: 'bold' },
  dayCellTextToday: { color: Theme.eyebrowGreen, fontWeight: 'bold' },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 5,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 13, color: Theme.textSecondary },
  selectedDateCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  selectedDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  selectedDateTitle: { fontSize: 16, fontWeight: 'bold', color: Theme.textPrimary },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.limeAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noEventsWrap: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  noEventsText: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic' },
  addEventLink: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  eventCard: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: Theme.background,
    overflow: 'hidden',
  },
  eventColorBar: { width: 4 },
  eventContent: { flex: 1, padding: 12 },
  eventTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  eventActions: { flexDirection: 'row', gap: 12 },
  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  eventDetailText: { fontSize: 13, color: Theme.textSecondary },
  eventNotes: { fontSize: 13, color: Theme.textSecondary, marginTop: 6, fontStyle: 'italic' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Theme.textPrimary },
  modalDate: { fontSize: 13, color: Theme.eyebrowGreen, marginTop: 2 },
  formLabel: { fontSize: 13, color: Theme.textSecondary, marginBottom: 6, marginTop: 12 },
  formInput: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    padding: 14,
    color: Theme.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  formNotesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeDash: { color: Theme.textSecondary, fontSize: 16 },
  typePillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  typePillText: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary },
  typePillTextActive: { color: '#FFFFFF' },
  saveBtn: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  saveBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 16 },
});
