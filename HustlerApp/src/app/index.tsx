import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';

export default function HomeScreen() {

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_coach, role')
          .eq('id', session.user.id)
          .single();

        if (profile?.is_coach) {
          router.replace('/(coach-tabs)/players' as any);
        } else if (profile?.role === 'club') {
          router.replace('/(club-admin)/dashboard' as any);
        } else if (profile?.role === 'parent') {
          router.replace('/(parent-tabs)/home' as any);
        } else {
          router.replace('/(tabs)' as any);
        }
      }
    };
    checkSession();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/logo-green.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.eyebrow}>YOUR PERSONAL BADMINTON COACH</Text>
        <Text style={styles.headline}>Train smart. Dominate.</Text>
      </View>

      <View style={styles.heroContainer}>
        <Image
          source={require('../../assets/images/badminton.png')}
          style={styles.heroImage}
          resizeMode="contain"
        />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardLeft]}>
          <Text style={styles.statNumber}>20+</Text>
          <Text style={styles.statLabel}>Exercises</Text>
        </View>
        <View style={[styles.statCard, styles.statCardRight]}>
          <Text style={styles.statNumber}>4+</Text>
          <Text style={styles.statLabel}>Categories</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => router.push('/login' as any)}
      >
        <Text style={styles.ctaText}>Get Started</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
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
  eyebrow: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.eyebrowGreen,
    letterSpacing: 1,
    marginBottom: 8,
  },
  headline: {
    fontFamily: Fonts.serifMedium,
    fontSize: 30,
    color: Theme.textPrimary,
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
    backgroundColor: Theme.cardWhite,
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
    color: Theme.textPrimary,
  },
  statLabel: {
    fontSize: 13,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  ctaButton: {
    backgroundColor: Theme.limeAccent,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Theme.limeAccentDark,
  },
});
