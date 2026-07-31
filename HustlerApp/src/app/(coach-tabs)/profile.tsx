import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal } from 'react-native';
import { Text } from '@/components/Text';
import { TextInput } from '@/components/TextInput';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { Theme, Fonts } from '@/constants/theme';
import { Icon } from '@/components/icons/Icon';
import { getMyClubs, getActiveClubId, getPendingCoachRequest, requestJoinClubAsCoach, setActiveClubId, MyClub, PendingClubRequest } from '../../lib/club';

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

export default function CoachProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [activeThisWeek, setActiveThisWeek] = useState(0);
  const [assignmentsSent, setAssignmentsSent] = useState(0);
  const [memberSince, setMemberSince] = useState('');
  const [copied, setCopied] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [myClubs, setMyClubs] = useState<MyClub[]>([]);
  const [activeClubId, setActiveClubIdState] = useState<string | null>(null);
  const [pendingClub, setPendingClub] = useState<PendingClubRequest | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningClub, setJoiningClub] = useState(false);

  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/login' as any); return; }
    setUser(session.user);
    setMemberSince(new Date(session.user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (profileData) setProfile(profileData);

    const { data: conns } = await supabase
      .from('coach_connections').select('player_id').eq('coach_id', session.user.id).eq('status', 'accepted');
    const playerIds = (conns ?? []).map((c: any) => c.player_id);
    setPlayerCount(playerIds.length);

    if (playerIds.length > 0) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      const { data: weekSess } = await supabase
        .from('session_logs').select('user_id').in('user_id', playerIds).gte('created_at', weekStart.toISOString());
      setActiveThisWeek(new Set((weekSess ?? []).map((s: any) => s.user_id)).size);
    } else {
      setActiveThisWeek(0);
    }

    const { count } = await supabase
      .from('assignments').select('id', { count: 'exact', head: true }).eq('coach_id', session.user.id);
    setAssignmentsSent(count ?? 0);

    const clubs = await getMyClubs();
    setMyClubs(clubs);
    setActiveClubIdState(clubs.length ? (await getActiveClubId()) ?? clubs[0].clubId : null);
    setPendingClub(clubs.length ? null : await getPendingCoachRequest(session.user.id));
  };

  const enterClub = async (club: MyClub) => {
    await setActiveClubId(club.clubId);
    setActiveClubIdState(club.clubId);
    goTo('/(club-admin)/dashboard');
  };

  const copyUsername = async () => {
    if (!profile?.coach_username) return;
    await Clipboard.setStringAsync(profile.coach_username);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignOut = async () => {
    showConfirm('Sign out', 'Are you sure you want to sign out?', async () => {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') window.location.href = '/';
      else router.replace('/' as any);
    });
  };

  const handleDeleteAccount = () => {
    showConfirm(
      'Delete Account',
      'This will permanently delete your coach account and all your data — players will be disconnected, notes and assignments removed. This cannot be undone.',
      () => {
        showConfirm(
          'Are you absolutely sure?',
          'This really is permanent. Your account will be gone forever.',
          async () => {
            setDeletingAccount(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session?.user) return;
              const userId = session.user.id;

              await supabase.from('assignments').delete().eq('coach_id', userId);
              await supabase.from('assignment_messages').delete().eq('sender_id', userId);
              await supabase.from('coach_player_notes').delete().eq('coach_id', userId);
              await supabase.from('coach_connections').delete().eq('coach_id', userId);
              await supabase.from('coach_schedule_events').delete().eq('coach_id', userId);
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

  const goTo = (path: string) => {
    if (typeof window !== 'undefined') window.location.href = path;
    else router.push(path as any);
  };

  const submitJoinClub = async () => {
    if (!joinCode.trim()) { Alert.alert('Missing code', "Enter the club's coach code."); return; }
    setJoiningClub(true);
    const result = await requestJoinClubAsCoach(joinCode);
    setJoiningClub(false);
    if (!result.ok) { Alert.alert('Could not join', result.message); return; }
    setShowJoinModal(false);
    setJoinCode('');
    await setActiveClubId(result.clubId);
    Alert.alert('Joined', `You're in — welcome to ${result.clubName}.`);
    loadProfile();
  };

  const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Coach';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

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
          <View style={styles.badgeRow}>
            {profile?.club ? (
              <View style={styles.badge}>
                <Icon name="whistle-outline" size={15} color={Theme.eyebrowGreen} />
                <Text style={styles.badgeText}>{profile.club}</Text>
              </View>
            ) : null}
            {memberSince ? (
              <View style={styles.badge}>
                <Icon name="calendar-check" size={15} color={Theme.eyebrowGreen} />
                <Text style={styles.badgeText}>Coaching since {memberSince}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{playerCount}</Text>
            <Text style={styles.statLabel}>Players</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{activeThisWeek}</Text>
            <Text style={styles.statLabel}>Active This Week</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{assignmentsSent}</Text>
            <Text style={styles.statLabel}>Workouts Sent</Text>
          </View>
        </View>

        {/* Coach username */}
        {profile?.coach_username ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>YOUR COACH USERNAME</Text>
            <View style={styles.usernameRow}>
              <Text style={styles.usernameValue}>{profile.coach_username}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={copyUsername}>
                <Icon name={copied ? 'check' : 'content-copy'} size={18} color={copied ? '#2ECC71' : Theme.eyebrowGreen} />
                <Text style={[styles.copyBtnText, copied && { color: '#2ECC71' }]}>{copied ? 'Copied' : 'Copy'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.usernameHint}>Share this with players so they can connect with you.</Text>
          </View>
        ) : null}

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.optionsCard}>
          {myClubs.length > 0 ? (
            <>
              <TouchableOpacity
                style={styles.option}
                onPress={() => enterClub(myClubs.find((c) => c.clubId === activeClubId) ?? myClubs[0])}
              >
                <Icon name="account-badge" size={24} color={Theme.eyebrowGreen} />
                <Text style={styles.optionText}>
                  My Club — {(myClubs.find((c) => c.clubId === activeClubId) ?? myClubs[0]).clubName}
                </Text>
                <Icon name="chevron-right" size={24} color={Theme.textMuted} />
              </TouchableOpacity>
              {myClubs.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubChipRow}>
                  {myClubs.map((c) => (
                    <TouchableOpacity
                      key={c.clubId}
                      style={[styles.clubChip, c.clubId === activeClubId && styles.clubChipActive]}
                      onPress={() => enterClub(c)}
                    >
                      <Text style={[styles.clubChipText, c.clubId === activeClubId && styles.clubChipTextActive]}>{c.clubName}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <View style={styles.divider} />
            </>
          ) : pendingClub ? (
            <>
              <View style={styles.option}>
                <Icon name="account-badge" size={24} color={Theme.textMuted} />
                <Text style={[styles.optionText, { color: Theme.textSecondary }]}>Pending approval — {pendingClub.clubName}</Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.option} onPress={() => setShowJoinModal(true)}>
                <Icon name="account-badge" size={24} color={Theme.eyebrowGreen} />
                <Text style={styles.optionText}>Join a Club</Text>
                <Icon name="chevron-right" size={24} color={Theme.textMuted} />
              </TouchableOpacity>
              <View style={styles.divider} />
            </>
          )}
          <TouchableOpacity style={styles.option} onPress={() => goTo('/edit-coach-profile')}>
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
          <TouchableOpacity style={styles.option} onPress={handleDeleteAccount} disabled={deletingAccount}>
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

        <Text style={styles.appVersion}>Hustler · Built for badminton coaches</Text>

      </ScrollView>

      <Modal visible={showJoinModal} transparent animationType="fade" onRequestClose={() => setShowJoinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join a Club</Text>
              <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                <Icon name="close-circle-outline" size={26} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.codeHint}>Enter the coach code your club gave you. You'll join instantly — no approval needed. You can join more than one club this way.</Text>
            <TextInput
              style={styles.joinCodeInput}
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              placeholder="C12345"
              placeholderTextColor={Theme.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
            <TouchableOpacity style={[styles.copyBtn, joiningClub && { opacity: 0.6 }]} onPress={submitJoinClub} disabled={joiningClub}>
              <Text style={styles.copyBtnText}>{joiningClub ? 'Joining...' : 'Join Club'}</Text>
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

  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: Theme.eyebrowGreen, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarInitials: { fontSize: 38, fontWeight: 'bold', color: '#fff' },
  name: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Theme.textPrimary, marginBottom: 5 },
  email: { fontSize: 15, color: Theme.textSecondary, marginBottom: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Theme.cardTinted, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  badgeText: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '600' },

  statsRow: { flexDirection: 'row', backgroundColor: Theme.cardWhite, borderRadius: 18, padding: 20, marginBottom: 24, alignItems: 'center' },
  statCard: { flex: 1, alignItems: 'center', gap: 5 },
  statNum: { fontSize: 28, fontWeight: 'bold', color: Theme.textPrimary },
  statLabel: { fontSize: 13, color: Theme.textSecondary, textAlign: 'center' },
  statDivider: { width: 1, height: 44, backgroundColor: Theme.divider },

  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 19, marginBottom: 22 },
  cardLabel: { fontSize: 13, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 13 },
  usernameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  usernameValue: { fontSize: 20, fontWeight: 'bold', color: Theme.textPrimary },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Theme.cardTinted, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  copyBtnText: { fontSize: 14, fontWeight: '600', color: Theme.eyebrowGreen },
  usernameHint: { fontSize: 14, color: Theme.textSecondary, marginTop: 9 },

  sectionTitle: { fontSize: 19, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 12 },
  optionsCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, overflow: 'hidden', marginBottom: 22 },
  dangerCard: { borderWidth: 1, borderColor: 'rgba(231,76,60,0.25)' },
  option: { flexDirection: 'row', alignItems: 'center', padding: 19, gap: 14 },
  optionText: { flex: 1, fontSize: 17, color: Theme.textPrimary, fontWeight: '500' },
  dangerText: { color: '#E74C3C', fontWeight: '600' },
  dangerSubText: { fontSize: 14, color: Theme.textSecondary, marginTop: 3 },
  divider: { height: 1, backgroundColor: Theme.divider, marginHorizontal: 19 },
  clubChipRow: { gap: 8, paddingHorizontal: 19, paddingBottom: 14 },
  clubChip: { backgroundColor: Theme.cardTinted, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  clubChipActive: { backgroundColor: Theme.eyebrowGreen },
  clubChipText: { fontSize: 13, fontWeight: '600', color: Theme.eyebrowGreen },
  clubChipTextActive: { color: '#fff' },

  appVersion: { fontSize: 14, color: Theme.textSecondary, textAlign: 'center', marginTop: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: Theme.cardWhite, borderRadius: 24, padding: 24, width: '100%', alignItems: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  modalTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
  muted: { fontSize: 16, color: Theme.textSecondary, fontStyle: 'italic', paddingVertical: 20 },
  codeText: { fontFamily: Fonts.serifMedium, fontSize: 40, letterSpacing: 6, color: Theme.eyebrowGreen, marginBottom: 16 },
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
});
