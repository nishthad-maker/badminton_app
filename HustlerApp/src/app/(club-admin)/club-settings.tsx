import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import * as Clipboard from 'expo-clipboard';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/ui';
import { getMyClub, generateCoachJoinCode, generatePlayerJoinCode, updateCoachPermissions, getClubSkillLevels, updateClubSkillLevels, DEFAULT_SKILL_LEVELS } from '../../lib/club';
import { getClubCourts, Court } from '../../lib/courts';
import { NoClubPrompt } from '@/components/NoClubPrompt';
import { SetupLockedPlaceholder } from '@/components/SetupLockedPlaceholder';

type CoachRow = {
  id: string;
  coach_id: string;
  role: 'owner' | 'staff';
  full_name: string;
  coach_username: string | null;
  roster_scope: 'own_only' | 'full_roster';
  can_edit_other_schedules: boolean;
  assigned_levels: string[];
};

export default function ClubSettingsScreen() {
  const [hasClub, setHasClub] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [cancellationHours, setCancellationHours] = useState('24');
  const [waitlistClaimHours, setWaitlistClaimHours] = useState('24');
  const [coachJoinCode, setCoachJoinCode] = useState('');
  const [playerJoinCode, setPlayerJoinCode] = useState('');
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [pendingCoaches, setPendingCoaches] = useState<CoachRow[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtDrafts, setCourtDrafts] = useState<Record<string, string>>({});
  const [addCourtCount, setAddCourtCount] = useState('');
  const [addingCourt, setAddingCourt] = useState(false);
  const [savingCourtId, setSavingCourtId] = useState<string | null>(null);
  const [deletingCourtId, setDeletingCourtId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedCoachCode, setCopiedCoachCode] = useState(false);
  const [copiedPlayerCode, setCopiedPlayerCode] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [skillLevels, setSkillLevels] = useState<string[]>(DEFAULT_SKILL_LEVELS);
  const [newLevelDraft, setNewLevelDraft] = useState('');
  const [allowGroupMakeup, setAllowGroupMakeup] = useState(false);
  const [savingLevels, setSavingLevels] = useState(false);

  const load = async () => {
    const club = await getMyClub();
    if (!club) { setHasClub(false); setLoading(false); setRefreshing(false); return; }
    setHasClub(true);
    setClubId(club.clubId);
    setIsOwner(club.role === 'owner');
    setOnboardingCompleted(club.onboardingCompleted);
    if (!club.onboardingCompleted) { setLoading(false); setRefreshing(false); return; }

    const [{ data: clubRow }, { data: settingsRow }, { data: coachRows }] = await Promise.all([
      supabase.from('clubs').select('name, location, skill_levels').eq('id', club.clubId).single(),
      supabase.from('club_settings').select('cancellation_notice_hours, waitlist_claim_hours, coach_join_code, player_join_code, allow_group_makeup').eq('club_id', club.clubId).single(),
      supabase.from('club_coaches').select('id, coach_id, role, status, roster_scope, can_edit_other_schedules, assigned_levels, profiles(full_name, coach_username)').eq('club_id', club.clubId),
    ]);

    if (clubRow) { setName(clubRow.name); setLocation(clubRow.location ?? ''); setSkillLevels((clubRow as any).skill_levels ?? DEFAULT_SKILL_LEVELS); }
    if (settingsRow) {
      setCancellationHours(String(settingsRow.cancellation_notice_hours));
      setWaitlistClaimHours(String(settingsRow.waitlist_claim_hours));
      setCoachJoinCode(settingsRow.coach_join_code);
      setPlayerJoinCode(settingsRow.player_join_code);
      setAllowGroupMakeup(!!(settingsRow as any).allow_group_makeup);
    }

    const allCoaches: CoachRow[] = (coachRows ?? []).map((c: any) => ({
      id: c.id,
      coach_id: c.coach_id,
      role: c.role,
      full_name: c.profiles?.full_name ?? 'Coach',
      coach_username: c.profiles?.coach_username ?? null,
      roster_scope: c.roster_scope,
      can_edit_other_schedules: c.can_edit_other_schedules,
      assigned_levels: c.assigned_levels ?? [],
      _status: c.status,
    })) as any;
    setCoaches(allCoaches.filter((c: any) => c._status === 'active'));
    setPendingCoaches(allCoaches.filter((c: any) => c._status === 'pending'));

    const courtRows = await getClubCourts(club.clubId);
    setCourts(courtRows);
    setCourtDrafts((prev) => {
      const next = { ...prev };
      courtRows.forEach((c) => { if (next[c.id] === undefined) next[c.id] = c.name; });
      return next;
    });

    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const saveDetails = async () => {
    if (!clubId) return;
    if (!name.trim()) { showAlert('Missing name', 'Club name cannot be empty.'); return; }

    setSaving(true);
    await supabase.from('clubs').update({ name: name.trim(), location: location.trim() || null }).eq('id', clubId);
    await supabase.from('club_settings').update({
      cancellation_notice_hours: parseInt(cancellationHours, 10) || 24,
      waitlist_claim_hours: parseInt(waitlistClaimHours, 10) || 24,
      updated_at: new Date().toISOString(),
    }).eq('club_id', clubId);
    setSaving(false);
    showAlert('Saved', 'Club details updated.');
  };

  const toggleRosterScope = async (coach: CoachRow) => {
    setBusyId(coach.id);
    await updateCoachPermissions(coach.id, { rosterScope: coach.roster_scope === 'full_roster' ? 'own_only' : 'full_roster' });
    setBusyId(null);
    load();
  };

  const toggleScheduleOverride = async (coach: CoachRow) => {
    setBusyId(coach.id);
    await updateCoachPermissions(coach.id, { canEditOtherSchedules: !coach.can_edit_other_schedules });
    setBusyId(null);
    load();
  };

  const toggleCoachLevel = async (coach: CoachRow, level: string) => {
    const next = coach.assigned_levels.includes(level)
      ? coach.assigned_levels.filter((l) => l !== level)
      : [...coach.assigned_levels, level];
    setBusyId(coach.id);
    await updateCoachPermissions(coach.id, { assignedLevels: next });
    setBusyId(null);
    load();
  };

  const addSkillLevel = async () => {
    const level = newLevelDraft.trim();
    if (!level || !clubId || skillLevels.includes(level)) { setNewLevelDraft(''); return; }
    setSavingLevels(true);
    const next = [...skillLevels, level];
    await updateClubSkillLevels(clubId, next);
    setSkillLevels(next);
    setNewLevelDraft('');
    setSavingLevels(false);
  };

  const removeSkillLevel = async (level: string) => {
    if (!clubId) return;
    setSavingLevels(true);
    const next = skillLevels.filter((l) => l !== level);
    await updateClubSkillLevels(clubId, next);
    setSkillLevels(next);
    setSavingLevels(false);
  };

  const toggleAllowGroupMakeup = async () => {
    if (!clubId) return;
    const next = !allowGroupMakeup;
    setAllowGroupMakeup(next);
    await supabase.from('club_settings').update({ allow_group_makeup: next, updated_at: new Date().toISOString() }).eq('club_id', clubId);
  };

  const addCourts = async () => {
    const count = Math.max(0, Math.min(50, parseInt(addCourtCount, 10) || 0));
    if (!clubId || count === 0) return;
    setAddingCourt(true);
    const inserts = Array.from({ length: count }, (_, i) => ({ club_id: clubId, name: `Court ${courts.length + i + 1}` }));
    await supabase.from('courts').insert(inserts);
    setAddCourtCount('');
    setAddingCourt(false);
    load();
  };

  const saveCourtName = async (court: Court) => {
    const name = (courtDrafts[court.id] ?? '').trim();
    if (!name) return;
    setSavingCourtId(court.id);
    await supabase.from('courts').update({ name }).eq('id', court.id);
    setSavingCourtId(null);
    load();
  };

  const deleteCourt = (court: Court) => {
    showConfirm('Delete court?', `Remove "${court.name}"? Any tier or lesson assigned to it will just show no court.`, async () => {
      setDeletingCourtId(court.id);
      await supabase.from('courts').delete().eq('id', court.id);
      setDeletingCourtId(null);
      load();
    });
  };

  const copyCode = async () => {
    await Clipboard.setStringAsync(coachJoinCode);
    setCopiedCoachCode(true);
    setTimeout(() => setCopiedCoachCode(false), 2000);
  };

  const regenerateCode = () => {
    showConfirm(
      'Regenerate code?',
      'The old code will stop working immediately — anyone who has it will need the new one.',
      async () => {
        if (!clubId) return;
        const newCode = generateCoachJoinCode();
        await supabase.from('club_settings').update({ coach_join_code: newCode }).eq('club_id', clubId);
        setCoachJoinCode(newCode);
      }
    );
  };

  const copyPlayerCode = async () => {
    await Clipboard.setStringAsync(playerJoinCode);
    setCopiedPlayerCode(true);
    setTimeout(() => setCopiedPlayerCode(false), 2000);
  };

  const regeneratePlayerCode = () => {
    showConfirm(
      'Regenerate code?',
      'The old code will stop working immediately — anyone who has it will need the new one.',
      async () => {
        if (!clubId) return;
        const newCode = generatePlayerJoinCode();
        await supabase.from('club_settings').update({ player_join_code: newCode }).eq('club_id', clubId);
        setPlayerJoinCode(newCode);
      }
    );
  };

  const approveCoach = async (coach: CoachRow) => {
    setBusyId(coach.id);
    await supabase.from('club_coaches').update({ status: 'active' }).eq('id', coach.id);
    setBusyId(null);
    load();
  };

  const rejectCoach = (coach: CoachRow) => {
    showConfirm('Reject request?', `Reject ${coach.full_name}'s request to join your club?`, async () => {
      await supabase.from('club_coaches').delete().eq('id', coach.id);
      load();
    });
  };

  const removeCoach = (coach: CoachRow) => {
    showConfirm('Remove coach?', `Remove ${coach.full_name} from your club?`, async () => {
      await supabase.from('club_coaches').delete().eq('id', coach.id);
      load();
    });
  };

  const handleSignOut = () => {
    showConfirm('Sign out', 'Are you sure you want to sign out?', async () => {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') window.location.href = '/';
      else router.replace('/' as any);
    });
  };

  const handleDeleteClub = () => {
    showConfirm(
      'Delete Club & Account',
      'This permanently deletes your club — every coach\'s access, all group tiers, private lessons, waitlist entries, and payment records — plus your own account. This cannot be undone.',
      () => {
        showConfirm(
          'Are you absolutely sure?',
          'This really is permanent. Your club and account will be gone forever.',
          async () => {
            setDeleting(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session?.user) return;
              const userId = session.user.id;

              // Deleting the profile cascades through clubs (owner_id) and
              // every club table beneath it (club_settings, club_coaches,
              // club_members, group_tiers, schedule_assignments/exceptions,
              // tournament blocks, makeup credits, waitlist_entries,
              // lesson_payments).
              await supabase.from('notifications').delete().eq('user_id', userId);
              await supabase.from('exercise_settings').delete().eq('user_id', userId);
              await supabase.from('usernames').delete().eq('user_id', userId);
              await supabase.from('community_posts').delete().eq('user_id', userId);
              await supabase.from('post_replies').delete().eq('user_id', userId);
              await supabase.from('post_likes').delete().eq('user_id', userId);
              await supabase.from('post_reports').delete().eq('reported_by', userId);
              await supabase.from('opponent_log_messages').delete().eq('sender_id', userId);
              await supabase.from('profiles').delete().eq('id', userId);

              // Table rows are gone at this point, but the actual Supabase
              // Auth user still exists — the client SDK has no ability to
              // delete it (that requires the service-role key), so a small
              // edge function does it last, while the session is still valid.
              const { error: authDeleteError } = await supabase.functions.invoke('delete-account');
              if (authDeleteError) {
                console.log('Auth account deletion error:', authDeleteError);
                showAlert('Partial deletion', 'Your club and data were removed, but we couldn\'t fully close your account. Please contact support so your email can be freed up.');
              }

              await supabase.auth.signOut();
              if (typeof window !== 'undefined') window.location.href = '/';
              else router.replace('/' as any);
            } catch (e) {
              console.log('Delete club error:', e);
              showAlert('Error', 'Could not delete your club. Please contact support.');
            } finally {
              setDeleting(false);
            }
          }
        );
      }
    );
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Club</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.eyebrowGreen} colors={[Theme.eyebrowGreen]} />}
      >
        {loading ? (
          <Text style={styles.muted} maxFontSizeMultiplier={1.3}>Loading...</Text>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>CLUB DETAILS</Text>
              <Text style={styles.label} maxFontSizeMultiplier={1.3}>Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Club name" placeholderTextColor={Theme.textSecondary} />

              <Text style={styles.label} maxFontSizeMultiplier={1.3}>Location</Text>
              <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Toronto, ON" placeholderTextColor={Theme.textSecondary} />

              <Text style={styles.label} maxFontSizeMultiplier={1.3}>Cancellation notice (hours)</Text>
              <TextInput
                style={styles.input}
                value={cancellationHours}
                onChangeText={setCancellationHours}
                keyboardType="number-pad"
                placeholder="24"
                placeholderTextColor={Theme.textSecondary}
              />

              <Text style={styles.label} maxFontSizeMultiplier={1.3}>Waitlist claim window (hours)</Text>
              <TextInput
                style={styles.input}
                value={waitlistClaimHours}
                onChangeText={setWaitlistClaimHours}
                keyboardType="number-pad"
                placeholder="24"
                placeholderTextColor={Theme.textSecondary}
              />
              <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Time a waitlisted player has to claim an open slot before it passes to the next person.</Text>

              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={saveDetails} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Details'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.permissionRow, { marginTop: 14 }]} onPress={toggleAllowGroupMakeup}>
                <Icon name={allowGroupMakeup ? 'toggle-switch' : 'toggle-switch-off-outline'} size={26} color={allowGroupMakeup ? Theme.eyebrowGreen : Theme.textMuted} />
                <Text style={styles.permissionText} maxFontSizeMultiplier={1.3}>Allow makeup credits for group lessons</Text>
              </TouchableOpacity>
            </View>

            {isOwner && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>BATCH TYPES</Text>
                <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Each one gets its own lesson card automatically.</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }}>
                  {skillLevels.map((level) => (
                    <View key={level} style={styles.levelChip}>
                      <Text style={styles.levelChipText} maxFontSizeMultiplier={1.3}>{level}</Text>
                      <TouchableOpacity onPress={() => removeSkillLevel(level)} disabled={savingLevels}>
                        <Icon name="close-circle-outline" size={16} color={Theme.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={newLevelDraft}
                    onChangeText={setNewLevelDraft}
                    placeholder="Add a batch type"
                    placeholderTextColor={Theme.textSecondary}
                    onSubmitEditing={addSkillLevel}
                  />
                  <TouchableOpacity onPress={addSkillLevel} disabled={savingLevels}>
                    <Icon name="plus-circle" size={28} color={Theme.eyebrowGreen} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {isOwner && (
              <TouchableOpacity style={styles.card} onPress={() => router.push('/(club-admin)/payments' as any)}>
                <View style={styles.coachRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionLabel}>PAYMENTS</Text>
                    <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Review and approve self-reported lesson payments.</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={Theme.textMuted} />
                </View>
              </TouchableOpacity>
            )}

            {isOwner && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>JOIN CODES</Text>
                <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Coaches and players enter these to request joining your club.</Text>

                <Text style={styles.label} maxFontSizeMultiplier={1.3}>Coach</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.codeText}>{coachJoinCode}</Text>
                  <TouchableOpacity style={styles.codeIconBtn} onPress={copyCode}>
                    <Icon name={copiedCoachCode ? 'check-circle-outline' : 'content-copy'} size={20} color={copiedCoachCode ? '#2ECC71' : Theme.eyebrowGreen} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.codeIconBtn} onPress={regenerateCode}>
                    <Icon name="account-edit-outline" size={20} color={Theme.textSecondary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label} maxFontSizeMultiplier={1.3}>Player</Text>
                <View style={[styles.codeRow, { marginBottom: 0 }]}>
                  <Text style={styles.codeText}>{playerJoinCode}</Text>
                  <TouchableOpacity style={styles.codeIconBtn} onPress={copyPlayerCode}>
                    <Icon name={copiedPlayerCode ? 'check-circle-outline' : 'content-copy'} size={20} color={copiedPlayerCode ? '#2ECC71' : Theme.eyebrowGreen} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.codeIconBtn} onPress={regeneratePlayerCode}>
                    <Icon name="account-edit-outline" size={20} color={Theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {isOwner && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>COURTS</Text>
                {courts.length === 0 ? (
                  <Text style={styles.muted} maxFontSizeMultiplier={1.3}>No courts yet — add some below.</Text>
                ) : (
                  courts.map((c) => (
                    <View key={c.id} style={styles.priceRow}>
                      <TextInput
                        style={[styles.priceInput, { flex: 1, width: undefined }]}
                        value={courtDrafts[c.id] ?? ''}
                        onChangeText={(t) => setCourtDrafts((prev) => ({ ...prev, [c.id]: t }))}
                        placeholder="Court name"
                        placeholderTextColor={Theme.textSecondary}
                      />
                      <TouchableOpacity onPress={() => saveCourtName(c)} disabled={savingCourtId === c.id}>
                        <Icon name="check-circle-outline" size={20} color={Theme.eyebrowGreen} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteCourt(c)} disabled={deletingCourtId === c.id}>
                        <Icon name="trash-can-outline" size={20} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
                <Text style={[styles.hint, { marginTop: courts.length ? 14 : 0, marginBottom: 8 }]} maxFontSizeMultiplier={1.3}>Add more courts — rename them above afterward.</Text>
                <View style={styles.priceRow}>
                  <TextInput
                    style={[styles.priceInput, { flex: 1, width: undefined }]}
                    value={addCourtCount}
                    onChangeText={setAddCourtCount}
                    placeholder="e.g. 5"
                    placeholderTextColor={Theme.textSecondary}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity onPress={addCourts} disabled={addingCourt || !(parseInt(addCourtCount, 10) > 0)}>
                    <Icon name="plus-circle-outline" size={22} color={Theme.limeAccentDark} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {isOwner && pendingCoaches.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>PENDING COACH REQUESTS</Text>
                {pendingCoaches.map((c) => (
                  <View key={c.id} style={styles.requestRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.coachName}>{c.full_name}</Text>
                      {c.coach_username && <Text style={styles.coachMeta} maxFontSizeMultiplier={1.3}>@{c.coach_username}</Text>}
                    </View>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => approveCoach(c)} disabled={busyId === c.id}>
                      <Text style={styles.approveBtnText}>{busyId === c.id ? '...' : 'Approve'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => rejectCoach(c)}>
                      <Icon name="close-circle-outline" size={22} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>COACHES</Text>
              {coaches.length === 0 ? (
                <Text style={styles.muted} maxFontSizeMultiplier={1.3}>No coaches yet.</Text>
              ) : (
                coaches.map((c) => (
                  <View key={c.id} style={styles.coachRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.coachName}>{c.full_name}</Text>
                      <Text style={styles.coachMeta} maxFontSizeMultiplier={1.3}>{c.coach_username ? `@${c.coach_username} · ` : ''}{c.role}</Text>
                      {isOwner && c.role !== 'owner' && (
                        <View style={styles.permissionBlock}>
                          <TouchableOpacity style={styles.permissionRow} onPress={() => toggleRosterScope(c)} disabled={busyId === c.id}>
                            <Icon name={c.roster_scope === 'full_roster' ? 'toggle-switch' : 'toggle-switch-off-outline'} size={26} color={c.roster_scope === 'full_roster' ? Theme.eyebrowGreen : Theme.textMuted} />
                            <Text style={styles.permissionText} maxFontSizeMultiplier={1.3}>{c.roster_scope === 'full_roster' ? 'Sees full club roster' : 'Sees only their own players'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.permissionRow} onPress={() => toggleScheduleOverride(c)} disabled={busyId === c.id}>
                            <Icon name={c.can_edit_other_schedules ? 'toggle-switch' : 'toggle-switch-off-outline'} size={26} color={c.can_edit_other_schedules ? Theme.eyebrowGreen : Theme.textMuted} />
                            <Text style={styles.permissionText} maxFontSizeMultiplier={1.3}>{c.can_edit_other_schedules ? 'Can edit other coaches\' schedules' : 'Can\'t edit other coaches\' schedules'}</Text>
                          </TouchableOpacity>
                          {skillLevels.length > 0 && (
                            <View style={{ marginTop: 8 }}>
                              <Text style={styles.priceLabel} maxFontSizeMultiplier={1.3}>Assigned batches</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                {skillLevels.map((level) => {
                                  const active = c.assigned_levels.includes(level);
                                  return (
                                    <TouchableOpacity
                                      key={level}
                                      style={[styles.levelChip, active && styles.levelChipActive]}
                                      onPress={() => toggleCoachLevel(c, level)}
                                      disabled={busyId === c.id}
                                    >
                                      <Text style={[styles.levelChipText, active && styles.levelChipTextActive]} maxFontSizeMultiplier={1.3}>{level}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                    {isOwner && c.role !== 'owner' && (
                      <TouchableOpacity onPress={() => removeCoach(c)}>
                        <Icon name="account-remove-outline" size={22} color="#FF6B6B" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <TouchableOpacity onPress={handleSignOut} style={styles.dangerRow}>
                <Icon name="logout" size={24} color={Theme.textSecondary} />
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>

            {isOwner && (
              <View style={[styles.card, styles.dangerCard]}>
                <Text style={[styles.sectionLabel, styles.dangerLabel]}>DANGER ZONE</Text>
                <TouchableOpacity onPress={handleDeleteClub} disabled={deleting} style={styles.dangerRow}>
                  <Icon name="delete-forever-outline" size={24} color="#E74C3C" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerText}>{deleting ? 'Deleting...' : 'Delete Club & Account'}</Text>
                    <Text style={styles.dangerSubText} maxFontSizeMultiplier={1.3}>Permanently deletes your club and your own account</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  title: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary, padding: 24, paddingTop: 60, paddingBottom: 10 },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 20 },
  dangerCard: { borderWidth: 1, borderColor: 'rgba(231,76,60,0.25)' },
  dangerLabel: { color: '#E74C3C' },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dangerText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: '#E74C3C' },
  signOutText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  dangerSubText: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, marginTop: 3 },
  sectionLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 14 },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textSecondary, marginBottom: 8 },
  hint: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, marginBottom: 14, lineHeight: 19 },
  input: {
    backgroundColor: Theme.background,
    borderRadius: 10,
    padding: 16,
    color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular,
    fontSize: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  saveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 16 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.background, borderRadius: 10, borderWidth: 1, borderColor: Theme.divider, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 18 },
  codeText: { flex: 1, fontFamily: Fonts.serifMedium, fontSize: 22, letterSpacing: 3, color: Theme.eyebrowGreen },
  codeIconBtn: { padding: 4 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Theme.divider },
  approveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  approveBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.limeAccentDark },
  coachRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: Theme.divider },
  coachName: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  coachMeta: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  priceLabel: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary },
  permissionBlock: { marginTop: 10, gap: 6 },
  permissionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permissionText: { fontFamily: Fonts.sansRegular, fontSize: 13, color: Theme.textSecondary, flexShrink: 1 },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Theme.cardTinted, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  levelChipActive: { backgroundColor: Theme.eyebrowGreen },
  levelChipText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textSecondary },
  levelChipTextActive: { color: '#fff' },
  priceInput: {
    backgroundColor: Theme.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Theme.divider,
    width: 80,
  },
});
