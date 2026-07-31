import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/Text';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/icons/Icon';
import workouts from '../data/workouts';
import { supabase } from '../lib/supabase';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';

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

export default function ExerciseListScreen() {
  const { category } = useLocalSearchParams();
  const [categoryKey, setCategoryKey] = useState('');
  const [allExercises, setAllExercises] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    if (category) {
      const key = Array.isArray(category) ? category[0] : category;
      setCategoryKey(key);
      loadExercises(key);
      setActiveFilter('All');
    }
  }, [category]);

  const loadExercises = async (key: string) => {
    // Built-in exercises from workouts.js
    const builtIn = (workouts as any)[key] || [];

    // Custom exercises from Supabase
    const { data: { session } } = await supabase.auth.getSession();
    let custom: any[] = [];
    if (session?.user) {
      const { data } = await supabase
        .from('custom_exercises')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('category', key);

      if (data) {
        custom = data.map((ex: any) => ({
          name: ex.name,
          description: ex.description ?? '',
          steps: ex.steps ?? [],
          muscles: [],
          logType: ex.log_type,
          videoUrl: ex.video_url ?? '',
          imageUrl: '',
          isCustom: true,
        }));
      }
    }

    setAllExercises([...custom, ...builtIn]);
  };

  const filters = FILTERS[categoryKey] || [];
  const catTheme = CategoryTheme[categoryKey as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };

  const filtered = activeFilter === 'All'
    ? allExercises
    : allExercises.filter((e: any) => e.subcategory === activeFilter.toLowerCase());

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={goBack}>
          <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.eyebrow}>TRAINING</Text>
          <Text style={styles.title}>{CATEGORY_TITLES[categoryKey] ?? ''}</Text>
        </View>
      </View>

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
              style={[styles.pill, activeFilter === filter && { backgroundColor: catTheme.fg }]}
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
        {allExercises.length === 0 ? (
          <Text style={styles.emptyText}>No exercises yet. Add your own from My Workouts!</Text>
        ) : (
          filtered.map((exercise: any, index: number) => (
            <TouchableOpacity
              key={index}
              style={styles.card}
              onPress={() => router.push({
                pathname: '/exercise',
                params: {
                  name: exercise.name,
                  description: exercise.description,
                  steps: JSON.stringify(exercise.steps),
                  muscles: JSON.stringify(exercise.muscles ?? []),
                  category: categoryKey,
                  videoUrl: exercise.videoUrl ?? '',
                  imageUrl: exercise.imageUrl ?? '',
                  logType: exercise.logType ?? 'strength',
                }
              })}
            >
              <View style={styles.cardTitleRow}>
                <View style={styles.cardTitleLeft}>
                  <Text style={styles.cardTitle}>{exercise.name}</Text>
                  {exercise.isCustom && (
                    <View style={[styles.customBadge, { backgroundColor: catTheme.bg }]}>
                      <Text style={[styles.customBadgeText, { color: catTheme.fg }]}>Custom</Text>
                    </View>
                  )}
                </View>
                <Icon name="chevron-right" size={24} color={Theme.textMuted} />
              </View>
              <Text style={styles.cardDesc}>{exercise.description}</Text>
              {exercise.muscles && exercise.muscles.length > 0 && (
                <View style={styles.tagRow}>
                  {exercise.muscles.map((muscle: string, i: number) => (
                    <View key={i} style={[styles.tag, { backgroundColor: catTheme.bg }]}>
                      <Text style={[styles.tagText, { color: catTheme.fg }]}>{muscle}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background, padding: 24, paddingTop: 50 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  eyebrow: { fontSize: 11, fontWeight: '500', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 2 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  filterRow: { flexGrow: 0, marginBottom: 16, minHeight: 44 },
  filterContent: { gap: 8, paddingRight: 8 },
  listContent: { paddingBottom: 24 },
  pill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: Theme.cardWhite, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: Theme.textSecondary, fontSize: 14, fontWeight: '600' },
  pillTextActive: { color: '#FFFFFF' },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 18, marginBottom: 14, borderWidth: 1.5, borderColor: Theme.divider },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  cardTitleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: Theme.textPrimary },
  customBadge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  customBadgeText: { fontSize: 13, fontWeight: '600' },
  cardDesc: { fontSize: 16, color: Theme.textSecondary, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 6 },
  tag: { borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 },
  tagText: { fontSize: 14, fontWeight: '600' },
  emptyText: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
});
