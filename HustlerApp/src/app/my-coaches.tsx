import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';

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

// Manual "search and connect to a coach" was removed here — coach access is
// now fully inherited via club join approval, never manual (a player joins
// a club, the club approves, and every coach at that club whose assigned
// levels match the player's level sees them automatically). This screen is
// now view/manage-only for whatever coach_connections rows already exist
// (legacy direct relationships, or ones a coach initiated from their side).
export default function MyCoachesScreen() {
  const [connections, setConnections] = useState<Conn[]>([]);
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

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

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
          <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>My Coaches</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.eyebrowGreen} colors={[Theme.eyebrowGreen]} />
        }
      >
        {connections.length > 0 && <Text style={styles.sectionLabel}>YOUR COACHES</Text>}
        {loading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : connections.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="whistle-outline" size={44} color={Theme.textSecondary} />
            <Text style={styles.emptyDesc}>No coaches yet. Join a club from the Train tab to get one automatically.</Text>
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
                <Icon name="close-circle-outline" size={22} color="#FF6B6B" />
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
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 8 },
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
