import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/ui';
import { getMyClub, DEFAULT_SKILL_LEVELS, updateClubSkillLevels } from '../../lib/club';
import { NOTIFICATION_CATEGORIES, getNotificationPreferences, setNotificationPreference } from '../../lib/notifications';

const TOTAL_STEPS = 5;

// The mandatory, one-question-per-screen setup wizard every new club must
// complete before the real dashboard/nav tabs unlock (see dashboard.tsx's
// onboardingCompleted gate, and SetupLockedPlaceholder on the other 3 tabs).
// Deliberately has NO skip/close control anywhere — the only way out is
// finishing step 5. Each step saves to the real column immediately on
// Continue, so backgrounding the app or force-navigating away mid-flow never
// loses progress; re-entering just resumes (still gated until step 5 sets
// onboarding_completed).
export default function ClubOnboardingScreen() {
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubName, setClubName] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Step 1 — skill levels
  const [levels, setLevels] = useState<string[]>(DEFAULT_SKILL_LEVELS);
  const [newLevelDraft, setNewLevelDraft] = useState('');

  // Step 2 — cancellation cutoff
  const [cutoffHours, setCutoffHours] = useState('24');

  // Step 3 — group makeup
  const [allowGroupMakeup, setAllowGroupMakeup] = useState(false);

  // Step 4 — notification defaults
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});

  // Step 5 — join codes
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
      if (session?.user) setMyId(session.user.id);

      const [{ data: clubRow }, { data: settingsRow }] = await Promise.all([
        supabase.from('clubs').select('skill_levels').eq('id', club.clubId).single(),
        supabase.from('club_settings').select('cancellation_notice_hours, allow_group_makeup, player_join_code, coach_join_code').eq('club_id', club.clubId).single(),
      ]);
      if (clubRow?.skill_levels?.length) setLevels(clubRow.skill_levels);
      if (settingsRow) {
        setCutoffHours(String(settingsRow.cancellation_notice_hours ?? 24));
        setAllowGroupMakeup(!!settingsRow.allow_group_makeup);
        setPlayerJoinCode(settingsRow.player_join_code ?? '');
        setCoachJoinCode(settingsRow.coach_join_code ?? '');
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

  const goToStep2 = async () => {
    if (!clubId) return;
    setSaving(true);
    const { ok } = await updateClubSkillLevels(clubId, levels);
    setSaving(false);
    if (!ok) { showAlert('Error', 'Could not save your batch types. Please try again.'); return; }
    setStep(2);
  };

  const goToStep3 = async () => {
    if (!clubId) return;
    setSaving(true);
    const { error } = await supabase.from('club_settings').update({ cancellation_notice_hours: parseInt(cutoffHours, 10) || 24, updated_at: new Date().toISOString() }).eq('club_id', clubId);
    setSaving(false);
    if (error) { showAlert('Error', 'Could not save the cancellation cutoff. Please try again.'); return; }
    setStep(3);
  };

  const goToStep4 = async () => {
    if (!clubId) return;
    setSaving(true);
    const { error } = await supabase.from('club_settings').update({ allow_group_makeup: allowGroupMakeup, updated_at: new Date().toISOString() }).eq('club_id', clubId);
    setSaving(false);
    if (error) { showAlert('Error', 'Could not save the group makeup setting. Please try again.'); return; }
    setStep(4);
  };

  const goToStep5 = async () => {
    if (!myId) return;
    setSaving(true);
    const results = await Promise.all(NOTIFICATION_CATEGORIES.map((c) => setNotificationPreference(myId, c.key, notifPrefs[c.key] ?? true)));
    setSaving(false);
    if (results.some((r) => !r.ok)) { showAlert('Error', 'Could not save notification preferences. Please try again.'); return; }
    setStep(5);
  };

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
            <Text style={styles.title}>What types of batches does your club run?</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Each batch gets its own lesson card — you just add the day/time later. You can add your own on top of the defaults.</Text>
            <View style={styles.chipWrap}>
              {DEFAULT_SKILL_LEVELS.map((level) => (
                <TouchableOpacity key={level} style={[styles.chip, levels.includes(level) && styles.chipActive]} onPress={() => toggleDefaultLevel(level)}>
                  <Text style={[styles.chipText, levels.includes(level) && styles.chipTextActive]} maxFontSizeMultiplier={1.3}>{level}</Text>
                </TouchableOpacity>
              ))}
              {levels.filter((l) => !DEFAULT_SKILL_LEVELS.includes(l)).map((level) => (
                <TouchableOpacity key={level} style={[styles.chip, styles.chipActive]} onPress={() => removeLevel(level)}>
                  <Text style={[styles.chipText, styles.chipTextActive]} maxFontSizeMultiplier={1.3}>{level} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={newLevelDraft} onChangeText={setNewLevelDraft} placeholder="Add a custom batch type" placeholderTextColor={Theme.textSecondary} onSubmitEditing={addCustomLevel} />
              <TouchableOpacity onPress={addCustomLevel}>
                <Icon name="plus-circle" size={30} color={Theme.eyebrowGreen} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={goToStep2} disabled={saving}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Cancellation cutoff window</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>How many hours before a lesson does attendance lock for players/parents? A coach can always override.</Text>
            <TextInput style={styles.input} value={cutoffHours} onChangeText={setCutoffHours} keyboardType="number-pad" placeholder="24" placeholderTextColor={Theme.textSecondary} />
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
            <Text style={styles.title}>Allow makeup credits for group lessons?</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Private lesson cancellations always create a makeup credit. Group lessons only do when this is on.</Text>
            <TouchableOpacity style={styles.toggleRow} onPress={() => setAllowGroupMakeup((v) => !v)}>
              <Icon name={allowGroupMakeup ? 'toggle-switch' : 'toggle-switch-off-outline'} size={32} color={allowGroupMakeup ? Theme.eyebrowGreen : Theme.textMuted} />
              <Text style={styles.toggleLabel}>{allowGroupMakeup ? 'On' : 'Off'}</Text>
            </TouchableOpacity>
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
            <Text style={styles.title}>Notification defaults</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Which of these do you (the club owner) want to be notified about? You can change this anytime from the bell icon.</Text>
            {NOTIFICATION_CATEGORIES.map((c) => {
              const enabled = notifPrefs[c.key] ?? true;
              return (
                <TouchableOpacity key={c.key} style={styles.prefRow} onPress={() => setNotifPrefs((prev) => ({ ...prev, [c.key]: !enabled }))}>
                  <Text style={styles.prefLabel}>{c.label}</Text>
                  <Icon name={enabled ? 'toggle-switch' : 'toggle-switch-off-outline'} size={28} color={enabled ? Theme.eyebrowGreen : Theme.textMuted} />
                </TouchableOpacity>
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
            <Text style={styles.title}>Your club is ready</Text>
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>Share these codes to bring players and coaches in.</Text>

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
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(4)}>
                <Text style={styles.backBtnText} maxFontSizeMultiplier={1.3}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }, saving && styles.buttonDisabled]} onPress={finishSetup} disabled={saving}>
                <Text style={styles.buttonText}>{saving ? 'Finishing...' : 'Finish Setup'}</Text>
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
  scroll: { flexGrow: 1, padding: 24, paddingTop: 70, paddingBottom: 60 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', marginTop: 40, textAlign: 'center' },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 14 },
  progressRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Theme.divider },
  progressDotActive: { backgroundColor: Theme.eyebrowGreen },
  stepLabel: { fontFamily: Fonts.sansBold, fontSize: 12, color: Theme.textMuted, letterSpacing: 1, marginBottom: 24 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Theme.textPrimary, marginBottom: 10 },
  subtitle: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, lineHeight: 21, marginBottom: 24 },
  hint: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Theme.textMuted, letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: Theme.cardWhite, borderRadius: 10, padding: 16, color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular, fontSize: 16, marginBottom: 6, borderWidth: 1, borderColor: Theme.divider,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.divider },
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
});
