import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function HomeScreen() {
  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      {/* Logo */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.headline}>TRAIN SMART. DOMINATE.</Text>
        <Text style={styles.tagline}>Your personal badminton training coach</Text>
      </View>

      {/* Racquet Hero Image */}
      <View style={styles.heroContainer}>
        <Image
          source={require('../../assets/images/badminton.png')}
          style={styles.heroImage}
          resizeMode="contain"
        />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
  <View style={[styles.statCard, styles.statCardLeft]}>
    <Text style={styles.statNumber}>24+</Text>
    <Text style={styles.statLabel}>Exercises</Text>
  </View>
  <View style={[styles.statCard, styles.statCardRight]}>
    <Text style={styles.statNumber}>3+</Text>
    <Text style={styles.statLabel}>Categories</Text>
  </View>
</View>

      {/* CTA */}
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => router.push('/login' as any)}
      >
        <Text style={styles.ctaText}>Get Started</Text>
      </TouchableOpacity>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
  },
  logo: {
    width: 200,
    height: 80,
    marginBottom: 16,
  },
  headline: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  heroContainer: {
  flex: 1,
  width: '120%',
  marginLeft: '10%',
  justifyContent: 'center',
},
heroImage: {
  width: '100%',
  height: 300,
},
  statsRow: {
  flexDirection: 'row',
  gap: 12,
  width: '100%',
  marginBottom: 16,
  alignItems: 'center',
},
statCard: {
  flex: 1,
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 20,
  alignItems: 'flex-start',
},
statCardLeft: {
  transform: [{ rotate: '-5deg' }],
},
statCardRight: {
  transform: [{ rotate: '5deg' }],
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
    width: '100%',
    marginBottom: 24,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});