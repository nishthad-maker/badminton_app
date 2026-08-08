import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/ui';
import { getMyClub, DEFAULT_SKILL_LEVELS, updateClubSkillLevels, createSetupCoach } from '../../lib/club';
import { getClubCourts } from '../../lib/courts';
import { getGroupLessons, assignLessonCoaches, addTimeSlot } from '../../lib/lessons';
import { NOTIFICATION_CATEGORIES, getNotificationPreferences, setNotificationPreference } from '../../lib/notifications';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { DAY_NAMES, to24HourFromParts } from '../../lib/scheduling';
import { TimePicker } from '@/components/TimePicker';
import { CoachTimeOffModal } from '@/components/CoachTimeOffModal';
import { getCoachShifts, getCoachTimeOff } from '../../lib/coachTimeOff';

const TOTAL_STEPS = 10;

type BatchSchedule = { coachIds: string[]; days: number[]; start: string; end: string };
type SetupCoach = { id: string; full_name: string };

// Splits a stored 24h "HH:MM" back into the three parts the hours-step
// cards edit — the inverse of to24HourFromParts (scheduling.ts).
const partsFrom24h = (time: string): [string, string, 'AM' | 'PM'] => {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10) || 0;
  const meridiem: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return [String(hour12), mStr ?? '00', meridiem];
};

