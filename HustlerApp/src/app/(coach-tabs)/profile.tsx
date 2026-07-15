import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { Theme, Fonts } from '@/constants/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

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
  const [memberSince, setMemberSince] = useState('');
  const [copied, setCopied] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.replace('/login' as any); return; }
    setUser(session.user);
    setMemberSince(new Date(session.user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (profileData) setProfile(profileData);

    const { data: conns } = await supabase
      .from('coach_connections').select('id').eq('coach_id', session.user.id).eq('status', 'accepted');
    setPlayerCount((conns ?? []).length);
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
              await supabase.from('profiles').delete().eq('id', userId);

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
          {profile?.club ? (
            <View style={styles.clubBadge}>
              <MaterialCommunityIcons name="whistle-outline" size={12} color={Theme.eyebrowGreen} />
              <Text style={styles.clubText}>{profile.club}</Text>
            </View>
          ) : null}
          {memberSince ? (
            <View style={styles.memberBadge}>
              <MaterialCommunityIcons name="calendar-check" size={12} color={Theme.eyebrowGreen} />
              <Text style={styles.memberText}>Coaching since {memberSince}</Text>
            </View>
          ) : null}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{playerCount}</Text>
            <Text style={styles.statLabel}>Players</Text>
          </View>
        </View>

        {/* Coach username */}
        {profile?.coach_username ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>YOUR COACH USERNAME</Text>
            <View style={styles.usernameRow}>
              <Text style={styles.usernameValue}>{profile.coach_username}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={copyUsername}>
                <MaterialCommunityIcons name={copied ? 'check' : 'content-copy'} size={16} color={copied ? '#2ECC71' : Theme.eyebrowGreen} />
                <Text style={[styles.copyBtnText, copied && { color: '#2ECC71' }]}>{copied ? 'Copied' : 'Copy'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.usernameHint}>Share this with players so they can connect with you.</Text>
          </View>
        ) : null}

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.optionsCard}>
          <TouchableOpacity style={styles.option} onPress={() => goTo('/edit-coach-profile')}>
            <MaterialCommunityIcons name="account-edit-outline" size={20} color={Theme.eyebrowGreen} />
            <Text style={styles.optionText}>Edit Profile</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Theme.textSecondary} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.option} onPress={handleSignOut}>
            <MaterialCommunityIcons name="logout" size={20} color={Theme.textSecondary} />
            <Text style={styles.optionText}>Sign Out</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Danger zone */}
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <View style={[styles.optionsCard, styles.dangerCard]}>
          <TouchableOpacity style={styles.option} onPress={handleDeleteAccount} disabled={deletingAccount}>
            <MaterialCommunityIcons name="delete-forever-outline" size={20} color="#E74C3C" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionText, styles.dangerText]}>
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </Text>
              <Text style={styles.dangerSubText}>Permanently delete your account and all data</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#E74C3C" />
          </TouchableOpacity>
        </View>

        <Text style={styles.appVersion}>Hustler · Built for badminton coaches</Text>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 120 },

  avatarSection: { alignItems: 'center', marginBottom: 24, gap: 6 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: Theme.eyebrowGreen, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarInitials: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  name: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  email: { fontSize: 14, color: Theme.textSecondary, marginBottom: 4 },
  clubBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Theme.cardTinted, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  clubText: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Theme.cardTinted, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  memberText: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },

  statsRow: { flexDirection: 'row', backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 20, alignItems: 'center' },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 24, fontWeight: 'bold', color: Theme.textPrimary },
  statLabel: { fontSize: 13, color: Theme.textSecondary, textAlign: 'center' },

  card: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 16, marginBottom: 20 },
  cardLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 12 },
  usernameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  usernameValue: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Theme.cardTinted, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  copyBtnText: { fontSize: 13, fontWeight: '600', color: Theme.eyebrowGreen },
  usernameHint: { fontSize: 13, color: Theme.textSecondary, marginTop: 8 },

  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 10 },
  optionsCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  dangerCard: { borderWidth: 1, borderColor: 'rgba(231,76,60,0.25)' },
  option: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  optionText: { flex: 1, fontSize: 15, color: Theme.textPrimary, fontWeight: '500' },
  dangerText: { color: '#E74C3C', fontWeight: '600' },
  dangerSubText: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: Theme.divider, marginHorizontal: 16 },

  appVersion: { fontSize: 13, color: Theme.textSecondary, textAlign: 'center', marginTop: 8 },
});
