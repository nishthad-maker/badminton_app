import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';

// Small, right-aligned utility chip for "switch back to X account/view" —
// used wherever a session or view was swapped (managed child <-> parent,
// coach <-> club admin dual role). Sits in normal document flow (not
// absolute) so it pushes screen content down instead of floating over a
// screen's own header text, and stays out of the way as a corner chip
// rather than a big banner competing with the page title.
export function SwitchBackBanner({ label, onPress }: { label: string; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  // react-native-safe-area-context reports insets.top = 0 on web (a browser
  // tab has no real notch/status bar to inset around), which is also the
  // environment this app is actually being tested in via a phone-frame
  // mockup — so a real-device-only fix isn't enough here. Floor it at a
  // typical status-bar height so there's always visible breathing room
  // above the chip, on web or native, with or without a notch.
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 44) + 8 }]}>
      <TouchableOpacity style={styles.chip} onPress={onPress}>
        <Icon name="refresh" size={13} color="#FFFFFF" />
        <Text style={styles.text}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Theme.background, alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Theme.eyebrowGreen, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 3,
  },
  text: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: '#FFFFFF' },
});
