import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
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
  strength: 'Strength',
  footwork: 'Footwork',
  endurance: 'Endurance',
  recovery: 'Recovery',
};

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'badminton',
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
              <MaterialCommunityIcons name="calendar-check" size={15} color={Theme.eyebrowGreen} />
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
                <MaterialCommunityIcons name={CATEGORY_ICONS[topCategoryKey] as any} size={26} color={topCatTheme?.fg} />
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
            <MaterialCommunityIcons name="notebook-edit-outline" size={24} color={Theme.eyebrowGreen} />
            <Text style={styles.optionText}>Journal History</Text>
            <MaterialCommunityIcons name="chevron-right" size={24} color={Theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Coaching */}
        <Text style={styles.sectionTitle}>Coaching</Text>
        <View style={styles.optionsCard}>
          <TouchableOpacity style={styles.option} onPress={() => goTo('/my-coaches')}>
            <MaterialCommunityIcons name="whistle-outline" size={24} color={Theme.eyebrowGreen} />
            <Text style={styles.optionText}>My Coaches</Text>
            <MaterialCommunityIcons name="chevron-right" size={24} color={Theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.optionsCard}>
          <TouchableOpacity style={styles.option} onPress={() => goTo('/edit-profile')}>
            <MaterialCommunityIcons name="account-edit-outline" size={24} color={Theme.eyebrowGreen} />
            <Text style={styles.optionText}>Edit Profile</Text>
            <MaterialCommunityIcons name="chevron-right" size={24} color={Theme.textMuted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.option} onPress={handleSignOut}>
            <MaterialCommunityIcons name="logout" size={24} color={Theme.textSecondary} />
            <Text style={styles.optionText}>Sign Out</Text>
            <MaterialCommunityIcons name="chevron-right" size={24} color={Theme.textMuted} />
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
            <MaterialCommunityIcons name="delete-forever-outline" size={24} color="#E74C3C" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionText, styles.dangerText]}>
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </Text>
              <Text style={styles.dangerSubText}>Permanently delete your account and all data</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#E74C3C" />
          </TouchableOpacity>
        </View>

        <Text style={styles.appVersion}>Hustler · Built for badminton athletes</Text>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 130 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 108, height: 108, borderRadius: 54, backgroundColor: '#854F0B', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
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
});
