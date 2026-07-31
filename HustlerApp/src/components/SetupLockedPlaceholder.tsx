import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';

// Shown on Lessons/Calendar/Settings whenever the club hasn't finished the
// post-signup onboarding wizard yet — those tabs stay reachable (per spec:
// "nav bar remains visible... do not allow bypassing via direct nav tap")
// but show this instead of real content, no matter how they got here.
export function SetupLockedPlaceholder() {
  return (
    <View style={styles.container}>
      <Icon name="lock-outline" size={48} color={Theme.textMuted} />
      <Text style={styles.title}>Complete setup first</Text>
      <Text style={styles.desc}>Finish setting up your club from the Players tab to unlock this.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary },
  desc: { fontFamily: Fonts.sansRegular, fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20 },
});
