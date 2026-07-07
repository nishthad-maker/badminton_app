import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';

const CATEGORY_COLORS: Record<string, string> = {
  strength: '#2ECC71',
  footwork: '#3498DB',
  endurance: '#E67E22',
  recovery: '#9B59B6',
};

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'badminton',
  endurance: 'lightning-bolt',
  recovery: 'heart-pulse',
};

export default function RoutineDetailScreen() {
  const { name, exercises: exercisesParam } = useLocalSearchParams();
  const exercises: any[] = JSON.parse(exercisesParam as string || '[]');

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const openExercise = (ex: any) => {
    router.push({
      pathname: '/exercise',
      params: {
        name: ex.name,
        description: ex.description ?? '',
        steps: JSON.stringify(ex.steps ?? []),
        muscles: JSON.stringify(ex.muscles ?? []),
        category: ex.category,
        videoUrl: ex.videoUrl ?? '',
        imageUrl: ex.imageUrl ?? '',
        logType: ex.logType ?? ex.category,
      },
    });
  };

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{name}</Text>
      </View>

      <Text style={styles.subtitle}>{exercises.length} exercise{exercises.length !== 1 ? 's' : ''} · Tap any to open</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {exercises.map((ex: any, i: number) => (
          <TouchableOpacity key={i} style={styles.exCard} onPress={() => openExercise(ex)}>
            {/* Step number */}
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>

            {/* Icon */}
            <View style={[styles.exIcon, { backgroundColor: `${CATEGORY_COLORS[ex.category] ?? Colors.accent}20` }]}>
              <MaterialCommunityIcons
                name={(CATEGORY_ICONS[ex.category] ?? 'dumbbell') as any}
                size={20}
                color={CATEGORY_COLORS[ex.category] ?? Colors.accent}
              />
            </View>

            {/* Info */}
            <View style={{ flex: 1 }}>
              <Text style={styles.exName}>{ex.name}</Text>
              <Text style={styles.exCat}>
                {ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}
                {ex.isCustom ? ' · Custom' : ''}
              </Text>
            </View>

            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        ))}

        {exercises.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="dumbbell" size={40} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No exercises in this routine.</Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 24, paddingTop: 60, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary, flex: 1 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, paddingHorizontal: 24, marginBottom: 16 },
  scroll: { padding: 24, paddingTop: 4, paddingBottom: 80 },
  exCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 13, fontWeight: 'bold', color: Colors.accent },
  exIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  exName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  exCat: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 13, color: Colors.textSecondary },
});
