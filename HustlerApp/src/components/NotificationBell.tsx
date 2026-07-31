import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { getUnreadNotificationCount } from '../lib/notifications';

// The single, consistent notification entry point for every role's header
// (player, coach, parent, club) — one white circular bell with a numeric
// unread badge, linking to notification-center.tsx. Every role should use
// exactly this component and nothing else, so there's never more than one
// bell icon per screen.
export function NotificationBell({ color, size = 52 }: { color?: string; size?: number }) {
  const [count, setCount] = useState(0);

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      setCount(await getUnreadNotificationCount(session.user.id));
    })();
  }, []));

  return (
    <TouchableOpacity
      style={[styles.bellButton, { width: size, height: size, borderRadius: size / 2 }]}
      onPress={() => router.push('/notification-center' as any)}
      activeOpacity={0.8}
    >
      <Icon name="bell-outline" size={Math.round(size * 0.5)} color={color ?? Theme.textPrimary} />
      {count > 0 && (
        <View style={styles.bellBadge}>
          <Text style={styles.bellBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    backgroundColor: Theme.cardWhite,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: '#D64545', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5, borderWidth: 2, borderColor: Theme.background,
  },
  bellBadgeText: { fontFamily: Fonts.sansBold, color: '#FFFFFF', fontSize: 11 },
});
