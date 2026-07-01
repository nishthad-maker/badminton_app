import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

const CATEGORIES = [
  {
    key: 'strength',
    title: 'Strength Training',
    sub: 'Legs, Core, Upper Body',
    icon: 'dumbbell',
    color: '#2ECC71',
    bg: 'rgba(46,204,113,0.15)',
  },
  {
    key: 'footwork',
    title: 'Footwork Drills',
    sub: 'Speed, Agility, Court Movement',
    icon: 'badminton',
    color: '#3498DB',
    bg: 'rgba(52,152,219,0.15)',
  },
  {
    key: 'endurance',
    title: 'Endurance',
    sub: 'Stamina, Rally Fitness, Interval',
    icon: 'lightning-bolt',
    color: '#E67E22',
    bg: 'rgba(230,126,34,0.15)',
  },
  {
    key: 'recovery',
    title: 'Recovery',
    sub: 'Stretching, Foam Rolling, Breathing',
    icon: 'heart-pulse',
    color: '#9B59B6',
    bg: 'rgba(155,89,182,0.15)',
  },
];

export default function TrainScreen() {
  const [customCounts, setCustomCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadCustomCounts();
  }, []);

  const loadCustomCounts = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data } = await supabase
      .from('custom_exercises')
      .select('category')
      .eq('user_id', session.user.id);

    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((ex: any) => {
        counts[ex.category] = (counts[ex.category] || 0) + 1;
      });
      setCustomCounts(counts);
    }
  };

  const navigate = (category: string) => {
    router.push({ pathname: '/exercise-list', params: { category } });
  };

  const goToCustomWorkouts = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/custom-workouts';
    } else {
      router.push('/custom-workouts' as any);
    }
  };

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Train</Text>

        <View style={styles.cards}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={styles.card}
              onPress={() => navigate(cat.key)}
            >
              <View style={[styles.iconBox, { backgroundColor: cat.bg }]}>
                <MaterialCommunityIcons name={cat.icon as any} size={24} color={cat.color} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{cat.title}</Text>
                <View style={styles.cardSubRow}>
                  <Text style={styles.cardSub}>{cat.sub}</Text>
                  {customCounts[cat.key] ? (
                    <View style={styles.customBadge}>
                      <Text style={styles.customBadgeText}>+{customCounts[cat.key]} custom</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          ))}

          <View style={styles.divider} />

          <TouchableOpacity style={[styles.card, styles.customCard]} onPress={goToCustomWorkouts}>
            <View style={[styles.iconBox, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <MaterialCommunityIcons name="plus-circle-outline" size={24} color={Colors.textPrimary} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>My Workouts</Text>
              <Text style={styles.cardSub}>
                {Object.values(customCounts).reduce((a, b) => a + b, 0) > 0
                  ? `${Object.values(customCounts).reduce((a, b) => a + b, 0)} custom exercise${Object.values(customCounts).reduce((a, b) => a + b, 0) !== 1 ? 's' : ''}`
                  : 'Your custom exercises'}
              </Text>
            </View>
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
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 24 },
  cards: { gap: 12 },
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  customCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  cardSub: { fontSize: 12, color: Colors.textSecondary },
  customBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  customBadgeText: { fontSize: 10, color: Colors.accent, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.border },
});