// The mandatory, one-question-per-screen setup wizard every new club must
// complete before the real dashboard/nav tabs unlock (see dashboard.tsx's
// onboardingCompleted gate, and SetupLockedPlaceholder on the other 3 tabs).
// Deliberately has NO skip/close control anywhere — the only way out is
// finishing the last step. Each step saves to the real column immediately on
// Continue, so backgrounding the app or force-navigating away mid-flow never
// loses progress; re-entering just resumes (still gated until the last step
// sets onboarding_completed).
//
// Steps 1-7 front-load everything a club needs to actually run day one
// (hours, cancellation policy, courts, coaches, batch types, and each
// batch's coach+schedule) instead of leaving all of that for later,
// piecemeal, in Club Settings/Lessons. Steps 8-10 are the original wizard's
// group-makeup/notification-defaults/join-codes screens, unchanged, just
// moved to the end.
export default function ClubOnboardingScreen() {
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubName, setClubName] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState('Me');
  const [saving, setSaving] = useState(false);

  // Step 1 — open hours: two cards (Opens/Closes), each a tap-to-fill
  // Hour : Minute + AM/PM — numeric entry only, no free typing.
  const [openHour, setOpenHour] = useState('9');
  const [openMinute, setOpenMinute] = useState('00');
  const [openMeridiem, setOpenMeridiem] = useState<'AM' | 'PM'>('AM');
  const [closeHour, setCloseHour] = useState('8');
  const [closeMinute, setCloseMinute] = useState('00');
  const [closeMeridiem, setCloseMeridiem] = useState<'AM' | 'PM'>('PM');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('20:00');
  const [open24Hours, setOpen24Hours] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);

  // Step 2 — cancellation cutoff
  const [cutoffHours, setCutoffHours] = useState('24');

  // Step 3 — how many courts
  const [existingCourtCount, setExistingCourtCount] = useState(0);
  const [courtCount, setCourtCount] = useState('4');

  // Step 4 — add coaches (name + optional email, real active accounts,
  // created immediately so working hours/breaks can be set right away)
  const [coachNameDraft, setCoachNameDraft] = useState('');
  const [coachEmailDraft, setCoachEmailDraft] = useState('');
  const [setupCoaches, setSetupCoaches] = useState<SetupCoach[]>([]);
  const [hoursCoach, setHoursCoach] = useState<SetupCoach | null>(null);
  const [hoursSetFor, setHoursSetFor] = useState<Set<string>>(new Set());

  // Step 5 — batch types (unchanged capability, just repositioned)
  const [levels, setLevels] = useState<string[]>(DEFAULT_SKILL_LEVELS);
  const [newLevelDraft, setNewLevelDraft] = useState('');

  // Step 6 — per-batch coach + schedule
  const [batchSchedules, setBatchSchedules] = useState<Record<string, BatchSchedule>>({});
  const [groupTierIds, setGroupTierIds] = useState<Record<string, string>>({});

  // Step 7 — logo (optional)
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Step 8 — group makeup
  const [allowGroupMakeup, setAllowGroupMakeup] = useState(false);

  // Step 9 — notification defaults
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});

  // Step 10 — join codes
  const [playerJoinCode, setPlayerJoinCode] = useState('');
  const [coachJoinCode, setCoachJoinCode] = useState('');
  const [copiedPlayer, setCopiedPlayer] = useState(false);
  const [copiedCoach, setCopiedCoach] = useState(false);

  useEffect(() => {
    (async () => {
      const club = await getMyClub();
      if (!club) { router.replace('/(club-admin)/club-setup' as any); return; }
      setClubId(club.clubId);
      setClubName(club.clubName);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setMyId(session.user.id);
        const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
        if (myProfile?.full_name) setMyName(myProfile.full_name);
      }

      const [{ data: clubRow }, { data: settingsRow }, courtRows] = await Promise.all([
        supabase.from('clubs').select('skill_levels, logo_url').eq('id', club.clubId).single(),
        supabase.from('club_settings').select('cancellation_notice_hours, allow_group_makeup, player_join_code, coach_join_code, open_time, close_time').eq('club_id', club.clubId).single(),
        getClubCourts(club.clubId),
      ]);
      if (clubRow?.skill_levels?.length) setLevels(clubRow.skill_levels);
      if (clubRow?.logo_url) setLogoUrl(clubRow.logo_url);
      setExistingCourtCount(courtRows.length);
      if (settingsRow) {
        setCutoffHours(String(settingsRow.cancellation_notice_hours ?? 24));
        setAllowGroupMakeup(!!settingsRow.allow_group_makeup);
        setPlayerJoinCode(settingsRow.player_join_code ?? '');
        setCoachJoinCode(settingsRow.coach_join_code ?? '');
        const openSlice = settingsRow.open_time?.slice(0, 5);
        const closeSlice = settingsRow.close_time?.slice(0, 5);
        if (openSlice === '00:00' && closeSlice === '23:59') {
          setOpen24Hours(true);
        } else {
          if (openSlice) {
            setOpenTime(openSlice);
            const [h, m, meridiem] = partsFrom24h(openSlice);
            setOpenHour(h); setOpenMinute(m); setOpenMeridiem(meridiem);
          }
          if (closeSlice) {
            setCloseTime(closeSlice);
            const [h, m, meridiem] = partsFrom24h(closeSlice);
            setCloseHour(h); setCloseMinute(m); setCloseMeridiem(meridiem);
          }
        }
      }
      if (session?.user) setNotifPrefs(await getNotificationPreferences(session.user.id));
      setLoading(false);
    })();
  }, []);

  const toggleDefaultLevel = (level: string) => {
    setLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
  };

  const addCustomLevel = () => {
    const level = newLevelDraft.trim();
    if (!level || levels.includes(level)) { setNewLevelDraft(''); return; }
    setLevels((prev) => [...prev, level]);
    setNewLevelDraft('');
  };

  const removeLevel = (level: string) => setLevels((prev) => prev.filter((l) => l !== level));

  // ── Step 1: open hours ──
  const goToStep2 = async () => {
    if (!clubId) return;
    let parsedOpen: string | null;
    let parsedClose: string | null;
    if (open24Hours) {
      parsedOpen = '00:00';
      parsedClose = '23:59';
    } else {
      parsedOpen = to24HourFromParts(openHour, openMinute, openMeridiem);
      parsedClose = to24HourFromParts(closeHour, closeMinute, closeMeridiem);
      if (!parsedOpen || !parsedClose) { setHoursError("Check the hour (1-12) and minute (00-59) fields."); return; }
      if (parsedClose <= parsedOpen) { setHoursError('Closing time must be after opening time.'); return; }
    }
    setHoursError(null);
    setSaving(true);
    const { error } = await supabase.from('club_settings').update({ open_time: parsedOpen, close_time: parsedClose, updated_at: new Date().toISOString() }).eq('club_id', clubId);
    setSaving(false);
    if (error) { showAlert('Error', 'Could not save your club hours. Please try again.'); return; }
    setOpenTime(parsedOpen);
    setCloseTime(parsedClose);
    setStep(2);
  };

  // ── Step 2: cancellation cutoff ──
  const goToStep3 = async () => {
    if (!clubId) return;
    setSaving(true);
    const { error } = await supabase.from('club_settings').update({ cancellation_notice_hours: parseInt(cutoffHours, 10) || 24, updated_at: new Date().toISOString() }).eq('club_id', clubId);
    setSaving(false);
    if (error) { showAlert('Error', 'Could not save the cancellation cutoff. Please try again.'); return; }
    setStep(3);
  };

  // ── Step 3: how many courts ──
  const goToStep4 = async () => {
    if (!clubId) return;
    const count = Math.max(0, Math.min(50, parseInt(courtCount, 10) || 0));
    setSaving(true);
    if (count > 0) {
      const inserts = Array.from({ length: count }, (_, i) => ({ club_id: clubId, name: `Court ${existingCourtCount + i + 1}` }));
      const { error } = await supabase.from('courts').insert(inserts);
      if (error) { setSaving(false); showAlert('Error', 'Could not add your courts. Please try again.'); return; }
      setExistingCourtCount((prev) => prev + count);
    }
    setSaving(false);
    setStep(4);
  };

  // ── Step 4: add coaches ──
  // Created immediately (not deferred to the step's Continue) so there's a
  // real club_coaches row to attach working hours/breaks to right away via
  // CoachTimeOffModal — the whole point of putting hours-setup in this step.
  const addCoachDraft = async () => {
    const name = coachNameDraft.trim();
    if (!name || !clubId) return;
    setSaving(true);
    const res = await createSetupCoach(clubId, name, coachEmailDraft.trim());
    setSaving(false);
    if (!res.ok || !res.coachId) { showAlert('Error', res.message ?? 'Could not add that coach.'); return; }
    setSetupCoaches((prev) => [...prev, { id: res.coachId!, full_name: name }]);
    setCoachNameDraft('');
    setCoachEmailDraft('');
  };

  // Re-checks after the hours modal closes so the row can switch from the
  // urgent "Set hours" prompt to a calm confirmation — the whole point of
  // tracking this is to actually nudge admins to fill it in, not just offer
  // the option once and let it blend into the background.
  const closeHoursModal = async () => {
    const coach = hoursCoach;
    setHoursCoach(null);
    if (!coach || !clubId) return;
    const [shifts, timeOff] = await Promise.all([getCoachShifts(clubId, coach.id), getCoachTimeOff(clubId, coach.id)]);
    if (shifts.length > 0 || timeOff.length > 0) {
      setHoursSetFor((prev) => new Set(prev).add(coach.id));
    }
  };

  const goToStep5 = () => setStep(5);

  // ── Step 5: batch types ──
  const goToStep6 = async () => {
    if (!clubId) return;
    setSaving(true);
    const { ok } = await updateClubSkillLevels(clubId, levels);
    if (!ok) { setSaving(false); showAlert('Error', 'Could not save your batch types. Please try again.'); return; }
    const tiers = await getGroupLessons(clubId);
    const idByName: Record<string, string> = {};
    tiers.forEach((t) => { if (levels.includes(t.name)) idByName[t.name] = t.id; });
    setGroupTierIds(idByName);
    setSaving(false);
    setStep(6);
  };

  // ── Step 6: per-batch coach + schedule ──
  const scheduleFor = (level: string): BatchSchedule => batchSchedules[level] ?? { coachIds: [], days: [], start: '16:00', end: '17:00' };

  // Group lessons can have a main + assistant coaches (co-taught sessions
  // are normal for a batch), so this toggles membership in a list rather
  // than picking a single coach.
  const toggleBatchCoach = (level: string, coachId: string) => {
    const current = scheduleFor(level);
    const coachIds = current.coachIds.includes(coachId) ? current.coachIds.filter((id) => id !== coachId) : [...current.coachIds, coachId];
    setBatchSchedules((prev) => ({ ...prev, [level]: { ...current, coachIds } }));
  };

  const toggleBatchDay = (level: string, day: number) => {
    const current = scheduleFor(level);
    const days = current.days.includes(day) ? current.days.filter((d) => d !== day) : [...current.days, day];
    setBatchSchedules((prev) => ({ ...prev, [level]: { ...current, days } }));
  };

  const setBatchTime = (level: string, patch: Partial<{ start: string; end: string }>) => {
    setBatchSchedules((prev) => ({ ...prev, [level]: { ...scheduleFor(level), ...patch } }));
  };

  const goToStep7 = async () => {
    for (const level of levels) {
      const sched = batchSchedules[level];
      if (sched && sched.days.length > 0 && sched.end <= sched.start) {
        showAlert('Check the time', `${level}'s end time must be after its start time.`);
        return;
      }
    }
    setSaving(true);
    for (const level of levels) {
      const tierId = groupTierIds[level];
      const sched = batchSchedules[level];
      if (!tierId || !sched) continue;
      if (sched.coachIds.length > 0) await assignLessonCoaches(tierId, sched.coachIds[0], sched.coachIds.slice(1));
      for (const day of sched.days) {
        await addTimeSlot(tierId, { day, start: sched.start, end: sched.end, isRecurring: true, oneTimeDate: null, courtIds: [] });
      }
    }
    setSaving(false);
    setStep(7);
  };

  // ── Step 7: logo ──
  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Allow photo library access to add a logo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    setUploadingLogo(true);
    const url = await uploadToCloudinary(result.assets[0].uri, 'image', 'club_logos');
    setUploadingLogo(false);
    if (!url) { showAlert('Error', 'Could not upload that image. Please try again.'); return; }
    setLogoUrl(url);
  };

  const goToStep8 = async () => {
    if (!clubId) return;
    if (logoUrl) {
      setSaving(true);
      const { error } = await supabase.from('clubs').update({ logo_url: logoUrl }).eq('id', clubId);
      setSaving(false);
      if (error) { showAlert('Error', 'Could not save your logo. Please try again.'); return; }
    }
    setStep(8);
  };

  // ── Step 8: group makeup ──
  const goToStep9 = async () => {
    if (!clubId) return;
    setSaving(true);
    const { error } = await supabase.from('club_settings').update({ allow_group_makeup: allowGroupMakeup, updated_at: new Date().toISOString() }).eq('club_id', clubId);
    setSaving(false);
    if (error) { showAlert('Error', 'Could not save the group makeup setting. Please try again.'); return; }
    setStep(9);
  };

  // ── Step 9: notification defaults ──
  const goToStep10 = async () => {
    if (!myId) return;
    setSaving(true);
    const results = await Promise.all(NOTIFICATION_CATEGORIES.map((c) => setNotificationPreference(myId, c.key, notifPrefs[c.key] ?? true)));
    setSaving(false);
    if (results.some((r) => !r.ok)) { showAlert('Error', 'Could not save notification preferences. Please try again.'); return; }
    setStep(10);
  };

  // ── Step 10: join codes / finish ──
  const finishSetup = async () => {
    if (!clubId) return;
    setSaving(true);
    const { error } = await supabase.from('club_settings').update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq('club_id', clubId);
    setSaving(false);
    if (error) { showAlert('Error', 'Could not finish setup. Please try again.'); return; }
    router.replace('/(club-admin)/dashboard' as any);
  };

  const copyCode = async (code: string, which: 'player' | 'coach') => {
    await Clipboard.setStringAsync(code);
    if (which === 'player') { setCopiedPlayer(true); setTimeout(() => setCopiedPlayer(false), 2000); }
    else { setCopiedCoach(true); setTimeout(() => setCopiedCoach(false), 2000); }
  };

  const allCoachOptions: SetupCoach[] = [{ id: myId ?? 'me', full_name: `${myName} (You)` }, ...setupCoaches];

  if (loading) {
    return <View style={styles.container}><Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>SETTING UP · {clubName.toUpperCase()}</Text>
        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View key={i} style={[styles.progressDot, i + 1 <= step && styles.progressDotActive]} />
          ))}
        </View>
        <Text style={styles.stepLabel} maxFontSizeMultiplier={1.3}>STEP {step} OF {TOTAL_STEPS}</Text>

        {step === 1 && (
          <>
            <Text style={styles.title}>When is your club open?</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Used as the default booking window for lessons — coaches can narrow this further with their own working hours later.</Text>

            <TouchableOpacity style={styles.open24Row} onPress={() => setOpen24Hours((v) => !v)}>
              <Icon name={open24Hours ? 'check-circle' : 'radiobox-blank'} size={24} color={open24Hours ? Theme.eyebrowGreen : Theme.textMuted} />
              <Text style={styles.open24Text} maxFontSizeMultiplier={1.3}>Open 24 hours</Text>
            </TouchableOpacity>

            {!open24Hours && (
            <>
            <View style={styles.hoursCard}>
              <Text style={styles.hint} maxFontSizeMultiplier={1.3}>OPENS</Text>
              <View style={styles.hoursRow}>
                <TextInput style={styles.hourBox} value={openHour} onChangeText={(t) => setOpenHour(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" maxLength={2} placeholder="9" placeholderTextColor={Theme.textMuted} />
                <Text style={styles.hoursColon}>:</Text>
                <TextInput style={styles.hourBox} value={openMinute} onChangeText={(t) => setOpenMinute(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" maxLength={2} placeholder="00" placeholderTextColor={Theme.textMuted} />
                <View style={styles.meridiemRow}>
                  <TouchableOpacity style={[styles.meridiemBtn, openMeridiem === 'AM' && styles.meridiemBtnActive]} onPress={() => setOpenMeridiem('AM')}>
                    <Text style={[styles.meridiemText, openMeridiem === 'AM' && styles.meridiemTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.meridiemBtn, openMeridiem === 'PM' && styles.meridiemBtnActive]} onPress={() => setOpenMeridiem('PM')}>
                    <Text style={[styles.meridiemText, openMeridiem === 'PM' && styles.meridiemTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.hoursCard}>
              <Text style={styles.hint} maxFontSizeMultiplier={1.3}>CLOSES</Text>
              <View style={styles.hoursRow}>
                <TextInput style={styles.hourBox} value={closeHour} onChangeText={(t) => setCloseHour(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" maxLength={2} placeholder="8" placeholderTextColor={Theme.textMuted} />
                <Text style={styles.hoursColon}>:</Text>
                <TextInput style={styles.hourBox} value={closeMinute} onChangeText={(t) => setCloseMinute(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" maxLength={2} placeholder="00" placeholderTextColor={Theme.textMuted} />
                <View style={styles.meridiemRow}>
                  <TouchableOpacity style={[styles.meridiemBtn, closeMeridiem === 'AM' && styles.meridiemBtnActive]} onPress={() => setCloseMeridiem('AM')}>
                    <Text style={[styles.meridiemText, closeMeridiem === 'AM' && styles.meridiemTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.meridiemBtn, closeMeridiem === 'PM' && styles.meridiemBtnActive]} onPress={() => setCloseMeridiem('PM')}>
                    <Text style={[styles.meridiemText, closeMeridiem === 'PM' && styles.meridiemTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            </>
            )}

            {hoursError && <Text style={styles.errorText} maxFontSizeMultiplier={1.3}>{hoursError}</Text>}
            <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={goToStep2} disabled={saving}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Cancellation cutoff window</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>How many hours before a lesson does attendance lock for players/parents? A coach can always override.</Text>
            <TextInput style={styles.input} value={cutoffHours} onChangeText={setCutoffHours} keyboardType="number-pad" placeholder="24" placeholderTextColor={Theme.textMuted} />
            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>hours before the lesson starts</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={goToStep3} disabled={saving}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>How many courts do you have?</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>We'll create them as "Court 1", "Court 2", etc. — rename them anytime in Club Settings.</Text>
            <TextInput style={styles.input} value={courtCount} onChangeText={setCourtCount} keyboardType="number-pad" placeholder="e.g. 4" placeholderTextColor={Theme.textMuted} />
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={goToStep4} disabled={saving}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.title}>Add your coaches</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Just a name — email is optional. Each becomes an active coach right away; you can always add more later with your coach join code.</Text>

            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>NAME</Text>
            <TextInput style={styles.input} value={coachNameDraft} onChangeText={setCoachNameDraft} placeholder="Coach's name" placeholderTextColor={Theme.textMuted} />
            <Text style={[styles.hint, { marginTop: 6 }]} maxFontSizeMultiplier={1.3}>EMAIL — OPTIONAL</Text>
            <TextInput style={styles.input} value={coachEmailDraft} onChangeText={setCoachEmailDraft} placeholder="coach@email.com" placeholderTextColor={Theme.textMuted} keyboardType="email-address" autoCapitalize="none" />
            <TouchableOpacity style={[styles.addRowBtn, saving && { opacity: 0.6 }]} onPress={addCoachDraft} disabled={!coachNameDraft.trim() || saving}>
              <Icon name="plus-circle-outline" size={18} color={Theme.eyebrowGreen} />
              <Text style={styles.addRowBtnText}>{saving ? 'Adding...' : 'Add another coach'}</Text>
            </TouchableOpacity>

            {setupCoaches.map((c) => {
              const hoursSet = hoursSetFor.has(c.id);
              return (
                <View key={c.id} style={styles.draftRow}>
                  <Text style={[styles.draftRowName, { flex: 1 }]}>{c.full_name}</Text>
                  <TouchableOpacity style={[styles.hoursBtn, hoursSet ? styles.hoursBtnDone : styles.hoursBtnNeeded]} onPress={() => setHoursCoach(c)}>
                    <Icon name={hoursSet ? 'check-circle' : 'clock-outline'} size={16} color={hoursSet ? Theme.eyebrowGreen : '#FFFFFF'} />
                    <Text style={[styles.hoursBtnText, hoursSet ? styles.hoursBtnTextDone : styles.hoursBtnTextNeeded]} maxFontSizeMultiplier={1.3}>
                      {hoursSet ? 'Hours set' : 'Set hours'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(3)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={goToStep5} disabled={saving}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 5 && (
          <>
            <Text style={styles.title}>What types of batches does your club run?</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Each batch gets its own lesson card — next you'll set who coaches it and when. You can add your own on top of the defaults.</Text>
            <View style={styles.chipWrap}>
              {DEFAULT_SKILL_LEVELS.map((level) => {
                const active = levels.includes(level);
                return (
                  <TouchableOpacity key={level} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleDefaultLevel(level)}>
                    {active && <Icon name="check" size={15} color="#FFFFFF" />}
                    <Text style={[styles.chipText, active && styles.chipTextActive]} maxFontSizeMultiplier={1.3}>{level}</Text>
                  </TouchableOpacity>
                );
              })}
              {levels.filter((l) => !DEFAULT_SKILL_LEVELS.includes(l)).map((level) => (
                <TouchableOpacity key={level} style={[styles.chip, styles.chipActive]} onPress={() => removeLevel(level)}>
                  <Text style={[styles.chipText, styles.chipTextActive]} maxFontSizeMultiplier={1.3}>{level} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={newLevelDraft} onChangeText={setNewLevelDraft} placeholder="Add a custom batch type" placeholderTextColor={Theme.textMuted} onSubmitEditing={addCustomLevel} />
              <TouchableOpacity onPress={addCustomLevel}>
                <Icon name="plus-circle-outline" size={30} color={Theme.eyebrowGreen} />
              </TouchableOpacity>
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(4)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={goToStep6} disabled={saving}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 6 && (
          <>
            <Text style={styles.title}>Coach + schedule for each batch</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Optional per batch — leave any of these blank and fill it in later from the Lessons tab.</Text>

            {levels.map((level) => {
              const sched = scheduleFor(level);
              return (
                <View key={level} style={styles.batchCard}>
                  <Text style={styles.batchCardTitle}>{level}</Text>

                  <Text style={styles.hint} maxFontSizeMultiplier={1.3}>COACH — TAP TO ADD MORE THAN ONE</Text>
                  <View style={styles.chipWrap}>
                    {allCoachOptions.map((c) => {
                      const active = sched.coachIds.includes(c.id);
                      return (
                        <TouchableOpacity key={c.id} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleBatchCoach(level, c.id)}>
                          {active && <Icon name="check" size={14} color="#FFFFFF" />}
                          <Text style={[styles.chipText, active && styles.chipTextActive]} maxFontSizeMultiplier={1.3}>{c.full_name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.hint, { marginTop: 10 }]} maxFontSizeMultiplier={1.3}>DAYS</Text>
                  <View style={styles.chipWrap}>
                    {DAY_NAMES.map((d, i) => (
                      <TouchableOpacity key={d} style={[styles.chip, sched.days.includes(i) && styles.chipActive]} onPress={() => toggleBatchDay(level, i)}>
                        <Text style={[styles.chipText, sched.days.includes(i) && styles.chipTextActive]} maxFontSizeMultiplier={1.3}>{d.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {sched.days.length > 0 && (
                    <View style={[styles.buttonRow, { marginTop: 10 }]}>
                      <View style={{ flex: 1 }}>
                        <TimePicker value={sched.start} onChange={(t) => setBatchTime(level, { start: t })} placeholder="Start" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TimePicker value={sched.end} onChange={(t) => setBatchTime(level, { end: t })} placeholder="End" />
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(5)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={goToStep7} disabled={saving}>
                <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Continue'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 7 && (
          <>
            <Text style={styles.title}>Add your logo</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Optional — shown around the app wherever your club is represented. Skip for now if you don't have one handy.</Text>

            <TouchableOpacity style={styles.logoPicker} onPress={pickLogo} disabled={uploadingLogo}>
              {logoUrl ? (
                <Text style={styles.logoPickedText} maxFontSizeMultiplier={1.3}>Logo selected — tap to change</Text>
              ) : (
                <>
                  <Icon name="image-plus" size={28} color={Theme.eyebrowGreen} />
                  <Text style={styles.logoPickerText} maxFontSizeMultiplier={1.3}>{uploadingLogo ? 'Uploading...' : 'Choose an image'}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(6)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={goToStep8} disabled={saving || uploadingLogo}>
                <Text style={styles.buttonText}>{logoUrl ? 'Continue' : 'Skip'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 8 && (
          <>
            <Text style={styles.title}>Allow makeup credits for group lessons?</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Private lesson cancellations always create a makeup credit. Group lessons only do when this is on.</Text>
            <TouchableOpacity style={styles.toggleRow} onPress={() => setAllowGroupMakeup((v) => !v)}>
              <Icon name={allowGroupMakeup ? 'check-circle' : 'radiobox-blank'} size={28} color={allowGroupMakeup ? Theme.eyebrowGreen : Theme.textMuted} />
              <Text style={styles.toggleLabel}>{allowGroupMakeup ? 'On' : 'Off'}</Text>
            </TouchableOpacity>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(7)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={goToStep9} disabled={saving}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 9 && (
          <>
            <Text style={styles.title}>Notification defaults</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Which of these do you (the club owner) want to be notified about? You can change this anytime from the bell icon.</Text>
            {NOTIFICATION_CATEGORIES.map((c) => {
              const enabled = notifPrefs[c.key] ?? true;
              return (
                <TouchableOpacity key={c.key} style={styles.prefRow} onPress={() => setNotifPrefs((prev) => ({ ...prev, [c.key]: !enabled }))}>
                  <Text style={styles.prefLabel}>{c.label}</Text>
                  <Icon name={enabled ? 'check-circle' : 'radiobox-blank'} size={26} color={enabled ? Theme.eyebrowGreen : Theme.textMuted} />
                </TouchableOpacity>
              );
            })}
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(8)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={goToStep10} disabled={saving}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 10 && (
          <>
            <Text style={styles.title}>Your club is ready</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Share these codes to bring in anyone you didn't already add during setup.</Text>

            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>PLAYER JOIN CODE</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeText}>{playerJoinCode}</Text>
              <TouchableOpacity style={styles.codeIconBtn} onPress={() => copyCode(playerJoinCode, 'player')}>
                <Icon name={copiedPlayer ? 'check-circle-outline' : 'content-copy'} size={20} color={copiedPlayer ? '#2ECC71' : Theme.eyebrowGreen} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.hint, { marginTop: 16 }]} maxFontSizeMultiplier={1.3}>COACH JOIN CODE</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeText}>{coachJoinCode}</Text>
              <TouchableOpacity style={styles.codeIconBtn} onPress={() => copyCode(coachJoinCode, 'coach')}>
                <Icon name={copiedCoach ? 'check-circle-outline' : 'content-copy'} size={20} color={copiedCoach ? '#2ECC71' : Theme.eyebrowGreen} />
              </TouchableOpacity>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(9)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={finishSetup} disabled={saving}>
                <Text style={styles.buttonText}>{saving ? 'Finishing...' : 'Finish Setup'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {clubId && hoursCoach && (
        <CoachTimeOffModal
          clubId={clubId}
          coach={hoursCoach}
          visible={!!hoursCoach}
          onClose={closeHoursModal}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 70, paddingBottom: 60 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginTop: 40, textAlign: 'center' },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 14 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  progressDot: { flex: 1, minWidth: 16, height: 4, borderRadius: 2, backgroundColor: Theme.divider },
  progressDotActive: { backgroundColor: Theme.eyebrowGreen },
  stepLabel: { fontFamily: Fonts.sansBold, fontSize: 12, color: Theme.textMuted, letterSpacing: 1, marginBottom: 24 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Theme.textPrimary, marginBottom: 10 },
  subtitle: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, lineHeight: 21, marginBottom: 24 },
  hint: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.textMuted, letterSpacing: 1, marginBottom: 6 },
  errorText: { fontFamily: Fonts.sansRegular, fontSize: 14, color: '#E74C3C', marginTop: 8 },
  open24Row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  open24Text: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textPrimary },
  hoursCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Theme.divider },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hourBox: {
    backgroundColor: Theme.background, borderRadius: 10, borderWidth: 1, borderColor: Theme.divider,
    width: 56, height: 52, textAlign: 'center', fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary,
  },
  hoursColon: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
  meridiemRow: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  meridiemBtn: { paddingHorizontal: 14, paddingVertical: 14, borderRadius: 10, backgroundColor: Theme.background, borderWidth: 1, borderColor: Theme.divider },
  meridiemBtnActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  meridiemText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.textSecondary },
  meridiemTextActive: { color: '#fff' },
  input: {
    backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 16, color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular, fontSize: 16, marginBottom: 6, borderWidth: 1, borderColor: Theme.divider,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
  chipActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  chipText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
  chipTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 18 },
  toggleLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 },
  prefLabel: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textPrimary, flex: 1 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 18 },
  codeText: { fontFamily: Fonts.serifMedium, fontSize: 26, letterSpacing: 4, color: Theme.textPrimary, flex: 1 },
  codeIconBtn: { padding: 6 },
  button: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 16 },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  backBtn: { paddingVertical: 16, paddingHorizontal: 20, marginTop: 28 },
  backBtnText: { fontFamily: Fonts.sansSemiBold, color: Theme.textSecondary, fontSize: 16 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  addRowBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.eyebrowGreen },
  draftRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 14, marginTop: 8, borderWidth: 1, borderColor: Theme.divider },
  draftRowName: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textPrimary },
  draftRowMeta: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  hoursBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1.5 },
  hoursBtnNeeded: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  hoursBtnDone: { backgroundColor: Theme.cardWhite, borderColor: Theme.divider },
  hoursBtnText: { fontFamily: Fonts.sansBold, fontSize: 13 },
  hoursBtnTextNeeded: { color: '#FFFFFF' },
  hoursBtnTextDone: { color: Theme.eyebrowGreen },
  batchCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: Theme.divider },
  batchCardTitle: { fontFamily: Fonts.sansBold, fontSize: 17, color: Theme.textPrimary, marginBottom: 12 },
  logoPicker: {
    alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Theme.cardWhite, borderRadius: 16,
    borderWidth: 1, borderColor: Theme.divider, borderStyle: 'dashed', paddingVertical: 40,
  },
  logoPickerText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.eyebrowGreen },
  logoPickedText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textPrimary },
});
