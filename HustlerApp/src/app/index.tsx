import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';

export default function HomeScreen() {
  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      {/* Logo + Tagline */}
      <View style={styles.header}>
        <Text style={styles.logo}>Hustler</Text>
        <Text style={styles.headline}>TRAIN SMART. DOMINATE.</Text>
        <Text style={styles.tagline}>Your personal badminton training coach</Text>
      </View>

      {/* Category Cards */}
      <View style={styles.cards}>
        <TouchableOpacity style={styles.card} onPress={() => router.push('/workouts?category=footwork')}>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="badminton" size={24} color={Colors.accent} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Footwork Drills</Text>
            <Text style={styles.cardSub}>Speed, Agility, Court Movement</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push('/workouts?category=strength')}>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="dumbbell" size={24} color={Colors.accent} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Strength Training</Text>
            <Text style={styles.cardSub}>Legs, Core, Upper Body</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push('/workouts?category=endurance')}>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="lightning-bolt" size={24} color={Colors.accent} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Endurance</Text>
            <Text style={styles.cardSub}>Stamina, Rally Fitness, Interval</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Stats + CTA */}
      <View style={styles.footer}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>20+</Text>
            <Text style={styles.statLabel}>Exercises</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>3+</Text>
            <Text style={styles.statLabel}>Categories</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.ctaButton}>
          <Text style={styles.ctaText}>Get Started</Text>
        </TouchableOpacity>
      </View>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    marginTop: 60,
    marginBottom: 32,
  },
  logo: {
    fontSize: 42,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  headline: {
    fontSize: 26,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  cards: {
    flex: 1,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  cardSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  footer: {
    marginTop: 24,
    marginBottom: 16,
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  ctaButton: {
    backgroundColor: Colors.accent,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});