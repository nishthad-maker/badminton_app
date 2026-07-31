import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/icons/Icon';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'footprints',
  endurance: 'lightning-bolt',
  recovery: 'heart-pulse',
};

const catTheme = (cat: string) => CategoryTheme[cat as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };

export default function RoutineDetailScreen() {
  const { id, name, exercises: exercisesParam } = useLocalSearchParams();
  const exercises: any[] = JSON.parse(exercisesParam as string || '[]');

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const editRoutine = () => {
    router.push({
      pathname: '/create-routine',
      params: { id: id as string, name: name as string, exercises: JSON.stringify(exercises) },
    });
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{name}</Text>
        <TouchableOpacity style={styles.editBtn} onPress={editRoutine}>
          <Icon name="pencil-outline" size={16} color="#44403C" />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>{exercises.length} exercise{exercises.length !== 1 ? 's' : ''} · Tap any to open</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {exercises.map((ex: any, i: number) => {
          const cat = catTheme(ex.category);
          return (
            <TouchableOpacity key={i} style={styles.exCard} onPress={() => openExercise(ex)}>
              {/* Step number */}
              <View style={[styles.stepNum, { backgroundColor: cat.bg }]}>
                <Text style={[styles.stepNumText, { color: cat.fg }]}>{i + 1}</Text>
              </View>

              {/* Icon */}
              <View style={[styles.exIcon, { backgroundColor: cat.bg }]}>
                <Icon
                  name={(CATEGORY_ICONS[ex.category] ?? 'dumbbell') as any}
                  size={20}
                  color={cat.fg}
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

              <Icon name="chevron-right" size={20} color={Theme.textMuted} />
            </TouchableOpacity>
          );
        })}

        {exercises.length === 0 && (
          <View style={styles.emptyState}>
            <Icon name="dumbbell" size={40} color={Theme.textMuted} />
            <Text style={styles.emptyText}>No exercises in this routine.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 24, paddingTop: 60, paddingBottom: 8 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Theme.textPrimary, flex: 1 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E7E5E0', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  editBtnText: { fontSize: 13, fontWeight: '700', color: '#44403C' },
  subtitle: { fontSize: 14, color: Theme.textSecondary, paddingHorizontal: 24, marginBottom: 16 },
  scroll: { padding: 24, paddingTop: 4, paddingBottom: 80 },
  exCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 13, fontWeight: 'bold' },
  exIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  exName: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  exCat: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Theme.textSecondary },
});
