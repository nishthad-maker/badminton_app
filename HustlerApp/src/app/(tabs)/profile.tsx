import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Colors } from '@/constants/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [streak, setStreak] = useState(0);
  const [memberSince, setMemberSince] = useState('');
  const [topCategory, setTopCategory] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace('/login' as any);
      return;
    }
    setUser(session.user);

    // Member since
    const joined = new Date(session.user.created_at);
    setMemberSince(joined.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    if (profileData) setProfile(profileData);

    const { data } = await supabase
      .from('session_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!data) return;

    setTotalSessions(data.length);

    // Calculate streak
    const dates = [...new Set(data.map(s =>
      new Date(s.created_at).toDateString()
    ))];
    let currentStreak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (dates.includes(d.toDateString())) {
        currentStreak++;
      } else if (i > 0) {
        break;
      }
    }
    setStreak(currentStreak);

    // Most trained category
    const categoryCounts: Record<string, number> = {};
    data.forEach(s => {
      categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
    });
    const top = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const labels: Record<string, string> = {
        strength: 'Strength 💪',
        footwork: 'Footwork 🏸',
        endurance: 'Endurance ⚡',
        recovery: 'Recovery 💜',
      };
      setTopCategory(labels[top[0]] ?? top[0]);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/' as any);
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'strength': return '#2ECC71';
      case 'footwork': return '#3498DB';
      case 'endurance': return '#E67E22';
      case 'recovery': return '#9B59B6';
      default: return Colors.accent;
    }
  };

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="account" size={48} color={Colors.accent} />
          </View>
          <Text style={styles.name}>{profile?.full_name || user?.user_metadata?.full_name || 'Athlete'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {memberSince ? (
            <View style={styles.memberBadge}>
              <Text style={styles.memberText}>Member since {memberSince}</Text>
            </View>
          ) : null}
        </View>

        {/* Stats */}
        <Text style={styles.sectionTitle}>Your Stats</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>💪</Text>
            <Text style={styles.statNumber}>{totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>🔥</Text>
            <Text style={styles.statNumber}>{streak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>📅</Text>
            <Text style={styles.statNumber}>{Math.ceil(totalSessions / 3) || 0}</Text>
            <Text style={styles.statLabel}>Weeks Active</Text>
          </View>
        </View>

        {/* Top Category */}
        {topCategory ? (
          <View style={styles.topCategoryCard}>
            <Text style={styles.sectionLabel}>MOST TRAINED</Text>
            <Text style={styles.topCategoryText}>{topCategory}</Text>
            <Text style={styles.topCategoryDesc}>Keep it up — consistency is key!</Text>
          </View>
        ) : null}

        {/* Options */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.optionsCard}>
          <TouchableOpacity
            style={styles.option}
            onPress={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/workouts?category=strength';
              } else {
                router.push({ pathname: '/workouts', params: { category: 'strength' } });
              }
            }}
          >
            <MaterialCommunityIcons name="dumbbell" size={20} color={Colors.accent} />
            <Text style={styles.optionText}>Go to Workouts</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.option} onPress={handleSignOut}>
            <MaterialCommunityIcons name="logout" size={20} color="#FF4444" />
            <Text style={[styles.optionText, { color: '#FF4444' }]}>Sign Out</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 120 },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  memberBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  memberText: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.accent,
    letterSpacing: 1,
    marginBottom: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  statEmoji: { fontSize: 22 },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  topCategoryCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  topCategoryText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  topCategoryDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  optionsCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
});