import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { formatTimeAgo } from '../lib/community';

const COACH = '#123C35';
const COACH_TINT = '#E1F3EE';

type Kind = 'message' | 'request';

type NotificationItem = {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string;
  date: string;
  read: boolean;
  onPress: () => void;
};

const KIND_ICON: Record<Kind, string> = {
  message: 'message-text-outline',
  request: 'account-plus-outline',
};

export default function CoachNotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const goToPlayer = (playerId: string, name: string) => {
    router.push({ pathname: '/coach-player', params: { playerId, name } });
  };

  const goToRoster = () => {
    if (typeof window !== 'undefined') window.location.href = '/(coach-tabs)/players';
    else router.push('/(coach-tabs)/players' as any);
  };

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); setRefreshing(false); return; }
    const me = session.user.id;

    const [{ data: notifs }, { data: pending }] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', me).eq('type', 'player_message').order('created_at', { ascending: false }).limit(30),
      supabase.from('coach_connections').select('*').eq('coach_id', me).eq('status', 'pending').order('created_at', { ascending: false }),
    ]);

    const missingAsgIds = [...new Set((notifs ?? []).map((n: any) => n.assignment_id))].filter(Boolean);
    const asgMap: Record<string, any> = {};
    if (missingAsgIds.length) {
      const { data: asgs } = await supabase.from('assignments').select('id, title').in('id', missingAsgIds);
      (asgs ?? []).forEach((a: any) => { asgMap[a.id] = a; });
    }

    const playerIds = [...new Set([
      ...(notifs ?? []).map((n: any) => n.from_user_id),
      ...(pending ?? []).map((p: any) => p.player_id),
    ])].filter(Boolean);
    const nameMap: Record<string, string> = {};
    if (playerIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', playerIds);
      (profs ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name ?? 'Player'; });
    }

    const messageItems: NotificationItem[] = (notifs ?? []).map((n: any) => {
      const asg = asgMap[n.assignment_id];
      const playerName = nameMap[n.from_user_id] ?? 'A player';
      return {
        id: `m_${n.id}`,
        kind: 'message',
        title: `Message from ${playerName}`,
        subtitle: asg?.title ? `About: ${asg.title}` : 'New message on an assignment',
        date: n.created_at,
        read: !!n.seen,
        onPress: async () => {
          await supabase.from('notifications').update({ seen: true }).eq('id', n.id);
          goToPlayer(n.from_user_id, playerName);
        },
      };
    });

    const requestItems: NotificationItem[] = (pending ?? []).map((p: any) => {
      const playerName = nameMap[p.player_id] ?? 'A player';
      return {
        id: `r_${p.id}`,
        kind: 'request',
        title: `${playerName} wants to connect`,
        subtitle: 'Accept or decline from your roster',
        date: p.created_at,
        read: false,
        onPress: async () => { goToRoster(); },
      };
    });

    const all = [...messageItems, ...requestItems]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setItems(all);
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const handlePress = async (item: NotificationItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, read: true } : i));
    await item.onPress();
  };

  const unreadCount = items.filter(i => !i.read).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && <Text style={styles.unreadSummary}>{unreadCount} unread</Text>}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COACH} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COACH} colors={[COACH]} />}
        >
          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="bell-check-outline" size={48} color={Theme.textMuted} />
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.emptyDesc}>Messages and connection requests from your players will show up here.</Text>
            </View>
          ) : (
            items.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.row, !item.read && styles.rowUnread]}
                onPress={() => handlePress(item)}
              >
                <View style={[styles.rowIcon, { backgroundColor: COACH_TINT }]}>
                  <MaterialCommunityIcons name={KIND_ICON[item.kind] as any} size={20} color={COACH} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                  <Text style={styles.rowTime}>{formatTimeAgo(item.date)}</Text>
                </View>
                {!item.read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 24, paddingTop: 60, paddingBottom: 8 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 36, color: Theme.textPrimary },
  unreadSummary: { fontSize: 13, color: COACH, fontWeight: '600', marginTop: 2 },
  scroll: { padding: 24, paddingTop: 12, paddingBottom: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginBottom: 10 },
  rowUnread: { backgroundColor: COACH_TINT },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  rowSubtitle: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  rowTime: { fontSize: 12, color: Theme.textMuted, marginTop: 4 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COACH },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});
