import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Colors } from '@/constants/theme';
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

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Strength 💪',
  footwork: 'Footwork 🏸',
  endurance: 'Endurance ⚡',
  recovery: 'Recovery 💜',
};

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [streak, setStreak] = useState(0);
  const [memberSince, setMemberSince] = useState('');
  const [topCategory, setTopCategory] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

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

    const { data } = await supabase
      .from('session_logs').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
    if (!data) return;

    setTotalSessions(countUniqueSessions(data));

    const dates = [...new Set(data.map((s: any) => new Date(s.created_at).toDateString()))];
    let currentStreak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (dates.includes(d.toDateString())) currentStreak++;
      else if (i > 0) break;
    }
    setStreak(currentStreak);

    const byCat: Record<string, Set<string>> = {};
    data.forEach((s: any) => {
      if (!byCat[s.category]) byCat[s.category] = new Set();
      byCat[s.category].add(new Date(s.created_at).toDateString());
    });
    const top = Object.entries(byCat).sort((a, b) => b[1].size - a[1].size)[0];
    if (top) setTopCategory(CATEGORY_LABELS[top[0]] ?? top[0]);
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

  const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Athlete';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
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
              <MaterialCommunityIcons name="calendar-check" size={12} color={Colors.accent} />
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
            <Text style={styles.statLabel}>Day Streak 🔥</Text>
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
                { label: 'Goal', value: profile.training_goal },
                { label: 'Weekly Goal', value: profile.weekly_goal ? `${profile.weekly_goal} days` : null },
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
        {topCategory ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>MOST TRAINED</Text>
            <Text style={styles.topCat}>{topCategory}</Text>
            <Text style={styles.topCatDesc}>Keep it up — consistency is key!</Text>
          </View>
        ) : null}

        {/* Coaching */}
        <Text style={styles.sectionTitle}>Coaching</Text>
        <View style={styles.optionsCard}>
          <TouchableOpacity style={styles.option} onPress={() => goTo('/my-coaches')}>
            <MaterialCommunityIcons name="whistle-outline" size={20} color={Colors.accent} />
            <Text style={styles.optionText}>My Coaches</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.optionsCard}>
          <TouchableOpacity style={styles.option} onPress={() => goTo('/edit-profile')}>
            <MaterialCommunityIcons name="account-edit-outline" size={20} color={Colors.accent} />
            <Text style={styles.optionText}>Edit Profile</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.option} onPress={handleSignOut}>
            <MaterialCommunityIcons name="logout" size={20} color={Colors.textSecondary} />
            <Text style={styles.optionText}>Sign Out</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
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
            <MaterialCommunityIcons name="delete-forever-outline" size={20} color="#FF4444" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionText, styles.dangerText]}>
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </Text>
              <Text style={styles.dangerSubText}>Permanently delete your account and all data</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#FF4444" />
          </TouchableOpacity>
        </View>

        <Text style={styles.appVersion}>Hustler · Built for badminton athletes</Text>

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 120 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarInitials: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  name: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
  email: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
  memberBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.accentMuted, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  memberText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },

  // Stats
  statsRow: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 20, alignItems: 'center' },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  statDivider: { width: 1, height: 40, backgroundColor: Colors.border },

  // Cards
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 16, marginBottom: 20 },
  cardLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1, marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  infoItem: { width: '45%' },
  infoLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  topCat: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
  topCatDesc: { fontSize: 13, color: Colors.textSecondary },

  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10 },
  optionsCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  dangerCard: { borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)' },
  option: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  optionText: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  dangerText: { color: '#FF4444', fontWeight: '600' },
  dangerSubText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },

  appVersion: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 8 },
});
