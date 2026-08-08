import { View, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import { Icon } from '@/components/icons/Icon';
import { MiniDatePicker } from '@/components/MiniDatePicker';
import { TimePicker } from '@/components/TimePicker';
import { CoachDayGrid, CoachDayBlock } from '@/components/CoachDayGrid';
import { WeeklyGrid, GridBlock } from '@/components/WeeklyGrid';
import { LocalBottomTabBar } from '@/components/LocalBottomTabBar';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Theme, Fonts, CategoryTheme } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/ui';
import { getMyClub, getClubHours } from '../../lib/club';
import { getClubCourts, Court } from '../../lib/courts';
import { getGroupLessons, GroupLesson } from '../../lib/lessons';
import { getClubMaintenanceBlocksForDate, MaintenanceBlock } from '../../lib/maintenanceBlocks';
import {
  getRentalsForDate, createOneDayRental, createBulkRental, setRentalPaid, cancelRental, updateRentalTime, endRentalSeries, CourtRental,
} from '../../lib/rentals';
import { DAY_NAMES, formatTime12h, formatDateLong, timeToMinutes, firstName, localDateStr } from '../../lib/scheduling';
import { NoClubPrompt } from '@/components/NoClubPrompt';
import { SetupLockedPlaceholder } from '@/components/SetupLockedPlaceholder';

const todayStr = () => localDateStr(new Date());

// Same fixed palette as Training's calendar (club-calendar.tsx) — a
// booking's TYPE reads the same color on both screens.
const PRIVATE_BLOCK_COLOR = CategoryTheme.strength;
const GROUP_BLOCK_COLOR = CategoryTheme.endurance;
const OPEN_BLOCK_COLOR = CategoryTheme.recovery;
const MAINTENANCE_BLOCK_COLOR = { bg: '#E4E1DC', fg: '#5C594F' };
const RENTAL_BLOCK_COLOR = { bg: '#E6D9F5', fg: '#6B3FA0' };

const DEFAULT_DAY_WINDOW_START_MIN = 8 * 60;
const DEFAULT_DAY_WINDOW_END_MIN = 20 * 60;
const MIN_OPEN_GAP_MINUTES = 30;

const startOfWeek = (d: Date) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
};
const minutesToTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

type PrivateLessonEntry = { id: string; player_name: string; coach_name: string; day_of_week: number; start_time: string; end_time: string; court_id: string | null };

