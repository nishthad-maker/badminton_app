import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import workouts from '../data/workouts';
import { Colors } from '@/constants/theme';

const CATEGORY_TITLES: Record<string, string> = {
  strength: 'Strength Training',
  footwork: 'Footwork Drills',
  endurance: 'Endurance',
  recovery: 'Recovery',
};

const FILTERS: Record<string, string[]> = {
  strength: ['All', 'Lower', 'Upper', 'Core'],
  footwork: [],
  endurance: [],
  recovery: [],
};

export default function WorkoutsScreen() {
  const { category } = useLocalSearchParams();
  const categoryKey = category as string;
  const allExercises = (workouts as any)[categoryKey] || [];
  const filters = FILTERS[categoryKey] || [];
  const [activeFilter, setActiveFilter] = useState('All');

  const filtered = activeFilter === 'All'
    ? allExercises
    : allExercises.filter((e: any) => e.subcategory === activeFilter.toLowerCase());

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    } else {
      router.back();
    }
  };

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <TouchableOpacity style={styles.backBtn} onPress={goBack}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
      </TouchableOpacity>

      <Text style={styles.title}>{CATEGORY_TITLES[categoryKey]}</Text>

      {filters.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.pill, activeFilter === filter && styles.pillActive]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[styles.pillText, activeFilter === filter && styles.pillTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        {filtered.map((exercise: any, index: number) => (
          <TouchableOpacity
            key={index}
            style={styles.card}
            onPress={() => router.push({
              pathname: '/exercise',
              params: {
                name: exercise.name,
                description: exercise.description,
                steps: JSON.stringify(exercise.steps),
                muscles: JSON.stringify(exercise.muscles),
                category: categoryKey,
                videoUrl: exercise.videoUrl ?? '',
                imageUrl: exercise.imageUrl ?? '',
                logType: exercise.logType ?? 'strength',
              }
            })}
          >
            <Text style={styles.cardTitle}>{exercise.name}</Text>
            <Text style={styles.cardDesc}>{exercise.description}</Text>
            <View style={styles.tagRow}>
              {exercise.muscles.map((muscle: string, i: number) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{muscle}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 16 },
  backBtn: { marginBottom: 8, alignSelf: 'flex-start' },
  title: { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
  filterRow: { flexGrow: 0, marginBottom: 16, minHeight: 44 },
  filterContent: { gap: 8, paddingRight: 8 },
  listContent: { paddingBottom: 24 },
  pill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.backgroundCard },
  pillActive: { backgroundColor: Colors.accent },
  pillText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: '#FFFFFF' },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 6 },
  tag: { backgroundColor: Colors.accentMuted, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: Colors.accent, fontSize: 11, fontWeight: '600' },
});
