import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { formatTimeAgo } from '../lib/community';
import {
  getMyNotifications, markAllNotificationsSeen, getNotificationPreferences, setNotificationPreference,
  NOTIFICATION_CATEGORIES, AppNotification,
} from '../lib/notifications';

// Generic in-app bell across every role and category (spec point 12) —
// separate from the pre-existing narrow `notifications.tsx` (player-only,
// hardcoded to workout/message/plan cards), which stays as-is for its own
// entry point. This screen reads the generalized notifications rows (title/
// body/category), which every notify*() in lib/notifications.ts now writes.
const CATEGORY_ICON: Record<string, string> = {
  lesson_reminder: 'calendar-clock', attendance: 'account-check-outline', cancellation: 'alert-circle-outline',
  coach_feedback: 'message-text-outline', waitlist: 'account-clock-outline', makeup: 'refresh',
  tournament: 'trophy-outline', club: 'account-group-outline', schedule_request: 'calendar-edit',
  payment: 'cash', message: 'message-outline', workout: 'dumbbell',
};

export default function NotificationCenterScreen() {
  const [myId, setMyId] = useState<string | null>(null);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); setRefreshing(false); return; }
    setMyId(session.user.id);
    const [notifs, prefMap] = await Promise.all([
      getMyNotifications(session.user.id),
      getNotificationPreferences(session.user.id),
    ]);
    setItems(notifs);
    setPrefs(prefMap);
    setLoading(false);
    setRefreshing(false);
    await markAllNotificationsSeen(session.user.id);
  };

  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = () => { setRefreshing(true); load(); };

  const togglePref = async (category: string) => {
    if (!myId) return;
    const next = !(prefs[category] ?? true);
    setPrefs((prev) => ({ ...prev, [category]: next }));
    await setNotificationPreference(myId, category, next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={() => setShowSettings((v) => !v)}>
          <Icon name="cog-outline" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Theme.eyebrowGreen} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.eyebrowGreen} colors={[Theme.eyebrowGreen]} />}
        >
          {showSettings && (
            <View style={styles.settingsCard}>
              <Text style={styles.settingsTitle}>Notify me about</Text>
              {NOTIFICATION_CATEGORIES.map((c) => {
                const enabled = prefs[c.key] ?? true;
                return (
                  <TouchableOpacity key={c.key} style={styles.settingsRow} onPress={() => togglePref(c.key)}>
                    <Text style={styles.settingsLabel}>{c.label}</Text>
                    <Icon name={enabled ? 'toggle-switch' : 'toggle-switch-off-outline'} size={28} color={enabled ? Theme.eyebrowGreen : Theme.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="bell-check-outline" size={48} color={Theme.textMuted} />
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.emptyDesc}>Lesson reminders, attendance changes, and club updates will show up here.</Text>
            </View>
          ) : (
            items.map((n) => (
              <TouchableOpacity
                key={n.id}
                style={[styles.row, !n.seen && styles.rowUnread]}
                onPress={() => { if (n.screen) router.push(`/${n.screen}` as any); }}
                disabled={!n.screen}
                activeOpacity={n.screen ? 0.7 : 1}
              >
                <View style={styles.rowIcon}>
                  <Icon name={(CATEGORY_ICON[n.category ?? n.type] ?? 'bell-outline') as any} size={20} color={Theme.eyebrowGreen} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{n.title ?? n.type}</Text>
                  {n.body && <Text style={styles.rowSubtitle} numberOfLines={2}>{n.body}</Text>}
                  <Text style={styles.rowTime}>{formatTimeAgo(n.created_at)}</Text>
                </View>
                {!n.seen && <View style={styles.unreadDot} />}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 24, paddingTop: 60, paddingBottom: 8 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Theme.textPrimary },
  scroll: { padding: 24, paddingTop: 12, paddingBottom: 60 },
  settingsCard: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 16, marginBottom: 16 },
  settingsTitle: { fontFamily: Fonts.sansBold, fontSize: 14, color: Theme.textMuted, letterSpacing: 1, marginBottom: 8 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Theme.divider },
  settingsLabel: { fontSize: 14, color: Theme.textPrimary, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 14, marginBottom: 10 },
  rowUnread: { backgroundColor: Theme.cardTinted },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.cardTinted },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  rowSubtitle: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  rowTime: { fontSize: 12, color: Theme.textMuted, marginTop: 4 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Theme.eyebrowGreen },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});
