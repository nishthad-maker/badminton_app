import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';

export default function CommunityScreen() {
  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="account-group" size={64} color={Colors.accent} />
        </View>
        <Text style={styles.title}>Community</Text>
        <Text style={styles.subtitle}>Coming Soon</Text>
        <Text style={styles.description}>
          Connect with badminton players anonymously. Share workouts, celebrate wins, and motivate each other.
        </Text>

        <View style={styles.featureList}>
          {[
            '🏸 Anonymous workout sharing',
            '🔥 Weekly challenges',
            '🏆 Leaderboards',
            '💬 Training tips',
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.accent,
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  featureList: {
    width: '100%',
    gap: 10,
  },
  featureRow: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 10,
    padding: 14,
  },
  featureText: { fontSize: 14, color: Colors.textPrimary },
});
