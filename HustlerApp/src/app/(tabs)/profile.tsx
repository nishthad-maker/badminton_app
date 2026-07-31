import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { Icon } from '@/components/icons/Icon';
import { getLinkedParents, getOrCreatePlayerShareCode, regeneratePlayerShareCode, unlink, getPendingParentRequests, acceptLink, declineLink, LinkedPerson, PendingRequest } from '../../lib/parentLink';
import { getPlayerClubMembership, getPendingClubJoinRequest, requestJoinClubAsPlayer, leaveClub, PlayerClubMembership, PendingClubJoinRequest } from '../../lib/club';
import { getClubCoachesForPlayer, PlayerCoach } from '../../lib/playerClub';

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Strength',
  footwork: 'Footwork',
  endurance: 'Endurance',
  recovery: 'Recovery',
};

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'footprints',
  endurance: 'lightning-bolt',
  recovery: 'heart-pulse',
};

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [streak, setStreak] = useState(0);
  const [memberSince, setMemberSince] = useState('');
  const [topCategoryKey, setTopCategoryKey] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [linkedParents, setLinkedParents] = useState<LinkedPerson[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clubMembership, setClubMembership] = useState<PlayerClubMembership | null>(null);
  const [pendingClubRequest, setPendingClubRequest] = useState<PendingClubJoinRequest | null>(null);
  const [myCoaches, setMyCoaches] = useState<PlayerCoach[]>([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  const countUniqueSessions = (data: any[]) =>
    new Set(data.map(s => `${new Date(s.created_at).toDateString()}_${s.category}`)).size;

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/login' as any); return; }
    setUser(session.user);
    setMemberSince(new Date(session.user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (profileData) setProfile(profileData);

    setLinkedParents(await getLinkedParents(session.user.id));
    setPendingRequests(await getPendingParentRequests(session.user.id));

    const membership = await getPlayerClubMembership(session.user.id);
    setClubMembership(membership);
    if (membership) {
      setPendingClubRequest(null);
      setMyCoaches(await getClubCoachesForPlayer(session.user.id, membership.clubId));
    } else {
      setPendingClubRequest(await getPendingClubJoinRequest(session.user.id));
      setMyCoaches([]);
    }

    const { data } = await supabase
      .from('session_logs').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
    if (!data) return;

    setTotalSessions(countUniqueSessions(data));

    // Training days grow the streak, planned rest days hold it steady, a missed
    // training day breaks it. Mirrors the Home tab's streak logic — keep in sync.
    const dates = [...new Set(data.map((s: any) => new Date(s.created_at).toDateString()))];
    const { data: restEvents } = await supabase
      .from('calendar_events').select('event_date').eq('user_id', session.user.id).eq('event_type', 'rest');
    const restDates = new Set((restEvents ?? []).map((e: any) => new Date(e.event_date + 'T00:00:00').toDateString()));
    let currentStreak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dStr = d.toDateString();
      if (dates.includes(dStr)) currentStreak++;
      else if (restDates.has(dStr)) continue;
      else if (i === 0) continue;
      else break;
    }
    setStreak(currentStreak);

    const byCat: Record<string, Set<string>> = {};
    data.forEach((s: any) => {
      if (!byCat[s.category]) byCat[s.category] = new Set();
      byCat[s.category].add(new Date(s.created_at).toDateString());
    });
    const top = Object.entries(byCat).sort((a, b) => b[1].size - a[1].size)[0];
    if (top) setTopCategoryKey(top[0]);
  };

  const handleSignOut = async () => {
    showConfirm('Sign out', 'Are you sure you want to sign out?', async () => {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') window.location.href = '/';
      else router.replace('/' as any);
    });
  };

  const openCodeModal = async () => {
    setShowCodeModal(true);
    setGeneratingCode(true);
    setLinkCode(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const code = await getOrCreatePlayerShareCode(session.user.id);
      setLinkCode(code);
      if (!code) showAlert('Error', 'Could not generate a code. Please try again.');
    }
    setGeneratingCode(false);
  };

  const regenerateCode = () => {
    showConfirm('Regenerate code?', 'Your old code will stop working immediately — anyone who has it will need the new one.', async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      setGeneratingCode(true);
      const code = await regeneratePlayerShareCode(session.user.id);
      setLinkCode(code);
      setGeneratingCode(false);
    });
  };

  const copyCode = async () => {
    if (!linkCode) return;
    await Clipboard.setStringAsync(linkCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevokeParent = (parent: LinkedPerson) => {
    showConfirm('Unlink parent?', `Remove ${parent.fullName}'s access to your account?`, async () => {
      const ok = await unlink(parent.linkId);
      if (ok) setLinkedParents((prev) => prev.filter((p) => p.linkId !== parent.linkId));
      else showAlert('Error', 'Could not unlink. Please try again.');
    });
  };

  const handleAcceptRequest = async (request: PendingRequest) => {
    setBusyRequestId(request.linkId);
    const ok = await acceptLink(request, profile?.full_name ?? 'Your child');
    setBusyRequestId(null);
    if (!ok) { showAlert('Error', 'Could not accept this request. Please try again.'); return; }
    setPendingRequests((prev) => prev.filter((r) => r.linkId !== request.linkId));
    loadProfile();
  };

  const handleDeclineRequest = (request: PendingRequest) => {
    showConfirm('Decline request?', `Decline ${request.parentName}'s request to link to your account?`, async () => {
      setBusyRequestId(request.linkId);
      const ok = await declineLink(request.linkId);
      setBusyRequestId(null);
      if (ok) setPendingRequests((prev) => prev.filter((r) => r.linkId !== request.linkId));
      else showAlert('Error', 'Could not decline. Please try again.');
    });
  };

  const handleDeleteAccount = () => {
    showConfirm(
      'Delete Account',
      'This will permanently delete your account and all your data — sessions, notes, routines, everything. This cannot be undone.',
      () => {
        showConfirm(
          'Are you absolutely sure?',
          'Type "delete" to confirm — just kidding, but this really is permanent. Your account will be gone forever.',
          async () => {
            setDeletingAccount(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session?.user) return;
              const userId = session.user.id;

              // Delete all user data
              await supabase.from('session_logs').delete().eq('user_id', userId);
              await supabase.from('custom_exercises').delete().eq('user_id', userId);
              await supabase.from('voice_notes').delete().eq('user_id', userId);
              await supabase.from('calendar_events').delete().eq('user_id', userId);
              await supabase.from('routines').delete().eq('user_id', userId);
              await supabase.from('coach_connections').delete().eq('player_id', userId);
              await supabase.from('coach_connections').delete().eq('coach_id', userId);
              await supabase.from('assignment_proof').delete().eq('player_id', userId);
              await supabase.from('notifications').delete().eq('user_id', userId);
              await supabase.from('coach_player_notes').delete().eq('coach_id', userId);
              await supabase.from('coach_player_notes').delete().eq('player_id', userId);
              await supabase.from('coach_schedule_events').delete().eq('player_id', userId);
              await supabase.from('parent_children').delete().eq('player_id', userId);
              await supabase.from('parent_link_codes').delete().eq('player_id', userId);
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
                Alert.alert('Partial deletion', 'Your data was removed, but we couldn\'t fully close your account. Please contact support so your email can be freed up.');
              }

              await supabase.auth.signOut();
              if (typeof window !== 'undefined') window.location.href = '/';
              else router.replace('/' as any);
            } catch (e) {
              console.log('Delete account error:', e);
              Alert.alert('Error', 'Could not delete account. Please contact support.');
            } finally {
              setDeletingAccount(false);
            }
          }
        );
      }
    );
  };

  const openJoinModal = () => { setJoinCode(''); setShowJoinModal(true); };

  const submitJoinCode = async () => {
    if (!joinCode.trim()) { showAlert('Missing code', 'Please enter the club\'s join code.'); return; }
    setJoining(true);
    const result = await requestJoinClubAsPlayer(joinCode);
    setJoining(false);
    if (!result.ok) { showAlert('Could not join', result.message); return; }
    setShowJoinModal(false);
    setJoinCode('');
    showAlert('Request sent', `Your request to join ${result.clubName} is waiting on the club's approval.`);
    loadProfile();
  };

  const handleLeaveClub = () => {
    if (!clubMembership) return;
    showConfirm('Leave this club?', `Leave ${clubMembership.clubName}? This removes your schedule and progress from their view — you can always rejoin with a code later.`, async () => {
      const ok = await leaveClub(clubMembership.id);
      if (ok) loadProfile();
      else showAlert('Error', 'Could not leave the club. Please try again.');
    });
  };

  const goTo = (path: string) => {
    if (typeof window !== 'undefined') window.location.href = path;
    else router.push(path as any);
  };

  const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Athlete';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const topCatTheme = topCategoryKey ? CategoryTheme[topCategoryKey as keyof typeof CategoryTheme] : null;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {memberSince ? (
            <View style={styles.memberBadge}>
              <Icon name="calendar-check" size={15} color={Theme.eyebrowGreen} />
              <Text style={styles.memberText}>Member since {memberSince}</Text>
            </View>
          ) : null}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{streak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{Math.ceil(totalSessions / 4) || 0}</Text>
            <Text style={styles.statLabel}>Weeks Active</Text>
          </View>
        </View>

        {/* Profile info */}
        {profile?.age ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>YOUR PROFILE</Text>
            <View style={styles.infoGrid}>
              {[
                { label: 'Age', value: profile.age },
                { label: 'Gender', value: profile.gender },
                { label: 'Skill Level', value: profile.skill_level },
                { label: 'Event', value: profile.event },
              ].filter(i => i.value).map(item => (
                <View key={item.label} style={styles.infoItem}>
                  <Text style={styles.infoLabel}>{item.label}</Text>
                  <Text style={styles.infoValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Most trained */}
        {topCategoryKey ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>MOST TRAINED</Text>
            <View style={styles.topCatRow}>
              <View style={[styles.topCatIcon, { backgroundColor: topCatTheme?.bg }]}>
                <Icon name={CATEGORY_ICONS[topCategoryKey] as any} size={26} color={topCatTheme?.fg} />
              </View>
              <View>
                <Text style={styles.topCat}>{CATEGORY_LABELS[topCategoryKey] ?? topCategoryKey}</Text>
                <Text style={styles.topCatDesc}>Keep it up — consistency is key!</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Journal */}
        <Text style={styles.sectionTitle}>Journal</Text>
        <View style={styles.optionsCard}>
          <TouchableOpacity style={styles.option} onPress={() => goTo('/journal-history')}>
            <Icon name="notebook-edit-outline" size={24} color={Theme.eyebrowGreen} />
            <Text style={styles.optionText}>Journal History</Text>
            <Icon name="chevron-right" size={24} color={Theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Coaching */}
        <Text style={styles.sectionTitle}>Coaching</Text>
        <View style={styles.optionsCard}>
          <TouchableOpacity style={styles.option} onPress={() => goTo('/my-coaches')}>
            <Icon name="whistle-outline" size={24} color={Theme.eyebrowGreen} />
            <Text style={styles.optionText}>My Coaches</Text>
            <Icon name="chevron-right" size={24} color={Theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* My Club */}
        <Text style={styles.sectionTitle}>My Club</Text>
        <View style={styles.optionsCard}>
          {clubMembership ? (
            <>
              <View style={styles.option}>
                <Icon name="account-badge" size={24} color={Theme.eyebrowGreen} />
                <Text style={styles.optionText}>Member of {clubMembership.clubName}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.clubDetail}>
                <Text style={styles.clubLabel}>COACHES</Text>
                {myCoaches.length === 0 ? (
                  <Text style={styles.clubEmptyText}>Not assigned yet</Text>
                ) : (
                  myCoaches.map((c) => (
                    <View key={c.id} style={[styles.coachRow, !c.isPriority && { opacity: 0.5 }]}>
                      <Text style={styles.clubValue}>{c.full_name}</Text>
                      {!c.isPriority && (
                        <View style={styles.viewOnlyPill}>
                          <Icon name="eye-outline" size={12} color={Theme.textMuted} />
                          <Text style={styles.viewOnlyPillText}>View only</Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.option} onPress={() => router.push('/(tabs)/calendar' as any)}>
                <Icon name="calendar-clock-outline" size={24} color={Theme.eyebrowGreen} />
                <Text style={styles.optionText}>Tournaments, makeups & schedule requests</Text>
                <Icon name="chevron-right" size={24} color={Theme.textMuted} />
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.option} onPress={handleLeaveClub}>
                <Icon name="account-remove-outline" size={24} color="#E74C3C" />
                <Text style={[styles.optionText, styles.dangerText]}>Leave Club</Text>
              </TouchableOpacity>
            </>
          ) : pendingClubRequest ? (
            <View style={styles.option}>
              <Icon name="account-badge-outline" size={24} color={Theme.eyebrowGreen} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionText}>Request pending</Text>
                <Text style={styles.dangerSubText}>Waiting on {pendingClubRequest.clubName}'s approval.</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.option} onPress={openJoinModal}>
              <Icon name="account-badge-outline" size={24} color={Theme.eyebrowGreen} />
              <Text style={styles.optionText}>Join a Club</Text>
              <Icon name="chevron-right" size={24} color={Theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Family */}
        {pendingRequests.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Parent Requests</Text>
            <View style={styles.optionsCard}>
              {pendingRequests.map((request, i) => (
                <View key={request.linkId}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.option}>
                    <Icon name="account-alert-outline" size={24} color={Theme.eyebrowGreen} />
                    <Text style={styles.optionText}>{request.parentName} wants to link</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 16, paddingBottom: 14, paddingLeft: 38 }}>
                    <TouchableOpacity onPress={() => handleAcceptRequest(request)} disabled={busyRequestId === request.linkId}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: Theme.eyebrowGreen }}>{busyRequestId === request.linkId ? '...' : 'Accept'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeclineRequest(request)} disabled={busyRequestId === request.linkId}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#FF6B6B' }}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Family</Text>
        <View style={styles.optionsCard}>
          {linkedParents.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyRowText}>No parents linked yet.</Text>
            </View>
          ) : (
            linkedParents.map((parent, i) => (
              <View key={parent.linkId}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.option}>
                  <Icon name="account-circle" size={24} color={Theme.eyebrowGreen} />
                  <Text style={styles.optionText}>{parent.fullName}</Text>
                  <TouchableOpacity onPress={() => handleRevokeParent(parent)}>
                    <Icon name="account-remove-outline" size={22} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <View style={styles.divider} />
          <TouchableOpacity style={styles.option} onPress={openCodeModal}>
            <Icon name="account-plus-outline" size={24} color={Theme.eyebrowGreen} />
            <Text style={styles.optionText}>Link a Parent</Text>
            <Icon name="chevron-right" size={24} color={Theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.optionsCard}>
          <TouchableOpacity style={styles.option} onPress={() => goTo('/edit-profile')}>
            <Icon name="account-edit-outline" size={24} color={Theme.eyebrowGreen} />
            <Text style={styles.optionText}>Edit Profile</Text>
            <Icon name="chevron-right" size={24} color={Theme.textMuted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.option} onPress={handleSignOut}>
            <Icon name="logout" size={24} color={Theme.textSecondary} />
            <Text style={styles.optionText}>Sign Out</Text>
            <Icon name="chevron-right" size={24} color={Theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Danger zone */}
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <View style={[styles.optionsCard, styles.dangerCard]}>
          <TouchableOpacity
            style={styles.option}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          >
            <Icon name="delete-forever-outline" size={24} color="#E74C3C" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionText, styles.dangerText]}>
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </Text>
              <Text style={styles.dangerSubText}>Permanently delete your account and all data</Text>
            </View>
            <Icon name="chevron-right" size={24} color="#E74C3C" />
          </TouchableOpacity>
        </View>

        <Text style={styles.appVersion}>Hustler · Built for badminton athletes</Text>

      </ScrollView>

      <Modal visible={showCodeModal} transparent animationType="fade" onRequestClose={() => setShowCodeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Link a Parent</Text>
              <TouchableOpacity onPress={() => setShowCodeModal(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            {generatingCode ? (
              <Text style={styles.muted}>Generating code...</Text>
            ) : linkCode ? (
              <>
                <Text style={styles.codeText}>{linkCode}</Text>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <TouchableOpacity style={styles.copyBtn} onPress={copyCode}>
                    <Icon name={copied ? 'check-circle-outline' : 'content-copy'} size={18} color={copied ? '#2ECC71' : Theme.eyebrowGreen} />
                    <Text style={[styles.copyBtnText, copied && { color: '#2ECC71' }]}>{copied ? 'Copied' : 'Copy Code'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.copyBtn} onPress={regenerateCode}>
                    <Icon name="refresh" size={18} color={Theme.textSecondary} />
                    <Text style={styles.copyBtnText}>Regenerate</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.codeHint}>Share this code with your parent — they'll enter it in their app to send a link request, which you'll need to accept. This code is permanent and doesn't expire, so only share it with someone you trust; you can regenerate it any time.</Text>
              </>
            ) : (
              <Text style={styles.muted}>Could not generate a code. Please try again.</Text>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showJoinModal} transparent animationType="fade" onRequestClose={() => setShowJoinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join a Club</Text>
              <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.joinCodeInput}
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              placeholder="P12345"
              placeholderTextColor={Theme.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
            <TouchableOpacity style={[styles.copyBtn, { justifyContent: 'center', width: '100%' }, joining && { opacity: 0.6 }]} onPress={submitJoinCode} disabled={joining}>
              <Text style={styles.copyBtnText}>{joining ? 'Sending...' : 'Send Request'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 130 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 108, height: 108, borderRadius: 54, backgroundColor: Theme.eyebrowGreen, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  avatarInitials: { fontSize: 40, fontWeight: 'bold', color: '#fff' },
  name: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary, marginBottom: 6 },
  email: { fontSize: 16, color: Theme.textSecondary, marginBottom: 12 },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Theme.cardTinted, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 7 },
  memberText: { fontSize: 15, color: Theme.eyebrowGreen, fontWeight: '600' },

  // Stats
  statsRow: { flexDirection: 'row', backgroundColor: Theme.cardWhite, borderRadius: 18, padding: 20, marginBottom: 24, alignItems: 'center' },
  statCard: { flex: 1, alignItems: 'center', gap: 6 },
  statNum: { fontSize: 30, fontWeight: 'bold', color: Theme.textPrimary },
  statLabel: { fontSize: 14, color: Theme.textSecondary, textAlign: 'center' },
  statDivider: { width: 1, height: 48, backgroundColor: Theme.divider },

  // Cards
  card: { backgroundColor: Theme.cardWhite, borderRadius: 18, padding: 20, marginBottom: 24 },
  cardLabel: { fontSize: 13, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 15 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  infoItem: { width: '45%' },
  infoLabel: { fontSize: 15, color: Theme.textSecondary, marginBottom: 4 },
  infoValue: { fontSize: 17, fontWeight: '600', color: Theme.textPrimary },
  topCatRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  topCatIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  topCat: { fontSize: 21, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 3 },
  topCatDesc: { fontSize: 15, color: Theme.textSecondary },

  sectionTitle: { fontSize: 19, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 12 },
  optionsCard: { backgroundColor: Theme.cardWhite, borderRadius: 18, overflow: 'hidden', marginBottom: 24 },
  dangerCard: { borderWidth: 1, borderColor: 'rgba(231,76,60,0.25)' },
  option: { flexDirection: 'row', alignItems: 'center', padding: 19, gap: 14 },
  optionText: { flex: 1, fontSize: 17, color: Theme.textPrimary, fontWeight: '500' },
  dangerText: { color: '#E74C3C', fontWeight: '600' },
  dangerSubText: { fontSize: 14, color: Theme.textSecondary, marginTop: 3 },
  divider: { height: 1, backgroundColor: Theme.divider, marginHorizontal: 19 },

  appVersion: { fontSize: 14, color: Theme.textSecondary, textAlign: 'center', marginTop: 10 },

  emptyRow: { padding: 19 },
  emptyRowText: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: Theme.cardWhite, borderRadius: 24, padding: 24, width: '100%', alignItems: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
  muted: { fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', paddingVertical: 20 },
  codeText: { fontFamily: Fonts.serifMedium, fontSize: 40, letterSpacing: 6, color: Theme.eyebrowGreen, marginBottom: 16 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Theme.cardTinted, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 16 },
  copyBtnText: { fontSize: 15, fontWeight: '600', color: Theme.eyebrowGreen },
  codeHint: { fontSize: 14, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  joinCodeInput: {
    backgroundColor: Theme.background,
    borderRadius: 10,
    padding: 16,
    color: Theme.textPrimary,
    fontFamily: Fonts.serifMedium,
    fontSize: 22,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.divider,
    width: '100%',
  },

  clubDetail: { padding: 19, paddingTop: 4 },
  clubLabel: { fontSize: 13, fontWeight: '700', color: Theme.eyebrowGreen, letterSpacing: 1, marginTop: 8, marginBottom: 8, width: '100%' },
  clubValue: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  clubEmptyText: { fontSize: 14, color: Theme.textSecondary, fontStyle: 'italic' },
  coachRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  viewOnlyPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Theme.cardTinted, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  viewOnlyPillText: { fontSize: 11, fontWeight: '600', color: Theme.textMuted },
});
