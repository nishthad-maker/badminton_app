import { View, StyleSheet, TouchableOpacity, Animated, Pressable } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { showConfirm } from '../lib/ui';

const PANEL_WIDTH = 260;

type NavItem = { label: string; route: string; icon: string };

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', route: '/(club-admin)/dashboard', icon: 'view-dashboard' },
  { label: 'Training', route: '/(club-admin)/training', icon: 'whistle-outline' },
  { label: 'Rental', route: '/(club-admin)/rental', icon: 'office-building-outline' },
];

// Replaces the bottom Tabs navigator for the club-admin section — same 4
// destinations (Settings still owner-gated), just reached via a hamburger
// + slide-out panel instead of a tab bar. A floating overlay rather than a
// persistent header bar, deliberately: it needs zero changes to
// dashboard.tsx/tiers.tsx/club-calendar.tsx/club-settings.tsx, each of
// which already has its own top padding/header tuned for its own layout.
export function ClubAdminSideMenu({ showSettings }: { showSettings: boolean }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const slide = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const pathname = usePathname();

  useEffect(() => {
    Animated.timing(slide, { toValue: open ? 0 : -PANEL_WIDTH, duration: 220, useNativeDriver: true }).start();
  }, [open, slide]);

  const items: NavItem[] = showSettings
    ? [...NAV_ITEMS, { label: 'Settings', route: '/(club-admin)/club-settings', icon: 'account-badge' }]
    : NAV_ITEMS;

  const go = (route: string) => {
    setOpen(false);
    router.push(route as any);
  };

  const handleSignOut = () => {
    setOpen(false);
    showConfirm('Sign out', 'Are you sure you want to sign out?', async () => {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') window.location.href = '/';
      else router.replace('/' as any);
    }, 'Sign Out');
  };

  return (
    <>
      {!open && (
        <TouchableOpacity
          style={[styles.hamburgerBtn, { top: Math.max(insets.top, 44) + 8 }]}
          onPress={() => setOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="menu" size={22} color={Theme.textPrimary} />
        </TouchableOpacity>
      )}

      {open && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <Animated.View style={[styles.panel, { paddingTop: Math.max(insets.top, 44) + 20, transform: [{ translateX: slide }] }]}>
            <Text style={styles.panelTitle}>smasho</Text>
            {items.map((item) => {
              const active = pathname.startsWith(item.route.replace('/(club-admin)', ''));
              return (
                <TouchableOpacity key={item.route} style={[styles.navRow, active && styles.navRowActive]} onPress={() => go(item.route)}>
                  <Icon name={item.icon} size={22} color={active ? Theme.eyebrowGreen : Theme.textSecondary} />
                  <Text style={[styles.navRowText, active && styles.navRowTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.divider} />
            <TouchableOpacity style={styles.navRow} onPress={handleSignOut}>
              <Icon name="logout" size={22} color={Theme.textSecondary} />
              <Text style={styles.navRowText}>Sign Out</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  hamburgerBtn: {
    position: 'absolute', left: 16, zIndex: 20,
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Theme.cardWhite,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3,
  },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: PANEL_WIDTH,
    backgroundColor: Theme.background, paddingHorizontal: 20,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.2, shadowRadius: 6,
  },
  panelTitle: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.eyebrowGreen, marginBottom: 24 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderRadius: 12 },
  navRowActive: { backgroundColor: Theme.cardTinted },
  navRowText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Theme.textSecondary },
  navRowTextActive: { color: Theme.eyebrowGreen },
  divider: { height: 1, backgroundColor: Theme.divider, marginVertical: 12 },
});
