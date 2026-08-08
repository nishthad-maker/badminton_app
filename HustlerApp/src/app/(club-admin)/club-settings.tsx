import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Switch } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import * as Clipboard from 'expo-clipboard';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/ui';
import {
  getMyClub, generateCoachJoinCode, generatePlayerJoinCode, updateCoachPermissions, getClubSkillLevels, updateClubSkillLevels, DEFAULT_SKILL_LEVELS,
  deactivateCoach, reactivateCoach, promoteCoachToOwner, demoteCoachToStaff,
} from '../../lib/club';
import { getClubCourts, Court } from '../../lib/courts';
import { NoClubPrompt } from '@/components/NoClubPrompt';
import { SetupLockedPlaceholder } from '@/components/SetupLockedPlaceholder';
import { CoachTimeOffModal } from '@/components/CoachTimeOffModal';
import { MaintenanceBlockModal } from '@/components/MaintenanceBlockModal';
import { TimePicker } from '@/components/TimePicker';
import { setPreferredViewMode } from '../../lib/viewMode';

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
  // The real clubs.owner_id — distinct from isOwner (club_coaches.role ===
  // 'owner', which a promoted co-admin also has). Only the true owner's own
  // account cascade-deletes the whole club on "Delete Club & Account" (see
  // handleDeleteClub) — a promoted co-admin deleting THEIR account would
  // only remove their own access, silently leaving the club intact despite
  // what that button claims, so Danger Zone is gated on this instead.
  const [trueOwnerId, setTrueOwnerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [cancellationHours, setCancellationHours] = useState('24');
  const [waitlistClaimHours, setWaitlistClaimHours] = useState('24');
  const [openTime, setOpenTime] = useState<string | null>(null);
  const [closeTime, setCloseTime] = useState<string | null>(null);
  const [coachJoinCode, setCoachJoinCode] = useState('');
  const [playerJoinCode, setPlayerJoinCode] = useState('');
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [pendingCoaches, setPendingCoaches] = useState<CoachRow[]>([]);
  const [timeOffCoach, setTimeOffCoach] = useState<CoachRow | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtDrafts, setCourtDrafts] = useState<Record<string, string>>({});
  const [addCourtCount, setAddCourtCount] = useState('');
  const [addingCourt, setAddingCourt] = useState(false);
  const [savingCourtId, setSavingCourtId] = useState<string | null>(null);
  const [deletingCourtId, setDeletingCourtId] = useState<string | null>(null);
  const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);
  const [inactiveCoaches, setInactiveCoaches] = useState<CoachRow[]>([]);
  const [deactivatingCoachId, setDeactivatingCoachId] = useState<string | null>(null);
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
  const [myId, setMyId] = useState<string | null>(null);
  const [isAlsoCoach, setIsAlsoCoach] = useState(false);
  const [savingAlsoCoach, setSavingAlsoCoach] = useState(false);
  // Grouped, collapsible sections (instead of one long always-expanded
  // scroll) — General/Coaches default open since they're what an owner
  // checks most; the rarer setup-once sections (batches, codes, courts)
  // start collapsed.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ general: true, coaches: true, batches: false, codes: false, courts: false });
  const toggleSection = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setMyId(session.user.id);
      const { data: myProfile } = await supabase.from('profiles').select('is_coach').eq('id', session.user.id).maybeSingle();
      setIsAlsoCoach(!!myProfile?.is_coach);
    }

    const club = await getMyClub();
    if (!club) { setHasClub(false); setLoading(false); setRefreshing(false); return; }
    setHasClub(true);
    setClubId(club.clubId);
    setIsOwner(club.role === 'owner');
    setOnboardingCompleted(club.onboardingCompleted);
    if (!club.onboardingCompleted) { setLoading(false); setRefreshing(false); return; }

    const [{ data: clubRow }, { data: settingsRow }, { data: coachRows }] = await Promise.all([
      supabase.from('clubs').select('name, location, skill_levels, owner_id').eq('id', club.clubId).single(),
      supabase.from('club_settings').select('cancellation_notice_hours, waitlist_claim_hours, coach_join_code, player_join_code, allow_group_makeup, open_time, close_time').eq('club_id', club.clubId).single(),
      supabase.from('club_coaches').select('id, coach_id, role, status, roster_scope, can_edit_other_schedules, assigned_levels, profiles(full_name, coach_username)').eq('club_id', club.clubId),
    ]);

    if (clubRow) {
      setName(clubRow.name); setLocation(clubRow.location ?? ''); setSkillLevels((clubRow as any).skill_levels ?? DEFAULT_SKILL_LEVELS);
      setTrueOwnerId((clubRow as any).owner_id ?? null);
    }
    if (settingsRow) {
      setCancellationHours(String(settingsRow.cancellation_notice_hours));
      setWaitlistClaimHours(String(settingsRow.waitlist_claim_hours));
      setCoachJoinCode(settingsRow.coach_join_code);
      setPlayerJoinCode(settingsRow.player_join_code);
      setAllowGroupMakeup(!!(settingsRow as any).allow_group_makeup);
      setOpenTime((settingsRow as any).open_time ? (settingsRow as any).open_time.slice(0, 5) : null);
      setCloseTime((settingsRow as any).close_time ? (settingsRow as any).close_time.slice(0, 5) : null);
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
    setInactiveCoaches(allCoaches.filter((c: any) => c._status === 'inactive'));

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
    if (openTime && closeTime && closeTime <= openTime) { showAlert('Check your hours', 'Closing time must be after opening time.'); return; }

    setSaving(true);
    // Name/location live on the `clubs` row itself, whose RLS write check
    // only passes for the owner (`is_club_owner`) even though staff coaches
    // can read it — attempting this as staff just throws an RLS error, so
    // skip it entirely rather than eat a silent failure.
    if (isOwner) {
      await supabase.from('clubs').update({ name: name.trim(), location: location.trim() || null }).eq('id', clubId);
    }
    await supabase.from('club_settings').update({
      cancellation_notice_hours: parseInt(cancellationHours, 10) || 24,
      waitlist_claim_hours: parseInt(waitlistClaimHours, 10) || 24,
      open_time: openTime, close_time: closeTime,
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
    const { error } = await supabase.from('club_coaches').update({ status: 'active' }).eq('id', coach.id);
    setBusyId(null);
    load();
    // Get off-time set up right away rather than relying on the owner to
    // remember to do it later — the whole reason this modal exists.
    if (!error) setTimeOffCoach(coach);
  };

  const rejectCoach = (coach: CoachRow) => {
    showConfirm('Reject request?', `Reject ${coach.full_name}'s request to join your club?`, async () => {
      await supabase.from('club_coaches').delete().eq('id', coach.id);
      load();
    });
  };

  // Soft — a hard delete here would orphan/cascade-break their lesson and
  // attendance history. Deactivating just revokes access (is_club_staff
  // requires status = 'active'); Reactivate below undoes it.
  const removeCoach = (coach: CoachRow) => {
    showConfirm(
      'Deactivate coach?',
      `${coach.full_name} will lose access to this club, but their lesson and attendance history stays intact. You can reactivate them later.`,
      async () => {
        setDeactivatingCoachId(coach.id);
        await deactivateCoach(coach.id);
        setDeactivatingCoachId(null);
        load();
      },
      'Deactivate'
    );
  };

  const reactivateCoachRow = async (coach: CoachRow) => {
    setDeactivatingCoachId(coach.id);
    await reactivateCoach(coach.id);
    setDeactivatingCoachId(null);
    load();
  };

  const promoteCoach = (coach: CoachRow) => {
    showConfirm(
      'Make co-admin?',
      `${coach.full_name} will get full access to Club Settings, courts, batches, and the coach roster — the same as you, except they can't delete the club.`,
      async () => {
        setBusyId(coach.id);
        await promoteCoachToOwner(coach.id);
        setBusyId(null);
        load();
      },
      'Make Admin'
    );
  };

  const demoteCoach = (coach: CoachRow) => {
    showConfirm('Remove admin access?', `${coach.full_name} goes back to a regular coach — they'll lose access to Club Settings.`, async () => {
      setBusyId(coach.id);
      await demoteCoachToStaff(coach.id);
      setBusyId(null);
      load();
    }, 'Remove');
  };

  const toggleAlsoCoach = async (value: boolean) => {
    if (!myId) return;
    setSavingAlsoCoach(true);
    const { error } = await supabase.from('profiles').update({ is_coach: value }).eq('id', myId);
    setSavingAlsoCoach(false);
    if (error) { showAlert('Error', 'Could not update this. Please try again.'); return; }
    setIsAlsoCoach(value);
  };

  // The owner already has an active 'owner'-role club_coaches row for this
  // club from signup.tsx's bootstrap insert — flipping is_coach on is all
  // that's needed for getMyClubs()/the (coach-tabs) gate to pick them up.
  const switchToCoachView = async () => {
    await setPreferredViewMode('coach');
    router.replace('/(coach-tabs)/players' as any);
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

  const SectionHeader = ({ id, icon, title, badge, badgeAlert }: { id: string; icon: string; title: string; badge?: number; badgeAlert?: boolean }) => (
    <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => toggleSection(id)} activeOpacity={0.7}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionIconWrap}>
          <Icon name={icon as any} size={20} color={Theme.eyebrowGreen} />
        </View>
        <Text style={styles.sectionHeaderTitle}>{title}</Text>
        {!!badge && (
          <View style={[styles.sectionBadge, badgeAlert && styles.sectionBadgeAlert]}>
            <Text style={styles.sectionBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Icon name={expanded[id] ? 'chevron-up' : 'chevron-down'} size={22} color={Theme.textMuted} />
    </TouchableOpacity>
  );

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
      <Text style={[styles.title, isAlsoCoach && styles.titleWithBanner]}>Club</Text>

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
            {/* My Account — about the signed-in person, not the club, so it
                gets first, unmissable placement instead of being buried
                mid-scroll between the coach roster and Sign Out. */}
            {isOwner && (
              <View style={styles.card}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.sectionIconWrap}>
                      <Icon name="account-circle" size={20} color={Theme.eyebrowGreen} />
                    </View>
                    <Text style={styles.sectionHeaderTitle}>My Account</Text>
                  </View>
                </View>
                <View style={styles.sectionBody}>
                  <View style={styles.dualRoleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dualRoleLabel}>I also coach lessons here</Text>
                      <Text style={styles.dualRoleHint}>
                        {isAlsoCoach ? 'You can switch to the Coach view any time.' : 'Turn this on if you personally coach lessons at your own club.'}
                      </Text>
                    </View>
                    <Switch
                      value={isAlsoCoach}
                      onValueChange={toggleAlsoCoach}
                      trackColor={{ false: Theme.divider, true: Theme.eyebrowGreen }}
                      thumbColor="#FFFFFF"
                      disabled={savingAlsoCoach}
                    />
                  </View>
                  {isAlsoCoach && (
                    <TouchableOpacity style={styles.switchViewBtn} onPress={switchToCoachView}>
                      <Icon name="refresh" size={18} color={Theme.eyebrowGreen} />
                      <Text style={styles.switchViewBtnText}>Switch to Coach View</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            <View style={styles.card}>
              <SectionHeader id="general" icon="home" title="General" />
              {expanded.general && (
                <View style={styles.sectionBody}>
                  {isOwner && (
                    <>
                      <Text style={styles.subheading}>BASIC INFO</Text>
                      <Text style={styles.label} maxFontSizeMultiplier={1.3}>Name</Text>
                      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Club name" placeholderTextColor={Theme.textSecondary} />

                      <Text style={styles.label} maxFontSizeMultiplier={1.3}>Location</Text>
                      <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Toronto, ON" placeholderTextColor={Theme.textSecondary} />
                    </>
                  )}

                  <Text style={[styles.subheading, { marginTop: 6 }]}>HOURS & POLICIES</Text>
                  <Text style={styles.label} maxFontSizeMultiplier={1.3}>Club hours</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <TimePicker value={openTime} onChange={setOpenTime} placeholder="Opens" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TimePicker value={closeTime} onChange={setCloseTime} placeholder="Closes" />
                    </View>
                  </View>
                  <Text style={styles.hint} maxFontSizeMultiplier={1.3}>Default booking window for lessons — coaches can narrow this further with their own working hours.</Text>

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
                    <Icon name={allowGroupMakeup ? 'check-circle' : 'radiobox-blank'} size={26} color={allowGroupMakeup ? Theme.eyebrowGreen : Theme.textMuted} />
                    <Text style={styles.permissionText} maxFontSizeMultiplier={1.3}>Allow makeup credits for group lessons</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {isOwner && (
              <View style={styles.card}>
                <SectionHeader id="batches" icon="school-outline" title="Batch Types" badge={skillLevels.length} />
                {expanded.batches && (
                  <View style={styles.sectionBody}>
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
              </View>
            )}

            {isOwner && (
              <TouchableOpacity style={styles.card} onPress={() => router.push('/(club-admin)/payments' as any)} activeOpacity={0.7}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.sectionIconWrap}>
                      <Icon name="clipboard-text-outline" size={20} color={Theme.eyebrowGreen} />
                    </View>
                    <Text style={styles.sectionHeaderTitle}>Payments</Text>
                  </View>
                  <Icon name="chevron-right" size={22} color={Theme.textMuted} />
                </View>
                <Text style={[styles.hint, { marginTop: 6, marginBottom: 0 }]} maxFontSizeMultiplier={1.3}>Review and approve self-reported lesson payments.</Text>
              </TouchableOpacity>
            )}

            {isOwner && (
              <View style={styles.card}>
                <SectionHeader id="codes" icon="link-variant" title="Join Codes" />
                {expanded.codes && (
                  <View style={styles.sectionBody}>
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
              </View>
            )}

            {isOwner && (
              <View style={styles.card}>
                <SectionHeader id="courts" icon="view-dashboard" title="Courts" badge={courts.length} />
                {expanded.courts && (
                  <View style={styles.sectionBody}>
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

                    <TouchableOpacity style={styles.linkRow} onPress={() => setMaintenanceModalVisible(true)}>
                      <Icon name="hammer-wrench" size={18} color={Theme.eyebrowGreen} />
                      <Text style={styles.linkRowText} maxFontSizeMultiplier={1.3}>Maintenance Blocks</Text>
                      <Icon name="chevron-right" size={18} color={Theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <View style={styles.card}>
              <SectionHeader id="coaches" icon="account-multiple" title="Coaches" badge={pendingCoaches.length} badgeAlert />
              {expanded.coaches && (
                <View style={styles.sectionBody}>
                  {isOwner && pendingCoaches.length > 0 && (
                    <>
                      <Text style={styles.subheading}>PENDING REQUESTS</Text>
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
                      <Text style={[styles.subheading, { marginTop: 14 }]}>ACTIVE ROSTER</Text>
                    </>
                  )}
                  {coaches.length === 0 ? (
                    <Text style={styles.muted} maxFontSizeMultiplier={1.3}>No coaches yet.</Text>
                  ) : (
                    coaches.map((c) => (
                      <View key={c.id} style={styles.coachRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.coachName}>{c.full_name}</Text>
                          <Text style={styles.coachMeta} maxFontSizeMultiplier={1.3}>{c.coach_username ? `@${c.coach_username} · ` : ''}{c.role === 'owner' && c.coach_id !== trueOwnerId ? 'co-admin' : c.role}</Text>
                          {isOwner && c.role === 'owner' && c.coach_id !== trueOwnerId && (
                            <TouchableOpacity style={styles.makeAdminBtn} onPress={() => demoteCoach(c)} disabled={busyId === c.id}>
                              <Text style={styles.makeAdminBtnText}>{busyId === c.id ? '...' : 'Remove Admin'}</Text>
                            </TouchableOpacity>
                          )}
                          {isOwner && c.role !== 'owner' && (
                            <View style={styles.permissionBlock}>
                              {/* Roster-scope / schedule-edit permissions only mean
                                  something once there's someone else's stuff to
                                  scope a coach away from — with just the owner +
                                  one coach there's nothing to restrict, so these
                                  stay hidden until a 3rd coach (2nd staff member)
                                  joins the club. */}
                              {coaches.length >= 3 && (
                                <>
                                  <TouchableOpacity style={styles.permissionRow} onPress={() => toggleRosterScope(c)} disabled={busyId === c.id}>
                                    <Icon name={c.roster_scope === 'full_roster' ? 'check-circle' : 'radiobox-blank'} size={26} color={c.roster_scope === 'full_roster' ? Theme.eyebrowGreen : Theme.textMuted} />
                                    <Text style={styles.permissionText} maxFontSizeMultiplier={1.3}>{c.roster_scope === 'full_roster' ? 'Sees full club roster' : 'Sees only their own players'}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity style={styles.permissionRow} onPress={() => toggleScheduleOverride(c)} disabled={busyId === c.id}>
                                    <Icon name={c.can_edit_other_schedules ? 'check-circle' : 'radiobox-blank'} size={26} color={c.can_edit_other_schedules ? Theme.eyebrowGreen : Theme.textMuted} />
                                    <Text style={styles.permissionText} maxFontSizeMultiplier={1.3}>{c.can_edit_other_schedules ? 'Can edit other coaches\' schedules' : 'Can\'t edit other coaches\' schedules'}</Text>
                                  </TouchableOpacity>
                                </>
                              )}
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
                          <View style={{ alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity onPress={() => promoteCoach(c)} disabled={busyId === c.id}>
                              <Icon name="account-badge" size={22} color={Theme.eyebrowGreen} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => removeCoach(c)} disabled={deactivatingCoachId === c.id}>
                              <Icon name="account-remove-outline" size={22} color="#FF6B6B" />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ))
                  )}

                  {isOwner && inactiveCoaches.length > 0 && (
                    <>
                      <Text style={[styles.subheading, { marginTop: 14 }]}>INACTIVE</Text>
                      {inactiveCoaches.map((c) => (
                        <View key={c.id} style={styles.coachRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.coachName, styles.coachNameInactive]}>{c.full_name}</Text>
                            {c.coach_username && <Text style={styles.coachMeta} maxFontSizeMultiplier={1.3}>@{c.coach_username}</Text>}
                          </View>
                          <TouchableOpacity style={styles.approveBtn} onPress={() => reactivateCoachRow(c)} disabled={deactivatingCoachId === c.id}>
                            <Text style={styles.approveBtnText}>{deactivatingCoachId === c.id ? '...' : 'Reactivate'}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}
            </View>

            <View style={styles.card}>
              <TouchableOpacity onPress={handleSignOut} style={styles.dangerRow}>
                <Icon name="logout" size={26} color={Theme.textSecondary} />
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>

            {/* Gated on the TRUE clubs.owner_id, not the role-based isOwner
                — a promoted co-admin also has role='owner', but "Delete
                Club & Account" cascades from the true owner's own profile
                row (clubs.owner_id -> profiles(id) on delete cascade). A
                co-admin triggering it would only delete their own account,
                silently leaving the club intact despite what this says. */}
            {myId && trueOwnerId && myId === trueOwnerId && (
              <View style={[styles.card, styles.dangerCard]}>
                <Text style={[styles.sectionLabel, styles.dangerLabel]}>DANGER ZONE</Text>
                <TouchableOpacity onPress={handleDeleteClub} disabled={deleting} style={styles.dangerRow}>
                  <Icon name="delete-forever-outline" size={26} color="#E74C3C" />
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

      {timeOffCoach && clubId && (
        <CoachTimeOffModal
          clubId={clubId}
          coach={{ id: timeOffCoach.coach_id, full_name: timeOffCoach.full_name }}
          visible={!!timeOffCoach}
          onClose={() => setTimeOffCoach(null)}
        />
      )}

      {clubId && (
        <MaintenanceBlockModal
          clubId={clubId}
          visible={maintenanceModalVisible}
          onClose={() => setMaintenanceModalVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  title: { fontFamily: Fonts.serifMedium, fontSize: 32, color: Theme.textPrimary, paddingLeft: 60, paddingRight: 24, paddingTop: 60, paddingBottom: 12 },
  // The "Back to Coach" chip (SwitchBackBanner in the tab layout above this
  // screen) already pads for the status bar/notch itself — stacking this
  // screen's own 60px on top of that left a big dead gap before "Club" on
  // phones, so it's trimmed whenever that banner is showing.
  titleWithBanner: { paddingTop: 16 },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  muted: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 20, marginBottom: 20 },
  dangerCard: { borderWidth: 1, borderColor: 'rgba(231,76,60,0.25)' },
  dangerLabel: { color: '#E74C3C' },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dangerText: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: '#E74C3C' },
  signOutText: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: Theme.textPrimary },
  dangerSubText: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, marginTop: 3 },
  sectionLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 14 },
  // Collapsible section header — icon + title (+ optional count badge) on
  // the left, a chevron on the right that flips to show expanded state.
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  sectionIconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: Theme.cardTinted, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 18, color: Theme.textPrimary },
  sectionBadge: { backgroundColor: Theme.textMuted, borderRadius: 11, minWidth: 24, height: 22, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  sectionBadgeAlert: { backgroundColor: '#F39C12' },
  sectionBadgeText: { fontFamily: Fonts.sansBold, fontSize: 12, color: '#FFFFFF' },
  sectionBody: { marginTop: 18 },
  subheading: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Theme.textMuted, letterSpacing: 1, marginBottom: 10 },
  dualRoleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dualRoleLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textPrimary },
  dualRoleHint: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, marginTop: 2 },
  switchViewBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, alignSelf: 'flex-start' },
  switchViewBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.eyebrowGreen },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textSecondary, marginBottom: 8 },
  hint: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, marginBottom: 14, lineHeight: 20 },
  input: {
    backgroundColor: Theme.background,
    borderRadius: 10,
    padding: 16,
    color: Theme.textPrimary,
    fontFamily: Fonts.sansRegular,
    fontSize: 17,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  saveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 15, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: Fonts.sansBold, color: Theme.limeAccentDark, fontSize: 17 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Theme.background, borderRadius: 10, borderWidth: 1, borderColor: Theme.divider, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 18 },
  codeText: { flex: 1, fontFamily: Fonts.serifMedium, fontSize: 24, letterSpacing: 3, color: Theme.eyebrowGreen },
  codeIconBtn: { padding: 4 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: Theme.divider },
  approveBtn: { backgroundColor: Theme.limeAccent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  approveBtnText: { fontFamily: Fonts.sansBold, fontSize: 15, color: Theme.limeAccentDark },
  coachRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderTopWidth: 1, borderTopColor: Theme.divider },
  coachName: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: Theme.textPrimary },
  coachNameInactive: { color: Theme.textSecondary },
  coachMeta: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, marginTop: 2 },
  makeAdminBtn: { alignSelf: 'flex-start', backgroundColor: 'rgba(231,76,60,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 6 },
  makeAdminBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#E74C3C' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: Theme.divider },
  linkRowText: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.textPrimary },
  priceLabel: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary },
  permissionBlock: { marginTop: 10, gap: 8 },
  permissionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permissionText: { fontFamily: Fonts.sansRegular, fontSize: 14, color: Theme.textSecondary, flexShrink: 1 },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Theme.cardTinted, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  levelChipActive: { backgroundColor: Theme.eyebrowGreen },
  levelChipText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Theme.textSecondary },
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
