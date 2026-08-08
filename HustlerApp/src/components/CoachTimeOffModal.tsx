import { Modal, View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '@/components/Text';
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { TimePicker } from './TimePicker';
import { MiniDateRangePicker } from './MiniDatePicker';
import { DAY_NAMES, formatTime12h } from '../lib/scheduling';
import {
  CoachTimeOff, getCoachTimeOff, addRecurringBreak, addRecurringDayOff, addDaysOff, removeCoachTimeOff,
  CoachShift, getCoachShifts, addCoachShift, removeCoachShift,
} from '../lib/coachTimeOff';
import { showConfirm } from '../lib/ui';

type Props = {
  clubId: string;
  coach: { id: string; full_name: string };
  visible: boolean;
  onClose: () => void;
};

const formatDateStr = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const toggleInArray = (arr: number[], n: number) => (arr.includes(n) ? arr.filter((x) => x !== n) : [...arr, n]);

// Theme.textSecondary (#6B6A63) reads too faint for hint/label copy at
// small sizes — this is darker while staying clearly secondary to
// Theme.textPrimary.
const READABLE_GREY = '#4B4A43';

type WeeklyRow = { key: string; dayOfWeek: number; label: string; onRemove: () => void };

// Club-only setup for a coach's working hours, recurring weekly break, and
// one-off vacation ranges — read everywhere availability is checked (the
// parent open-slot grid and the makeup-suggestion search), so anything
// added here is automatically kept out of both. Working Hours is the only
// *positive* one (defines when the coach IS around, including full weekdays
// off); Recurring Break and Days Off are negative carve-outs on top of it.
export function CoachTimeOffModal({ clubId, coach, visible, onClose }: Props) {
  const [entries, setEntries] = useState<CoachTimeOff[]>([]);
  const [shifts, setShifts] = useState<CoachShift[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [shiftDays, setShiftDays] = useState<number[]>([]);
  const [shiftIsDayOff, setShiftIsDayOff] = useState(false);
  const [shiftStart, setShiftStart] = useState<string | null>(null);
  const [shiftEnd, setShiftEnd] = useState<string | null>(null);

  // Most part-time coaches just don't have a recurring break — this stays
  // collapsed to a plain yes/no question until there's something to add or
  // already saved, rather than presenting the day/time form up front.
  const [hasBreak, setHasBreak] = useState(false);
  const [breakDays, setBreakDays] = useState<number[]>([]);
  const [breakStart, setBreakStart] = useState<string | null>(null);
  const [breakEnd, setBreakEnd] = useState<string | null>(null);

  const [offStart, setOffStart] = useState<string | null>(null);
  const [offEnd, setOffEnd] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [offRows, shiftRows] = await Promise.all([
      getCoachTimeOff(clubId, coach.id),
      getCoachShifts(clubId, coach.id),
    ]);
    setEntries(offRows);
    setShifts(shiftRows);
    setHasBreak(offRows.some((e) => e.kind === 'recurring_break'));
    // Drop any in-progress selection that a just-added entry made invalid
    // (e.g. Sunday picked for a break, then marked a day off elsewhere).
    const freshDayOffDays = new Set(offRows.filter((e) => e.kind === 'recurring_day_off').map((e) => e.dayOfWeek));
    setShiftDays((prev) => prev.filter((i) => !freshDayOffDays.has(i)));
    setBreakDays((prev) => prev.filter((i) => !freshDayOffDays.has(i)));
    setLoading(false);
  }, [clubId, coach.id]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const resetDrafts = () => {
    setShiftDays([]); setShiftIsDayOff(false); setShiftStart(null); setShiftEnd(null);
    setBreakDays([]); setBreakStart(null); setBreakEnd(null);
    setOffStart(null); setOffEnd(null);
  };

  const handleClose = () => {
    resetDrafts();
    onClose();
  };

  const submitShift = async () => {
    if (shiftDays.length === 0) return;
    setSaving(true);
    const res = shiftIsDayOff
      ? await addRecurringDayOff({ clubId, coachId: coach.id, daysOfWeek: shiftDays })
      : (shiftStart && shiftEnd && shiftEnd > shiftStart)
        ? await addCoachShift({ clubId, coachId: coach.id, daysOfWeek: shiftDays, startTime: shiftStart, endTime: shiftEnd })
        : { ok: false };
    setSaving(false);
    if (res.ok) {
      setShiftDays([]); setShiftStart(null); setShiftEnd(null);
      load();
    }
  };

  const submitBreak = async () => {
    if (breakDays.length === 0 || !breakStart || !breakEnd || breakEnd <= breakStart) return;
    setSaving(true);
    const res = await addRecurringBreak({ clubId, coachId: coach.id, daysOfWeek: breakDays, startTime: breakStart, endTime: breakEnd });
    setSaving(false);
    if (res.ok) {
      setBreakDays([]); setBreakStart(null); setBreakEnd(null);
      load();
    }
  };

  const submitDaysOff = async () => {
    if (!offStart || !offEnd || offEnd < offStart) return;
    setSaving(true);
    const res = await addDaysOff({ clubId, coachId: coach.id, startDate: offStart, endDate: offEnd });
    setSaving(false);
    if (res.ok) {
      setOffStart(null); setOffEnd(null);
      load();
    }
  };

  const remove = (entry: CoachTimeOff) => {
    showConfirm('Remove this?', 'The coach will be shown as available again during this time.', async () => {
      await removeCoachTimeOff(entry.id);
      load();
    }, 'Remove');
  };

  const removeShift = (shift: CoachShift) => {
    showConfirm('Remove this shift?', "This day/time won't count as working hours anymore.", async () => {
      await removeCoachShift(shift.id);
      load();
    }, 'Remove');
  };

  const dayOffs = entries.filter((e) => e.kind === 'recurring_day_off');
  const breaks = entries.filter((e) => e.kind === 'recurring_break').sort((a, b) => (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0));
  const daysOff = entries.filter((e) => e.kind === 'days_off');
  const shiftSubmittable = shiftDays.length > 0 && (shiftIsDayOff || (!!shiftStart && !!shiftEnd));
  const breakSubmittable = breakDays.length > 0 && !!breakStart && !!breakEnd;

  // A day already marked off can't also get a shift or another day-off
  // entry — grey those pills out rather than letting a duplicate/
  // contradictory entry get added. Removing the day-off entry (trash icon
  // in the list below) is what un-greys it again.
  const dayOffDays = new Set(dayOffs.map((d) => d.dayOfWeek ?? -1));
  const shiftedDays = new Set(shifts.map((s) => s.dayOfWeek));
  const isShiftDayPickable = (i: number) => !dayOffDays.has(i) && !(shiftIsDayOff && shiftedDays.has(i));
  const isBreakDayPickable = (i: number) => !dayOffDays.has(i);

  // Shifts and full days-off are both "when this coach works" — shown
  // together under Working Hours, sorted by day, so the whole weekly
  // pattern reads as one list.
  const workingHoursRows: WeeklyRow[] = [
    ...shifts.map((s) => ({ key: `shift-${s.id}`, dayOfWeek: s.dayOfWeek, label: `${DAY_NAMES[s.dayOfWeek]} · ${formatTime12h(s.startTime)}–${formatTime12h(s.endTime)}`, onRemove: () => removeShift(s) })),
    ...dayOffs.map((d) => ({ key: `off-${d.id}`, dayOfWeek: d.dayOfWeek ?? 0, label: `${DAY_NAMES[d.dayOfWeek ?? 0]} · Day off`, onRemove: () => remove(d) })),
  ].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Off Time</Text>
              <Text style={styles.headerSub}>{coach.full_name}</Text>
            </View>
            <TouchableOpacity onPress={handleClose}>
              <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sectionHeader}>
              <Icon name="calendar-week" size={18} color={Theme.eyebrowGreen} />
              <Text style={styles.sectionTitle}>Working Hours</Text>
            </View>
            <Text style={styles.hint}>
              {shifts.length === 0
                ? "Until you add hours, this coach won't show any open private-lesson slots. Tap days that share a shift."
                : 'Only bookable within these hours.'}
            </Text>

            <View style={styles.pillWrapRow}>
              {DAY_NAMES.map((d, i) => {
                const pickable = isShiftDayPickable(i);
                return (
                  <TouchableOpacity
                    key={d}
                    disabled={!pickable}
                    style={[styles.pill, shiftDays.includes(i) && styles.pillActive, !pickable && styles.pillDisabled]}
                    onPress={() => setShiftDays((prev) => toggleInArray(prev, i))}
                  >
                    <Text style={[styles.pillText, shiftDays.includes(i) && styles.pillTextActive, !pickable && styles.pillTextDisabled]}>{d.slice(0, 3)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.segmentRow}>
              <TouchableOpacity style={[styles.segment, !shiftIsDayOff && styles.segmentActive]} onPress={() => setShiftIsDayOff(false)}>
                <Text style={[styles.segmentText, !shiftIsDayOff && styles.segmentTextActive]}>Works</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, shiftIsDayOff && styles.segmentActive]}
                onPress={() => { setShiftIsDayOff(true); setShiftDays((prev) => prev.filter((i) => !shiftedDays.has(i))); }}
              >
                <Text style={[styles.segmentText, shiftIsDayOff && styles.segmentTextActive]}>Day off</Text>
              </TouchableOpacity>
            </View>

            {!shiftIsDayOff && (
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <TimePicker value={shiftStart} onChange={setShiftStart} placeholder="Start" />
                </View>
                <View style={{ flex: 1 }}>
                  <TimePicker value={shiftEnd} onChange={setShiftEnd} placeholder="End" />
                </View>
              </View>
            )}
            <TouchableOpacity
              style={[styles.addBtn, (!shiftSubmittable || saving) && styles.addBtnDisabled]}
              disabled={!shiftSubmittable || saving}
              onPress={submitShift}
            >
              <Icon name="plus-circle-outline" size={18} color={Theme.limeAccentDark} />
              <Text style={styles.addBtnText}>{shiftIsDayOff ? 'Add Day Off' : 'Add Shift'}</Text>
            </TouchableOpacity>

            {workingHoursRows.map((r) => (
              <View key={r.key} style={styles.entryRow}>
                <Text style={styles.entryText}>{r.label}</Text>
                <TouchableOpacity onPress={r.onRemove}>
                  <Icon name="trash-can-outline" size={20} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>
            ))}

            <View style={[styles.sectionHeader, { marginTop: 24 }]}>
              <Icon name="clock-outline" size={18} color={Theme.eyebrowGreen} />
              <Text style={styles.sectionTitle}>Recurring Break</Text>
            </View>
            <Text style={styles.hint}>A weekly lunch break, if they have one.</Text>

            <View style={styles.segmentRow}>
              <TouchableOpacity style={[styles.segment, !hasBreak && styles.segmentActive]} onPress={() => setHasBreak(false)}>
                <Text style={[styles.segmentText, !hasBreak && styles.segmentTextActive]}>No break</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segment, hasBreak && styles.segmentActive]} onPress={() => setHasBreak(true)}>
                <Text style={[styles.segmentText, hasBreak && styles.segmentTextActive]}>Has a break</Text>
              </TouchableOpacity>
            </View>

            {hasBreak && (
              <>
                <Text style={styles.hint}>Tap every day that shares this break.</Text>
                <View style={styles.pillWrapRow}>
                  {DAY_NAMES.map((d, i) => {
                    const pickable = isBreakDayPickable(i);
                    return (
                      <TouchableOpacity
                        key={d}
                        disabled={!pickable}
                        style={[styles.pill, breakDays.includes(i) && styles.pillActive, !pickable && styles.pillDisabled]}
                        onPress={() => setBreakDays((prev) => toggleInArray(prev, i))}
                      >
                        <Text style={[styles.pillText, breakDays.includes(i) && styles.pillTextActive, !pickable && styles.pillTextDisabled]}>{d.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.timeRow}>
                  <View style={{ flex: 1 }}>
                    <TimePicker value={breakStart} onChange={setBreakStart} placeholder="Start" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TimePicker value={breakEnd} onChange={setBreakEnd} placeholder="End" />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.addBtn, (!breakSubmittable || saving) && styles.addBtnDisabled]}
                  disabled={!breakSubmittable || saving}
                  onPress={submitBreak}
                >
                  <Icon name="plus-circle-outline" size={18} color={Theme.limeAccentDark} />
                  <Text style={styles.addBtnText}>Add Break</Text>
                </TouchableOpacity>
              </>
            )}

            {breaks.map((b) => (
              <View key={b.id} style={styles.entryRow}>
                <Text style={styles.entryText}>{DAY_NAMES[b.dayOfWeek ?? 0]} · {formatTime12h(b.startTime ?? '')}–{formatTime12h(b.endTime ?? '')}</Text>
                <TouchableOpacity onPress={() => remove(b)}>
                  <Icon name="trash-can-outline" size={20} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>
            ))}

            <View style={[styles.sectionHeader, { marginTop: 24 }]}>
              <Icon name="calendar-blank-outline" size={18} color={Theme.eyebrowGreen} />
              <Text style={styles.sectionTitle}>Away</Text>
            </View>
            <Text style={styles.hint}>{!offStart ? 'Vacation, a tournament, anything that takes them away for a stretch — tap the first day.' : !offEnd ? 'Now tap the last day.' : 'Ready to add.'}</Text>

            <MiniDateRangePicker startValue={offStart} endValue={offEnd} onChangeStart={setOffStart} onChangeEnd={setOffEnd} />

            <TouchableOpacity
              style={[styles.addBtn, { marginTop: 12 }, (!offStart || !offEnd || saving) && styles.addBtnDisabled]}
              disabled={!offStart || !offEnd || saving}
              onPress={submitDaysOff}
            >
              <Icon name="plus-circle-outline" size={18} color={Theme.limeAccentDark} />
              <Text style={styles.addBtnText}>Add Away Time</Text>
            </TouchableOpacity>

            {daysOff.map((d) => (
              <View key={d.id} style={styles.entryRow}>
                <Text style={styles.entryText}>{formatDateStr(d.startDate ?? '')} – {formatDateStr(d.endDate ?? '')}</Text>
                <TouchableOpacity onPress={() => remove(d)}>
                  <Icon name="trash-can-outline" size={20} color={Theme.textPrimary} />
                </TouchableOpacity>
              </View>
            ))}

            {!loading && workingHoursRows.length === 0 && breaks.length === 0 && daysOff.length === 0 && (
              <Text style={styles.emptyText}>Nothing set yet — add working hours above so this coach can actually be booked for private lessons.</Text>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '88%' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
  headerSub: { fontSize: 15, color: READABLE_GREY, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontFamily: Fonts.sansBold, fontSize: 17, color: Theme.textPrimary },
  hint: { fontSize: 14, color: READABLE_GREY, marginBottom: 12, lineHeight: 19 },
  label: { fontSize: 14, color: READABLE_GREY, marginBottom: 6, fontWeight: '600' },
  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  pillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  pillText: { fontSize: 15, color: Theme.textPrimary, fontWeight: '600' },
  pillTextActive: { color: '#FFFFFF' },
  // Already spoken for by a day-off entry (or, in Day off mode, a shift) —
  // greyed out and untappable until that entry is removed.
  pillDisabled: { backgroundColor: Theme.divider, borderColor: Theme.divider },
  pillTextDisabled: { color: Theme.textMuted },
  // A plain, two-choice question (e.g. "Does this coach take a break?")
  // reads more professional than a checkbox here, and doubles as the
  // collapse/reveal control for the fiddlier day+time inputs below it.
  segmentRow: { flexDirection: 'row', backgroundColor: Theme.cardWhite, borderRadius: 20, borderWidth: 1, borderColor: Theme.divider, padding: 4, marginBottom: 10 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 16 },
  segmentActive: { backgroundColor: Theme.eyebrowGreen },
  segmentText: { fontSize: 15, color: READABLE_GREY, fontWeight: '600' },
  segmentTextActive: { color: '#FFFFFF' },
  timeRow: { flexDirection: 'row', gap: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Theme.limeAccent, borderRadius: 20, paddingVertical: 13, marginBottom: 8 },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { fontFamily: Fonts.sansBold, fontSize: 16, color: Theme.limeAccentDark },
  entryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: Theme.divider },
  entryText: { fontSize: 15, color: Theme.textPrimary, fontWeight: '600' },
  emptyText: { fontSize: 15, color: READABLE_GREY, marginTop: 4, marginBottom: 12, lineHeight: 20 },
  doneBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  doneBtnText: { fontFamily: Fonts.sansBold, fontSize: 16, color: Theme.limeAccentDark },
});
