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

type Kind = 'workout' | 'message' | 'plan';

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
  workout: 'clipboard-text-outline',
  message: 'message-text-outline',
  plan: 'calendar-week',
};

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const goToWorkouts = () => {
    if (typeof window !== 'undefined') window.location.href = '/coach-section?tab=workouts';
    else router.push({ pathname: '/coach-section', params: { tab: 'workouts' } } as any);
  };

  const goToPlans = () => {
    if (typeof window !== 'undefined') window.location.href = '/coach-section?tab=plans';
    else router.push({ pathname: '/coach-section', params: { tab: 'plans' } } as any);
  };

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); setRefreshing(false); return; }
    const me = session.user.id;

    const [{ data: asgs }, { data: notifs }, { data: plans }] = await Promise.all([
      supabase.from('assignments').select('*').eq('player_id', me).order('created_at', { ascending: false }).limit(30),
      supabase.from('notifications').select('*').eq('user_id', me).eq('type', 'coach_feedback').order('created_at', { ascending: false }).limit(30),
      supabase.from('weekly_plans').select('*, profiles!weekly_plans_coach_id_fkey(full_name)').eq('player_id', me).order('created_at', { ascending: false }).limit(10),
    ]);

    // Assignment lookup — used both for workout cards and to describe which
    // assignment a message notification belongs to.
    const asgMap: Record<string, any> = {};
    (asgs ?? []).forEach((a: any) => { asgMap[a.id] = a; });
    const missingAsgIds = [...new Set((notifs ?? []).map((n: any) => n.assignment_id))].filter(id => id && !asgMap[id]);
    if (missingAsgIds.length) {
      const { data: extraAsgs } = await supabase.from('assignments').select('id, title, coach_id').in('id', missingAsgIds);
      (extraAsgs ?? []).forEach((a: any) => { asgMap[a.id] = a; });
    }

    const coachIds = [...new Set([
      ...(asgs ?? []).map((a: any) => a.coach_id),
      ...(notifs ?? []).map((n: any) => n.from_user_id),
    ])].filter(Boolean);
    const coachMap: Record<string, string> = {};
    if (coachIds.length) {
      const { data: coaches } = await supabase.from('profiles').select('id, full_name').in('id', coachIds);
      (coaches ?? []).forEach((c: any) => { coachMap[c.id] = c.full_name ?? 'Coach'; });
    }

    const workoutItems: NotificationItem[] = (asgs ?? []).map((a: any) => ({
      id: `w_${a.id}`,
      kind: 'workout',
      title: `New workout from ${coachMap[a.coach_id] ?? 'your coach'}`,
      subtitle: a.title,
      date: a.created_at,
      read: !!a.seen,
      onPress: async () => {
        await supabase.from('assignments').update({ seen: true }).eq('id', a.id);
        goToWorkouts();
      },
    }));

    const messageItems: NotificationItem[] = (notifs ?? []).map((n: any) => {
      const asg = asgMap[n.assignment_id];
      return {
        id: `m_${n.id}`,
        kind: 'message',
        title: `Message from ${coachMap[n.from_user_id] ?? 'your coach'}`,
        subtitle: asg?.title ? `About: ${asg.title}` : 'New message on an assignment',
        date: n.created_at,
        read: !!n.seen,
        onPress: async () => {
          await supabase.from('notifications').update({ seen: true }).eq('id', n.id);
          goToWorkouts();
        },
      };
    });

    const planItems: NotificationItem[] = (plans ?? []).map((p: any) => ({
      id: `p_${p.id}`,
      kind: 'plan',
      title: `New weekly plan from ${p.profiles?.full_name ?? 'your coach'}`,
      subtitle: `Week of ${new Date(p.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      date: p.created_at,
      read: !!p.seen,
      onPress: async () => {
        await supabase.from('weekly_plans').update({ seen: true }).eq('id', p.id);
        goToPlans();
      },
    }));

    const all = [...workoutItems, ...messageItems, ...planItems]
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
              <Text style={styles.emptyDesc}>New workouts, messages, and weekly plans from your coach will show up here.</Text>
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