export default function RentalScreen() {
  const [hasClub, setHasClub] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [courts, setCourts] = useState<Court[]>([]);
  const [privateLessons, setPrivateLessons] = useState<PrivateLessonEntry[]>([]);
  const [groupLessons, setGroupLessons] = useState<GroupLesson[]>([]);
  const [dayWindowStart, setDayWindowStart] = useState(DEFAULT_DAY_WINDOW_START_MIN);
  const [dayWindowEnd, setDayWindowEnd] = useState(DEFAULT_DAY_WINDOW_END_MIN);

  const [viewMode, setViewMode] = useState<'court' | 'week'>('court');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [dayRentals, setDayRentals] = useState<CourtRental[]>([]);
  const [dayMaintenanceBlocks, setDayMaintenanceBlocks] = useState<MaintenanceBlock[]>([]);

  // Week mode needs rentals/maintenance for all 7 dates of the visible week
  // (private/group lessons are already a day-of-week pattern, club-wide —
  // rentals/maintenance are literal-date rows, so they're fetched per date).
  const [weekRentals, setWeekRentals] = useState<(CourtRental & { dayOfWeek: number })[]>([]);
  const [weekMaintenance, setWeekMaintenance] = useState<(MaintenanceBlock & { dayOfWeek: number })[]>([]);

  const load = useCallback(async () => {
    const club = await getMyClub();
    if (!club) { setHasClub(false); setLoading(false); return; }
    setHasClub(true);
    setClubId(club.clubId);
    setOnboardingCompleted(club.onboardingCompleted);
    if (!club.onboardingCompleted) { setLoading(false); return; }

    const clubCourts = await getClubCourts(club.clubId);
    setCourts(clubCourts);
    setSelectedCourtId((prev) => prev ?? clubCourts[0]?.id ?? null);

    setGroupLessons(await getGroupLessons(club.clubId));

    const hours = await getClubHours(club.clubId);
    setDayWindowStart(hours.openTime ? timeToMinutes(hours.openTime) : DEFAULT_DAY_WINDOW_START_MIN);
    setDayWindowEnd(hours.closeTime ? timeToMinutes(hours.closeTime) : DEFAULT_DAY_WINDOW_END_MIN);

    const { data: lessonRows } = await supabase
      .from('schedule_assignments')
      .select('id, day_of_week, start_time, end_time, court_id, profiles!schedule_assignments_player_id_fkey(full_name), coach:profiles!schedule_assignments_coach_id_fkey(full_name)')
      .eq('club_id', club.clubId);
    setPrivateLessons((lessonRows ?? []).map((l: any) => ({
      id: l.id, player_name: l.profiles?.full_name ?? 'Player', coach_name: l.coach?.full_name ?? 'Coach',
      day_of_week: l.day_of_week, start_time: l.start_time, end_time: l.end_time, court_id: l.court_id,
    })));

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!clubId || viewMode !== 'court') return;
    const dateStr = localDateStr(selectedDate);
    getRentalsForDate(clubId, dateStr).then(setDayRentals);
    getClubMaintenanceBlocksForDate(clubId, dateStr).then(setDayMaintenanceBlocks);
  }, [clubId, selectedDate, viewMode]);

  useEffect(() => {
    if (!clubId || viewMode !== 'week') return;
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek(selectedDate));
      d.setDate(d.getDate() + i);
      return d;
    });
    Promise.all(weekDays.map((d) => {
      const dateStr = localDateStr(d);
      return Promise.all([getRentalsForDate(clubId, dateStr), getClubMaintenanceBlocksForDate(clubId, dateStr)]);
    })).then((results) => {
      setWeekRentals(results.flatMap(([rentals], i) => rentals.map((r) => ({ ...r, dayOfWeek: weekDays[i].getDay() }))));
      setWeekMaintenance(results.flatMap(([, maint], i) => maint.map((m) => ({ ...m, dayOfWeek: weekDays[i].getDay() }))));
    });
  }, [clubId, selectedDate, viewMode]);

  const selectedDayOfWeek = selectedDate.getDay();

  // ── Courts mode: one court, one day, as a timeline ──

  type CourtBooking = {
    id: string; courtId: string; startMin: number; endMin: number; kind: 'private' | 'group' | 'maintenance' | 'rental';
    title: string; sublabel: string; color: { bg: string; fg: string }; onPress: () => void; rental?: CourtRental;
  };

  const courtBookings: CourtBooking[] = [
    ...privateLessons.filter((l) => l.day_of_week === selectedDayOfWeek && l.court_id).map((l) => ({
      id: l.id, courtId: l.court_id as string, startMin: timeToMinutes(l.start_time), endMin: timeToMinutes(l.end_time),
      kind: 'private' as const, title: firstName(l.player_name), sublabel: l.coach_name, color: PRIVATE_BLOCK_COLOR,
      onPress: () => showAlert(firstName(l.player_name), `Private with ${l.coach_name}\n${formatTime12h(l.start_time)}–${formatTime12h(l.end_time)}`),
    })),
    ...groupLessons.flatMap((lesson) =>
      lesson.slots.filter((s) => s.day_of_week === selectedDayOfWeek).flatMap((s) =>
        s.court_ids.map((courtId) => ({
          id: `tier::${lesson.id}::${s.id}::${courtId}`, courtId, startMin: timeToMinutes(s.start_time), endMin: timeToMinutes(s.end_time),
          kind: 'group' as const, title: lesson.name, sublabel: `${lesson.roster_count} player${lesson.roster_count === 1 ? '' : 's'}`, color: GROUP_BLOCK_COLOR,
          onPress: () => showAlert(lesson.name, `${lesson.roster_count} player${lesson.roster_count === 1 ? '' : 's'}\n${formatTime12h(s.start_time)}–${formatTime12h(s.end_time)}`),
        }))
      )
    ),
    ...dayMaintenanceBlocks.map((b) => ({
      id: `maint::${b.id}`, courtId: b.courtId, startMin: timeToMinutes(b.startTime), endMin: timeToMinutes(b.endTime),
      kind: 'maintenance' as const, title: b.reason ?? 'Maintenance', sublabel: 'Closed', color: MAINTENANCE_BLOCK_COLOR,
      onPress: () => showAlert(b.reason ?? 'Maintenance', `${formatTime12h(b.startTime)}–${formatTime12h(b.endTime)}`),
    })),
    ...dayRentals.map((r) => ({
      id: `rental::${r.id}`, courtId: r.courtId, startMin: timeToMinutes(r.startTime), endMin: timeToMinutes(r.endTime),
      kind: 'rental' as const, title: r.renterName, sublabel: r.isPaid ? 'Paid' : 'Unpaid', color: RENTAL_BLOCK_COLOR,
      onPress: () => openManageRental(r), rental: r,
    })),
  ];

  type CourtGridBlock = CoachDayBlock & { onPressOverride: () => void };

  const selectedCourt = courts.find((c) => c.id === selectedCourtId) ?? null;
  const courtColumns = selectedCourt ? [{ id: selectedCourt.id, name: selectedCourt.name }] : [];

  const courtDayBlocks: CourtGridBlock[] = [];
  if (selectedCourtId) {
    const bookings = courtBookings.filter((b) => b.courtId === selectedCourtId).sort((a, b) => a.startMin - b.startMin);
    let cursor = dayWindowStart;

    const pushOpenBlock = (start: number, end: number) => {
      if (end - start < MIN_OPEN_GAP_MINUTES) return;
      courtDayBlocks.push({
        id: `open::${start}`, coachIds: [selectedCourtId as string], startTime: minutesToTime(start), endTime: minutesToTime(end),
        label: 'Open', footerLabel: 'Book', color: OPEN_BLOCK_COLOR,
        onPressOverride: () => openBookingWizard({ date: localDateStr(selectedDate), start: minutesToTime(start), end: minutesToTime(end), preferredCourtId: selectedCourtId }),
      });
    };

    bookings.forEach((b) => {
      if (b.startMin > cursor) pushOpenBlock(cursor, b.startMin);
      courtDayBlocks.push({
        id: b.id, coachIds: [selectedCourtId as string], startTime: minutesToTime(b.startMin), endTime: minutesToTime(b.endMin),
        label: b.title, sublabel: b.sublabel, color: b.color, onPressOverride: b.onPress,
      });
      cursor = Math.max(cursor, b.endMin);
    });
    pushOpenBlock(cursor, dayWindowEnd);
  }

  // ── Week mode: all courts, one week ──

  const weekGridBlocks: GridBlock[] = [
    ...privateLessons.filter((l) => l.court_id).map((l) => ({
      id: l.id, dayOfWeek: l.day_of_week, startTime: l.start_time, endTime: l.end_time,
      label: firstName(l.player_name), sublabel: courts.find((c) => c.id === l.court_id)?.name ?? '', color: PRIVATE_BLOCK_COLOR,
    })),
    ...groupLessons.flatMap((lesson) =>
      lesson.slots.flatMap((s) =>
        s.court_ids.map((courtId) => ({
          id: `tier::${lesson.id}::${s.id}::${courtId}`, dayOfWeek: s.day_of_week, startTime: s.start_time, endTime: s.end_time,
          label: lesson.name, sublabel: courts.find((c) => c.id === courtId)?.name ?? '', color: GROUP_BLOCK_COLOR,
        }))
      )
    ),
    ...weekRentals.map((r) => ({
      id: `rental::${r.id}`, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime,
      label: r.renterName, sublabel: courts.find((c) => c.id === r.courtId)?.name ?? '', color: RENTAL_BLOCK_COLOR,
    })),
    ...weekMaintenance.map((m) => ({
      id: `maint::${m.id}`, dayOfWeek: m.dayOfWeek, startTime: m.startTime, endTime: m.endTime,
      label: m.reason ?? 'Maintenance', sublabel: courts.find((c) => c.id === m.courtId)?.name ?? '', color: MAINTENANCE_BLOCK_COLOR,
    })),
  ];

  const handleWeekBlockPress = (block: GridBlock) => {
    if (block.id.startsWith('rental::')) {
      const rental = weekRentals.find((r) => `rental::${r.id}` === block.id);
      if (rental) openManageRental(rental);
      return;
    }
    showAlert(block.label, `${block.sublabel ?? ''}\n${formatTime12h(block.startTime)}–${formatTime12h(block.endTime)}`);
  };

  // ── Booking wizard ──

  const [bookOpen, setBookOpen] = useState(false);
  const [bookKind, setBookKind] = useState<'oneday' | 'bulk'>('oneday');
  const [bookDate, setBookDate] = useState(todayStr());
  const [bookStart, setBookStart] = useState('09:00');
  const [bookEnd, setBookEnd] = useState('10:00');
  const [bookDays, setBookDays] = useState<number[]>([]);
  const [bookEndDate, setBookEndDate] = useState<string | null>(null);
  const [courtsNeeded, setCourtsNeeded] = useState('1');
  const [preferredCourtIds, setPreferredCourtIds] = useState<string[]>([]);
  const [renterName, setRenterName] = useState('');
  const [renterEmail, setRenterEmail] = useState('');
  const [renterPhone, setRenterPhone] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [bookSaving, setBookSaving] = useState(false);

  const openBookingWizard = (prefill?: { date: string; start: string; end: string; preferredCourtId: string }) => {
    setBookKind('oneday');
    setBookDate(prefill?.date ?? localDateStr(selectedDate));
    setBookStart(prefill?.start ?? '09:00');
    setBookEnd(prefill?.end ?? '10:00');
    setBookDays([]);
    setBookEndDate(null);
    setCourtsNeeded('1');
    setPreferredCourtIds(prefill?.preferredCourtId ? [prefill.preferredCourtId] : []);
    setRenterName('');
    setRenterEmail('');
    setRenterPhone('');
    setIsPaid(false);
    setBookOpen(true);
  };
  const closeBookingWizard = () => setBookOpen(false);

  const toggleBookDay = (d: number) => setBookDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const togglePreferredCourt = (id: string) => setPreferredCourtIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submitBooking = async () => {
    if (!clubId) return;
    const n = parseInt(courtsNeeded, 10);
    if (!Number.isFinite(n) || n <= 0) { showAlert('Invalid', 'Enter how many courts to book.'); return; }
    setBookSaving(true);
    const renter = { name: renterName, email: renterEmail, phone: renterPhone || null, isPaid };
    const res = bookKind === 'oneday'
      ? await createOneDayRental({ clubId, date: bookDate, startTime: bookStart, endTime: bookEnd, courtsNeeded: n, preferredCourtIds, renter })
      : await createBulkRental({ clubId, daysOfWeek: bookDays, startTime: bookStart, endTime: bookEnd, endDate: bookEndDate, courtsNeeded: n, preferredCourtIds, renter });
    setBookSaving(false);
    if (!res.ok) { showAlert('Could not book that', res.message ?? 'Try different courts, days, or times.'); return; }
    closeBookingWizard();
    load();
    if (clubId) {
      getRentalsForDate(clubId, localDateStr(selectedDate)).then(setDayRentals);
    }
  };

  // ── Manage rental modal ──

  const [manageRental, setManageRental] = useState<CourtRental | null>(null);
  const [manageEditing, setManageEditing] = useState(false);
  const [manageStart, setManageStart] = useState('09:00');
  const [manageEnd, setManageEnd] = useState('10:00');
  const [manageSaving, setManageSaving] = useState(false);

  const openManageRental = (r: CourtRental) => {
    setManageRental(r);
    setManageEditing(false);
    setManageStart(r.startTime.slice(0, 5));
    setManageEnd(r.endTime.slice(0, 5));
  };
  const closeManageRental = () => { setManageRental(null); setManageEditing(false); };

  const refreshAfterManage = () => {
    if (clubId) getRentalsForDate(clubId, localDateStr(selectedDate)).then(setDayRentals);
  };

  const toggleManagePaid = async () => {
    if (!manageRental) return;
    const next = !manageRental.isPaid;
    await setRentalPaid(manageRental.rentalGroupId ?? manageRental.id, next, !!manageRental.rentalGroupId);
    setManageRental({ ...manageRental, isPaid: next });
    refreshAfterManage();
  };

  const submitManageEdit = async () => {
    if (!manageRental) return;
    setManageSaving(true);
    const res = await updateRentalTime(manageRental.id, manageStart, manageEnd);
    setManageSaving(false);
    if (!res.ok) { showAlert('Error', res.message ?? 'Could not update that booking.'); return; }
    closeManageRental();
    refreshAfterManage();
  };

  const cancelSingleRental = () => {
    if (!manageRental) return;
    showConfirm('Cancel this booking?', `Cancel ${manageRental.renterName}'s booking on ${formatDateLong(manageRental.date)}?`, async () => {
      await cancelRental(manageRental.id);
      closeManageRental();
      refreshAfterManage();
    }, 'Cancel Booking');
  };

  const endSeries = () => {
    if (!manageRental?.rentalGroupId) return;
    const groupId = manageRental.rentalGroupId;
    showConfirm('End this booking?', `Stop every future court/date in ${manageRental.renterName}'s booking? Past dates stay on record.`, async () => {
      await endRentalSeries(groupId);
      closeManageRental();
      refreshAfterManage();
    }, 'End Booking');
  };

  if (!loading && !hasClub) {
    return (
      <View style={styles.container}>
        <NoClubPrompt />
      </View>
    );
  }
  if (!loading && !onboardingCompleted) {
    return (
      <View style={styles.container}>
        <SetupLockedPlaceholder />
      </View>
    );
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek(selectedDate));
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rental</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => openBookingWizard()}>
          <Icon name="plus-circle-outline" size={30} color={Theme.limeAccentDark} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
              {weekDays.map((d) => {
                const isSelected = d.toDateString() === selectedDate.toDateString();
                return (
                  <TouchableOpacity key={d.toISOString()} style={[styles.dayStripCell, isSelected && styles.dayStripCellActive]} onPress={() => setSelectedDate(d)}>
                    <Text style={[styles.dayStripDayName, isSelected && styles.dayStripDayNameActive]} maxFontSizeMultiplier={1.2}>{DAY_NAMES[d.getDay()].slice(0, 3)}</Text>
                    <Text style={[styles.dayStripDate, isSelected && styles.dayStripDateActive]} maxFontSizeMultiplier={1.2}>{d.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {viewMode === 'court' ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
                  {courts.map((c) => (
                    <TouchableOpacity key={c.id} style={[styles.pill, selectedCourtId === c.id && styles.pillActive]} onPress={() => setSelectedCourtId(c.id)}>
                      <Text style={[styles.pillText, selectedCourtId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {courts.length === 0 ? (
                  <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No courts set up yet.</Text>
                ) : (
                  <CoachDayGrid coaches={courtColumns} blocks={courtDayBlocks} onPressBlock={(b) => (b as CourtGridBlock).onPressOverride()} hourHeight={56} columnWidth={260} />
                )}
              </>
            ) : (
              <>
                <View style={styles.weekLegendRow}>
                  <View style={styles.weekLegendItem}><View style={[styles.weekLegendSwatch, { backgroundColor: PRIVATE_BLOCK_COLOR.bg }]} /><Text style={styles.weekLegendText}>Private</Text></View>
                  <View style={styles.weekLegendItem}><View style={[styles.weekLegendSwatch, { backgroundColor: GROUP_BLOCK_COLOR.bg }]} /><Text style={styles.weekLegendText}>Group</Text></View>
                  <View style={styles.weekLegendItem}><View style={[styles.weekLegendSwatch, { backgroundColor: RENTAL_BLOCK_COLOR.bg }]} /><Text style={styles.weekLegendText}>Rental</Text></View>
                  <View style={styles.weekLegendItem}><View style={[styles.weekLegendSwatch, { backgroundColor: MAINTENANCE_BLOCK_COLOR.bg }]} /><Text style={styles.weekLegendText}>Maintenance</Text></View>
                </View>
                <WeeklyGrid blocks={weekGridBlocks} onPressBlock={handleWeekBlockPress} hourHeight={48} />
              </>
            )}
          </>
        )}
      </ScrollView>

      <LocalBottomTabBar
        items={[
          { key: 'court', label: 'Courts', icon: 'racquet-outline' },
          { key: 'week', label: 'Week', icon: 'calendar-week' },
        ]}
        active={viewMode}
        onChange={(k) => setViewMode(k as 'court' | 'week')}
      />

      {/* Booking wizard */}
      <Modal visible={bookOpen} transparent animationType="fade" onRequestClose={closeBookingWizard}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book Courts</Text>
              <TouchableOpacity onPress={closeBookingWizard}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.segmentRow}>
                <TouchableOpacity style={[styles.segment, bookKind === 'oneday' && styles.segmentActive]} onPress={() => setBookKind('oneday')}>
                  <Text style={[styles.segmentPillText, bookKind === 'oneday' && styles.segmentPillTextActive]} maxFontSizeMultiplier={1.3}>One Day</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segment, bookKind === 'bulk' && styles.segmentActive]} onPress={() => setBookKind('bulk')}>
                  <Text style={[styles.segmentPillText, bookKind === 'bulk' && styles.segmentPillTextActive]} maxFontSizeMultiplier={1.3}>Bulk (Recurring)</Text>
                </TouchableOpacity>
              </View>

              {bookKind === 'oneday' ? (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Date</Text>
                  <MiniDatePicker value={bookDate} onChange={setBookDate} minDate={todayStr()} />
                </>
              ) : (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Which days of the week?</Text>
                  <View style={styles.pillWrapRow}>
                    {DAY_NAMES.map((d, i) => (
                      <TouchableOpacity key={d} style={[styles.pill, bookDays.includes(i) && styles.pillActive]} onPress={() => toggleBookDay(i)}>
                        <Text style={[styles.pillText, bookDays.includes(i) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End date (optional — defaults to 12 weeks out)</Text>
                  <MiniDatePicker value={bookEndDate} onChange={setBookEndDate} minDate={todayStr()} />
                </>
              )}

              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
              <TimePicker value={bookStart} onChange={setBookStart} />
              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
              <TimePicker value={bookEnd} onChange={setBookEnd} />

              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>How many courts?</Text>
              <TextInput style={styles.formInput} value={courtsNeeded} onChangeText={setCourtsNeeded} keyboardType="number-pad" maxLength={2} />

              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Preferred courts (optional — leave blank to auto-pick adjacent free courts)</Text>
              <View style={styles.pillWrapRow}>
                {courts.map((c) => (
                  <TouchableOpacity key={c.id} style={[styles.pill, preferredCourtIds.includes(c.id) && styles.pillActive]} onPress={() => togglePreferredCourt(c.id)}>
                    <Text style={[styles.pillText, preferredCourtIds.includes(c.id) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Renter's name</Text>
              <TextInput style={styles.formInput} value={renterName} onChangeText={setRenterName} placeholder="Name" placeholderTextColor={Theme.textSecondary} />
              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Renter's email</Text>
              <TextInput style={styles.formInput} value={renterEmail} onChangeText={setRenterEmail} placeholder="Email" placeholderTextColor={Theme.textSecondary} keyboardType="email-address" autoCapitalize="none" />
              <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Phone (optional)</Text>
              <TextInput style={styles.formInput} value={renterPhone} onChangeText={setRenterPhone} placeholder="Phone number" placeholderTextColor={Theme.textSecondary} keyboardType="phone-pad" />

              <TouchableOpacity style={styles.paidRow} onPress={() => setIsPaid((v) => !v)}>
                <Icon name={isPaid ? 'check-circle' : 'check-circle-outline'} size={22} color={isPaid ? Theme.eyebrowGreen : Theme.textMuted} />
                <Text style={styles.paidRowText} maxFontSizeMultiplier={1.3}>Paid</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.saveBtn, bookSaving && styles.saveBtnDisabled]} onPress={submitBooking} disabled={bookSaving}>
                <Text style={styles.saveBtnText}>{bookSaving ? 'Booking...' : 'Book'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Manage rental modal */}
      <Modal visible={!!manageRental} transparent animationType="fade" onRequestClose={closeManageRental}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{manageRental?.renterName}</Text>
              <TouchableOpacity onPress={closeManageRental}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {!manageEditing ? (
                <>
                  <Text style={styles.hint} maxFontSizeMultiplier={1.3}>
                    {manageRental && `${formatDateLong(manageRental.date)} · ${formatTime12h(manageRental.startTime)}–${formatTime12h(manageRental.endTime)}\n${manageRental.renterEmail}${manageRental.renterPhone ? `\n${manageRental.renterPhone}` : ''}`}
                  </Text>
                  <TouchableOpacity style={styles.paidRow} onPress={toggleManagePaid}>
                    <Icon name={manageRental?.isPaid ? 'check-circle' : 'check-circle-outline'} size={22} color={manageRental?.isPaid ? Theme.eyebrowGreen : Theme.textMuted} />
                    <Text style={styles.paidRowText} maxFontSizeMultiplier={1.3}>{manageRental?.isPaid ? 'Paid' : 'Mark as paid'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={() => setManageEditing(true)}>
                    <Text style={styles.saveBtnText}>Edit Time</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, styles.saveBtnSecondary]} onPress={cancelSingleRental}>
                    <Text style={[styles.saveBtnText, { color: Theme.eyebrowGreen }]}>Cancel This Booking</Text>
                  </TouchableOpacity>
                  {manageRental?.rentalGroupId && (
                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: 'rgba(231,76,60,0.12)' }]} onPress={endSeries}>
                      <Text style={[styles.saveBtnText, { color: '#E74C3C' }]}>End Entire Booking</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>Start</Text>
                  <TimePicker value={manageStart} onChange={setManageStart} />
                  <Text style={styles.formLabel} maxFontSizeMultiplier={1.3}>End</Text>
                  <TimePicker value={manageEnd} onChange={setManageEnd} />
                  <View style={styles.wizardNavRow}>
                    <TouchableOpacity style={styles.navBackBtn} onPress={() => setManageEditing(false)}>
                      <Text style={styles.navBackText} maxFontSizeMultiplier={1.3}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, { flex: 1, marginTop: 0 }, manageSaving && styles.saveBtnDisabled]} onPress={submitManageEdit} disabled={manageSaving}>
                      <Text style={styles.saveBtnText}>{manageSaving ? 'Saving...' : 'Save'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 60, paddingRight: 24, paddingTop: 60, paddingBottom: 12 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary },
  addBtn: { padding: 4 },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginTop: 20 },
  emptyText: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginBottom: 8 },
  hint: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, lineHeight: 20, marginBottom: 14 },
  dayStripCell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, gap: 2, backgroundColor: Theme.cardTinted },
  dayStripCellActive: { backgroundColor: Theme.eyebrowGreen },
  dayStripDayName: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
  dayStripDayNameActive: { color: '#FFFFFF' },
  dayStripDate: { fontFamily: Fonts.sansBold, fontSize: 20, color: Theme.textPrimary },
  dayStripDateActive: { color: '#FFFFFF' },
  weekLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  weekLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekLegendSwatch: { width: 10, height: 10, borderRadius: 5 },
  weekLegendText: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary, flexShrink: 1 },
  formLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary, marginBottom: 8, marginTop: 4 },
  formInput: { backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 16, color: Theme.textPrimary, fontFamily: Fonts.sansRegular, fontSize: 16, marginBottom: 10, borderWidth: 1, borderColor: Theme.divider },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  pillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  pillText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textSecondary },
  pillTextActive: { color: '#FFFFFF' },
  segmentRow: { flexDirection: 'row', backgroundColor: Theme.cardTinted, borderRadius: 20, padding: 4, marginBottom: 16 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 16 },
  segmentActive: { backgroundColor: Theme.eyebrowGreen },
  segmentPillText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  segmentPillTextActive: { color: '#fff' },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  paidRowText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textPrimary },
  saveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginTop: 14 },
  saveBtnSecondary: { backgroundColor: Theme.cardTinted },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 16 },
  wizardNavRow: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' },
  navBackBtn: { paddingHorizontal: 18, paddingVertical: 16 },
  navBackText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary },
});
