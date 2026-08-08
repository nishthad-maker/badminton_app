import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { useState } from 'react';
import { Theme, Fonts } from '@/constants/theme';
import { LocalBottomTabBar } from '@/components/LocalBottomTabBar';
import GroupLessonsScreen from './tiers';
import ClubCalendarScreen from './club-calendar';

// Thin container merging the old separate Lessons and Calendar nav
// destinations into one — "Manage" is today's tiers.tsx content, "Calendar"
// is today's club-calendar.tsx content (booking restricted to Private/Group
// there; Member/rental booking moved to its own screen, rental.tsx). Both
// embedded screens keep doing their own club/data loading independently —
// this file owns nothing but the header and the switcher. Deep links
// (notifications, dashboard cards) still push straight to '/tiers' or
// '/club-calendar' directly and are unaffected by this wrapper.
// Switching lives in a bottom bar rather than a top segmented row (matches
// the rest of the app's real Tabs bars) — Rental does the same.
export default function TrainingScreen() {
  const [tab, setTab] = useState<'manage' | 'calendar'>('manage');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Training</Text>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'manage' ? <GroupLessonsScreen embedded /> : <ClubCalendarScreen embedded restrictBooking="lessons" />}
      </View>

      <LocalBottomTabBar
        items={[
          { key: 'manage', label: 'Manage', icon: 'clipboard-text-outline' },
          { key: 'calendar', label: 'Calendar', icon: 'calendar-week' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as 'manage' | 'calendar')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { paddingLeft: 60, paddingRight: 24, paddingTop: 60, paddingBottom: 12 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 32, color: Theme.textPrimary },
});
