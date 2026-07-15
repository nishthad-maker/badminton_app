import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

type Conn = {
  id: string;
  coach_id: string;
  status: string;
  name: string;
  username: string;
  club: string | null;
};

export default function MyCoachesScreen() {
  const [me, setMe] = useState<string | null>(null);
  const [connections, setConnections] = useState<Conn[]>([]);
  const [username, setUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
    }
  };

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace('/login' as any);
      return;
    }
    const myId = session.user.id;
    setMe(myId);

    const { data: conns } = await supabase
      .from('coach_connections')
      .select('id, coach_id, status, created_at')
      .eq('player_id', myId)
      .order('created_at', { ascending: false });

    const ids = (conns ?? []).map((c: any) => c.coach_id);
    const coachMap: Record<string, any> = {};
    if (ids.length) {
      const { data: coaches } = await supabase
        .from('profiles')
        .select('id, full_name, coach_username, club')
        .in('id', ids);
      (coaches ?? []).forEach((c: any) => { coachMap[c.id] = c; });
    }

    setConnections((conns ?? []).map((c: any) => ({
      id: c.id,
      coach_id: c.coach_id,
      status: c.status,
      name: coachMap[c.coach_id]?.full_name ?? 'Coach',
      username: coachMap[c.coach_id]?.coach_username ?? '',
      club: coachMap[c.coach_id]?.club ?? null,
    })));

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const addCoach = async () => {
    const uname = username.trim();
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
      showAlert('Invalid username', 'Enter a valid coach username (lowercase letters, numbers, underscores).');
      return;
    }
    if (!me) return;

    setAdding(true);

    // Find a real coach with that username.
    const { data: coach } = await supabase
      .from('profiles')
      .select('id, full_name, is_coach')
      .eq('coach_username', uname)
      .eq('is_coach', true)
      .maybeSingle();

    if (!coach) {
      setAdding(false);
      showAlert('Coach not found', `No coach found with the username "${uname}". Double-check it with your coach.`);
      return;
    }

    if (coach.id === me) {
      setAdding(false);
      showAlert('Oops', "You can't add yourself.");
      return;
    }

    const existing = connections.find((c) => c.coach_id === coach.id);
    if (existing) {
      setAdding(false);
      showAlert(
        'Already added',
        existing.status === 'accepted'
          ? `You're already connected with ${coach.full_name}.`
          : `You already have a pending request to ${coach.full_name}.`
      );
      return;
    }

    const { error } = await supabase
      .from('coach_connections')
      .insert({ coach_id: coach.id, player_id: me, status: 'pending' });

    setAdding(false);

   if (error) {
      showAlert('Error (debug)', error.message + (error.code ? ` [${error.code}]` : ''));
      console.log('addCoach insert error:', error);
      return;
    }

    setUsername('');
    showAlert('Request sent', `Your request was sent to ${coach.full_name}. They'll need to accept it before you're connected.`);
    load();
  };

  const disconnect = (conn: Conn) => {
    const verb = conn.status === 'accepted' ? 'Disconnect from' : 'Cancel request to';
    showConfirm(`${verb} ${conn.name}?`, 'You can always add them again later.', async () => {
      await supabase.from('coach_connections').delete().eq('id', conn.id);
      load();
    });
  };

  const initial = (name: string) => (name?.trim()?.charAt(0)?.toUpperCase() ?? '?');

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={goBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>My Coaches</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.eyebrowGreen} colors={[Theme.eyebrowGreen]} />
        }
      >
        {/* Add a coach */}
        <View style={styles.addCard}>
          <Text style={styles.sectionLabel}>ADD A COACH</Text>
          <Text style={styles.hint}>Ask your coach for their username, then enter it here.</Text>
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. coach_priya"
              placeholderTextColor={Theme.textSecondary}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.addBtn, adding && styles.addBtnDisabled]}
              onPress={addCoach}
              disabled={adding}
            >
              <Text style={styles.addBtnText}>{adding ? '...' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Current connections */}
        {loading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : connections.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="whistle-outline" size={44} color={Theme.textSecondary} />
            <Text style={styles.emptyDesc}>No coaches yet. Add one above using their username.</Text>
          </View>
        ) : (
          connections.map((conn) => (
            <View key={conn.id} style={styles.coachCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial(conn.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.coachName}>{conn.name}</Text>
                <Text style={styles.coachMeta}>
                  {conn.username ? `@${conn.username}` : ''}{conn.club ? ` · ${conn.club}` : ''}
                </Text>
                <View style={[styles.statusChip, conn.status === 'accepted' ? styles.statusConnected : styles.statusPending]}>
                  <Text style={[styles.statusText, conn.status === 'accepted' ? styles.statusTextConnected : styles.statusTextPending]}>
                    {conn.status === 'accepted' ? 'Connected' : 'Waiting to accept'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => disconnect(conn)}>
                <MaterialCommunityIcons name="close-circle-outline" size={22} color="#FF6B6B" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 26, color: Theme.textPrimary },
  scroll: { paddingBottom: 40 },
  addCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 16, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 8 },
  hint: { fontSize: 13, color: Theme.textSecondary, marginBottom: 12, lineHeight: 18 },
  addRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: Theme.background,
    borderRadius: 10,
    padding: 14,
    color: Theme.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  addBtn: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 10,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 14 },
  muted: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 30 },
  coachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.cardTinted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: 'bold', color: Theme.eyebrowGreen },
  coachName: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  coachMeta: { fontSize: 13, color: Theme.textSecondary, marginTop: 1 },
  statusChip: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  statusConnected: { backgroundColor: Theme.cardTinted },
  statusPending: { backgroundColor: Theme.background },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusTextConnected: { color: Theme.eyebrowGreen },
  statusTextPending: { color: Theme.textSecondary },
});
