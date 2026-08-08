import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';

export type LocalTabItem = { key: string; label: string; icon: string };

// A bottom tab bar for screens that switch between local sub-views (state,
// not real routes) — same visual language as the app's real Tabs bars
// (icon + label, active = eyebrowGreen) so it doesn't read as a different
// kind of control, just scoped to one screen instead of the whole app.
export function LocalBottomTabBar({ items, active, onChange }: { items: LocalTabItem[]; active: string; onChange: (key: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
      {items.map((item) => {
        const isActive = item.key === active;
        const color = isActive ? Theme.eyebrowGreen : Theme.textMuted;
        return (
          <TouchableOpacity key={item.key} style={styles.tab} onPress={() => onChange(item.key)}>
            <Icon name={item.icon} size={24} color={color} />
            <Text style={[styles.label, { color }]} maxFontSizeMultiplier={1.2}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: Theme.cardWhite,
    borderTopWidth: 1, borderTopColor: Theme.divider, paddingTop: 12,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 12 },
});
