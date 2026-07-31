import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { router } from 'expo-router';
import { Theme, Fonts } from '@/constants/theme';

type Props = {
  title?: string;
};

// Shown on any club-admin tab when the signed-in Club account skipped
// club-setup to look around first — every screen needs a real club_id to
// query against, so this replaces the normal content until they finish.
export function NoClubPrompt({ title = "You haven't set up your club yet" }: Props) {
  return (
    <View style={styles.container}>
      <Icon name="account-badge" size={48} color={Theme.textSecondary} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.desc}>Finish a quick setup to unlock this screen and start adding coaches, tiers, and lessons.</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.push('/(club-admin)/club-setup' as any)}>
        <Text style={styles.buttonText}>Complete Setup</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary, textAlign: 'center' },
  desc: { fontFamily: Fonts.sansRegular, fontSize: 16, color: Theme.textSecondary, textAlign: 'center', lineHeight: 22 },
  button: { marginTop: 12, backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { fontFamily: Fonts.sansBold, fontSize: 16, color: Theme.limeAccentDark },
});
