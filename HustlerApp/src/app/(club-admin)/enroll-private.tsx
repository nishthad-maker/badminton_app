import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/ui';
import { DAY_NAMES, formatTime12h } from '../../lib/scheduling';
import { TimePicker } from '@/components/TimePicker';
import { getCoachOpenSlots, OpenSlot } from '../../lib/coachAvailability';
import { createPrivateLessonPlan, PlanSlotDraft } from '../../lib/privateLessonPlans';

const TOTAL_STEPS = 4;

type Coach = { id: string; full_name: string };
type DaySlot = { start: string; end: string; manual: boolean };

// Full-screen, step-by-step private-lesson enrollment — the ONE place a
// private lesson plan gets created, reached from both the New Player
// walk-in flow, the join-request approval flow (dashboard.tsx), and
// tiers.tsx's "Schedule Private Lesson" for a player's first private
// lesson — no separate/parallel creation flow lives anywhere else. Hidden
// from the club-admin tab bar (see (club-admin)/_layout.tsx's
// `href: null`) — this is a pushed screen, not a section of the app.
export default function EnrollPrivateScreen() {
  const params = useLocalSearchParams<{ clubId: string; playerId: string; playerName?: string }>();
  const clubId = params.clubId;
  const playerId = params.playerId;
  const playerName = params.playerName ?? 'this player';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [myId, setMyId] = useState<string | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);

  // Step 1
  const [totalSessions, setTotalSessions] = useState('10');

  // Step 2
  const [days, setDays] = useState<number[]>([]);

  // Step 3 — coach + time picked together, per day (co-teaching across the
  // week is normal — Monday with one coach, Wednesday with another)
  const [dayCoachIds, setDayCoachIds] = useState<Record<number, string>>({});
  const [dayOpenOptions, setDayOpenOptions] = useState<Record<number, OpenSlot[]>>({});
  const [daySlots, setDaySlots] = useState<Record<number, DaySlot>>({});
  const [loadingDay, setLoadingDay] = useState<number | null>(null);

  // Step 4
  const [isRecurring, setIsRecurring] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setMyId(session.user.id);
      const { data: coachRows } = await supabase
        .from('club_coaches').select('coach_id, profiles(full_name)').eq('club_id', clubId).eq('status', 'active');
      setCoaches((coachRows ?? []).map((c: any) => ({ id: c.coach_id, full_name: c.profiles?.full_name ?? 'Coach' })));
      setLoading(false);
    })();
  }, [clubId]);

  const exitWizard = () => router.back();

  const toggleDay = (day: number) => {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  };

  const goToStep2 = () => {
    const n = parseInt(totalSessions, 10);
    if (!Number.isFinite(n) || n <= 0) { showAlert('Missing count', 'Enter how many sessions this plan covers.'); return; }
    setStep(2);
  };

  const goToStep3 = () => {
    if (days.length === 0) { showAlert('Pick days', 'Choose at least one day of the week.'); return; }
    setStep(3);
  };

  // Picking a coach for a day fetches THAT coach's actual open windows for
  // THAT weekday right away (working hours minus breaks/days-off minus
  // everything already on their schedule) — the whole reason coach and
  // time live in the same step instead of "pick one coach for everything,
  // then hope they're free."
  const pickDayCoach = async (day: number, coachId: string) => {
    setDayCoachIds((prev) => ({ ...prev, [day]: coachId }));
    setLoadingDay(day);
    const options = await getCoachOpenSlots(clubId, coachId, day, 60);
    setDayOpenOptions((prev) => ({ ...prev, [day]: options }));
    setDaySlots((prev) => ({ ...prev, [day]: { start: options[0]?.start ?? '16:00', end: options[0]?.end ?? '17:00', manual: options.length === 0 } }));
    setLoadingDay(null);
  };

  const pickOpenSlot = (day: number, slot: OpenSlot) => {
    setDaySlots((prev) => ({ ...prev, [day]: { start: slot.start, end: slot.end, manual: false } }));
  };

  const toggleManual = (day: number) => {
    setDaySlots((prev) => ({ ...prev, [day]: { ...(prev[day] ?? { start: '16:00', end: '17:00', manual: false }), manual: !prev[day]?.manual } }));
  };

  const setDayTime = (day: number, patch: Partial<{ start: string; end: string }>) => {
    setDaySlots((prev) => ({ ...prev, [day]: { ...(prev[day] ?? { start: '16:00', end: '17:00', manual: true }), ...patch } }));
  };

  const goToStep4 = () => {
    for (const day of days) {
      if (!dayCoachIds[day]) { showAlert('Pick a coach', `Choose a coach for ${DAY_NAMES[day]}.`); return; }
      const s = daySlots[day];
      if (!s || !s.start || !s.end || s.start >= s.end) { showAlert('Check times', `Pick a valid start/end time for ${DAY_NAMES[day]}.`); return; }
    }
    setStep(4);
  };

  const confirm = async () => {
    setSaving(true);
    const slots: PlanSlotDraft[] = days.map((day) => ({ day, start: daySlots[day].start, end: daySlots[day].end, coachId: dayCoachIds[day] }));
    const res = await createPrivateLessonPlan({
      clubId, playerId, totalSessions: parseInt(totalSessions, 10) || 1,
      isRecurring, slots, createdBy: myId,
    });
    setSaving(false);
    if (!res.ok) { showAlert('Error', res.message ?? 'Could not create the private lesson plan.'); return; }
    router.replace('/(club-admin)/dashboard' as any);
  };

  const coachName = (id: string) => coaches.find((c) => c.id === id)?.full_name ?? '';

  if (loading) {
    return <View style={styles.container}><Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={() => (step > 1 ? setStep(step - 1) : exitWizard())}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Private Lessons — {playerName}</Text>
        </View>

        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View key={i} style={[styles.progressDot, i + 1 <= step && styles.progressDotActive]} />
          ))}
        </View>
        <Text style={styles.stepLabel} maxFontSizeMultiplier={1.3}>STEP {step} OF {TOTAL_STEPS}</Text>

        {step === 1 && (
          <>
            <Text style={styles.title}>How many private lessons are in {playerName}'s plan?</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>The total number of private lessons this player has signed up for — recurring bookings automatically stop once they're used up.</Text>
            <TextInput style={styles.input} value={totalSessions} onChangeText={setTotalSessions} keyboardType="number-pad" placeholder="e.g. 10" placeholderTextColor={Theme.textMuted} />
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={exitWizard}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={goToStep2}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Which days of the week?</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Pick every day this player trains privately — for example, just Monday and Wednesday for 2 sessions a week.</Text>
            <View style={styles.pillWrapRow}>
              {DAY_NAMES.map((d, i) => (
                <TouchableOpacity key={d} style={[styles.pill, days.includes(i) && styles.pillActive]} onPress={() => toggleDay(i)}>
                  <Text style={[styles.pillText, days.includes(i) && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={goToStep3}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Coach + time for each day</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Pick a coach per day — the times shown are that coach's actual open windows (working hours minus breaks and everything else already on their schedule).</Text>

            {days.map((day) => {
              const dayCoachId = dayCoachIds[day];
              const options = dayOpenOptions[day] ?? [];
              const current = daySlots[day];
              return (
                <View key={day} style={styles.dayCard}>
                  <Text style={styles.dayCardTitle}>{DAY_NAMES[day]}</Text>

                  <Text style={styles.hint} maxFontSizeMultiplier={1.3}>COACH</Text>
                  <View style={styles.pillWrapRow}>
                    {coaches.map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.pill, dayCoachId === c.id && styles.pillActive]} onPress={() => pickDayCoach(day, c.id)}>
                        <Text style={[styles.pillText, dayCoachId === c.id && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {dayCoachId && (loadingDay === day ? (
                    <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>Checking availability...</Text>
                  ) : (
                    <>
                      {!current?.manual && (
                        options.length === 0 ? (
                          <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>No open slots found on {coachName(dayCoachId)}'s calendar for {DAY_NAMES[day]}.</Text>
                        ) : (
                          <View style={styles.pillWrapRow}>
                            {options.map((o, i) => {
                              const active = current?.start === o.start && current?.end === o.end;
                              return (
                                <TouchableOpacity key={i} style={[styles.pill, active && styles.pillActive]} onPress={() => pickOpenSlot(day, o)}>
                                  <Text style={[styles.pillText, active && styles.pillTextActive]} maxFontSizeMultiplier={1.3}>{formatTime12h(o.start)}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )
                      )}

                      {current?.manual && (
                        <View style={[styles.timeRow, { marginTop: 4 }]}>
                          <View style={{ flex: 1 }}>
                            <TimePicker value={current?.start ?? null} onChange={(t) => setDayTime(day, { start: t })} placeholder="Start" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <TimePicker value={current?.end ?? null} onChange={(t) => setDayTime(day, { end: t })} placeholder="End" />
                          </View>
                        </View>
                      )}

                      <TouchableOpacity onPress={() => toggleManual(day)}>
                        <Text style={styles.manualLink} maxFontSizeMultiplier={1.3}>{current?.manual ? 'Choose from open slots instead' : 'Enter manually instead'}</Text>
                      </TouchableOpacity>
                    </>
                  ))}
                </View>
              );
            })}

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={goToStep4}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.title}>Confirm plan</Text>

            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>REPEATS?</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity style={[styles.segment, isRecurring && styles.segmentActive]} onPress={() => setIsRecurring(true)}>
                <Text style={[styles.segmentText, isRecurring && styles.segmentTextActive]}>Recurring</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segment, !isRecurring && styles.segmentActive]} onPress={() => setIsRecurring(false)}>
                <Text style={[styles.segmentText, !isRecurring && styles.segmentTextActive]}>Just this week</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.recurringHint} maxFontSizeMultiplier={1.3}>
              {isRecurring
                ? 'Repeats every week until all sessions are used — top up anytime from their player folder.'
                : "One-time booking for this week only — you'll need to add next week's manually."}
            </Text>

            <View style={styles.reviewCard}>
              <Text style={styles.reviewName}>{playerName}</Text>
              <Text style={styles.reviewLine} maxFontSizeMultiplier={1.3}>{totalSessions} session{totalSessions === '1' ? '' : 's'} in this plan</Text>
              {days.map((day) => (
                <Text key={day} style={styles.reviewLine} maxFontSizeMultiplier={1.3}>
                  • {DAY_NAMES[day]}: {daySlots[day] ? `${formatTime12h(daySlots[day].start)}–${formatTime12h(daySlots[day].end)}` : ''} · {coachName(dayCoachIds[day])}
                </Text>
              ))}
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(3)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={confirm} disabled={saving}>
                <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Confirm & Schedule'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 60 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginTop: 40, textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  headerTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary, flexShrink: 1 },
  progressRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Theme.divider },
  progressDotActive: { backgroundColor: Theme.eyebrowGreen },
  stepLabel: { fontFamily: Fonts.sansBold, fontSize: 12, color: Theme.textMuted, letterSpacing: 1, marginBottom: 24 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 26, color: Theme.textPrimary, marginBottom: 10 },
  subtitle: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, lineHeight: 21, marginBottom: 24 },
  hint: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.textMuted, letterSpacing: 1, marginBottom: 8 },
  input: {
    backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 16, color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular, fontSize: 16, marginBottom: 6, borderWidth: 1, borderColor: Theme.divider,
  },
  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  pillActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  pillText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  pillTextActive: { color: '#fff' },
  button: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 16 },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 20 },
  backBtn: { paddingVertical: 16, paddingHorizontal: 8 },
  backBtnText: { fontFamily: Fonts.sansSemiBold, color: Theme.textSecondary, fontSize: 16 },
  timeRow: { flexDirection: 'row', gap: 10 },
  dayCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Theme.divider },
  dayCardTitle: { fontFamily: Fonts.sansBold, fontSize: 16, color: Theme.textPrimary, marginBottom: 10 },
  emptyText: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, fontStyle: 'italic', marginBottom: 8 },
  manualLink: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.eyebrowGreen, marginTop: 8 },
  segmentRow: { flexDirection: 'row', backgroundColor: Theme.cardWhite, borderRadius: 20, borderWidth: 1, borderColor: Theme.divider, padding: 4, marginBottom: 8 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 16 },
  segmentActive: { backgroundColor: Theme.eyebrowGreen },
  segmentText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  segmentTextActive: { color: '#fff' },
  recurringHint: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, marginBottom: 18, lineHeight: 19 },
  reviewCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18 },
  reviewName: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Theme.textPrimary, marginBottom: 4 },
  reviewLine: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary },
});
