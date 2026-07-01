import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

export default function CustomWorkoutsScreen() {
  const [exercises, setExercises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExercises();
  }, []);

  const loadExercises = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data } = await supabase
      .from('custom_exercises')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (data) setExercises(data);
    setLoading(false);
  };

  const deleteExercise = (id: string, name: string) => {
    showConfirm(
      'Delete Exercise',
      `Are you sure you want to delete "${name}"? This cannot be undone.`,
      async () => {
        await supabase.from('custom_exercises').delete().eq('id', id);
        setExercises(exercises.filter((e) => e.id !== id));
      }
    );
  };

  const editExercise = (exercise: any) => {
    if (typeof window !== 'undefined') {
      window.location.href = `/create-exercise?id=${exercise.id}`;
    } else {
      router.push({ pathname: '/create-exercise', params: { id: exercise.id } });
    }
  };

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
    }
  };

  const goToCreate = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/create-exercise';
    } else {
      router.push('/create-exercise' as any);
    }
  };

  const goToExercise = (exercise: any) => {
    router.push({
      pathname: '/exercise',
      params: {
        name: exercise.name,
        description: exercise.description ?? '',
        steps: JSON.stringify(exercise.steps ?? []),
        muscles: JSON.stringify([]),
        category: exercise.category,
        videoUrl: exercise.video_url ?? '',
        imageUrl: '',
        logType: exercise.log_type,
      }
    });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'strength': return '#2ECC71';
      case 'footwork': return '#3498DB';
      case 'endurance': return '#E67E22';
      case 'recovery': return '#9B59B6';
      default: return Colors.accent;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'strength': return 'dumbbell';
      case 'footwork': return 'badminton';
      case 'endurance': return 'lightning-bolt';
      case 'recovery': return 'heart-pulse';
      default: return 'star';
    }
  };

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={goBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>My Workouts</Text>
        <TouchableOpacity style={styles.addBtn} onPress={goToCreate}>
          <MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {loading ? (
          <Text style={styles.emptyText}>Loading...</Text>
        ) : exercises.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="dumbbell" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>No custom workouts yet</Text>
            <Text style={styles.emptyDesc}>Tap the + button to create your first custom exercise!</Text>
            <TouchableOpacity style={styles.createBtn} onPress={goToCreate}>
              <Text style={styles.createBtnText}>Create Exercise</Text>
            </TouchableOpacity>
          </View>
        ) : (
          exercises.map((exercise) => (
            <View key={exercise.id} style={styles.card}>
              {/* Main tappable area */}
              <TouchableOpacity
                style={styles.cardMain}
                onPress={() => goToExercise(exercise)}
              >
                <View style={[styles.iconBox, { backgroundColor: `${getCategoryColor(exercise.category)}20` }]}>
                  <MaterialCommunityIcons
                    name={getCategoryIcon(exercise.category) as any}
                    size={22}
                    color={getCategoryColor(exercise.category)}
                  />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{exercise.name}</Text>
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardCategory}>{exercise.category}</Text>
                    {exercise.video_url ? (
                      <View style={styles.videoTag}>
                        <MaterialCommunityIcons name="video" size={11} color={Colors.accent} />
                        <Text style={styles.videoTagText}>Video</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              {/* Edit + Delete row */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => editExercise(exercise)}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={14} color={Colors.accent} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteExercise(exercise.id, exercise.name)}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={14} color="#FF6B6B" />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  title: { flex: 1, fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingBottom: 40 },
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardCategory: { fontSize: 12, color: Colors.textSecondary, textTransform: 'capitalize' },
  videoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  videoTagText: { fontSize: 10, color: Colors.accent, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  editBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  deleteBtnText: { fontSize: 13, color: '#FF6B6B', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
  emptyDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyText: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  createBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  createBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});