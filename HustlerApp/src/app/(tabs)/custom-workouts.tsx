import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, Linking } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

// An assignment has no log_type, so pick a sensible default from its category
// when the player adds it to their own workouts.
const logTypeForCategory = (cat: string | null) => {
  switch (cat) {
    case 'footwork': return 'footwork';
    case 'endurance': return 'sets-duration';
    case 'recovery': return 'recovery';
    case 'strength': return 'reps-sets';
    default: return 'reps-sets';
  }
};

const getCategoryTheme = (cat: string) =>
  CategoryTheme[cat as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'strength': return 'dumbbell';
    case 'footwork': return 'badminton';
    case 'endurance': return 'lightning-bolt';
    case 'recovery': return 'heart-pulse';
    default: return 'star';
  }
};

export default function CustomWorkoutsScreen() {
  const [exercises, setExercises] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const me = session.user.id;

    // Custom exercises (the player's own)
    const { data: ex } = await supabase
      .from('custom_exercises')
      .select('*')
      .eq('user_id', me)
      .order('created_at', { ascending: false });
    if (ex) setExercises(ex);

    // Assignments from coaches
    const { data: asgs } = await supabase
      .from('assignments')
      .select('*')
      .eq('player_id', me)
      .order('created_at', { ascending: false });

    const coachIds = [...new Set((asgs ?? []).map((a: any) => a.coach_id))];
    const nameMap: Record<string, string> = {};
    if (coachIds.length) {
      const { data: coaches } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', coachIds);
      (coaches ?? []).forEach((c: any) => { nameMap[c.id] = c.full_name; });
    }
    setAssignments((asgs ?? []).map((a: any) => ({ ...a, coachName: nameMap[a.coach_id] ?? 'Coach' })));

    // Mark any unseen assignments as seen so the home badge clears.
    const unseenIds = (asgs ?? []).filter((a: any) => !a.seen).map((a: any) => a.id);
    if (unseenIds.length) {
      await supabase.from('assignments').update({ seen: true }).in('id', unseenIds);
    }

    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);
  useFocusEffect(useCallback(() => { loadAll(); }, []));

  const addToMyWorkouts = async (a: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { error } = await supabase.from('custom_exercises').insert({
      user_id: session.user.id,
      name: a.title,
      description: a.instructions ?? '',
      category: a.category ?? 'strength',
      log_type: logTypeForCategory(a.category),
      steps: [],
      notes: '',
      video_url: a.media_type === 'video' ? a.media_url : null,
    });
    if (error) {
      showAlert('Error', error.message);
      return;
    }
    showAlert('Added!', `"${a.title}" is now in your workouts.`);
    loadAll();
  };

  const dismissAssignment = (a: any) => {
    showConfirm('Remove assignment', `Remove "${a.title}" from your assigned list?`, async () => {
      await supabase.from('assignments').delete().eq('id', a.id);
      loadAll();
    });
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

  const goToCreate = () => {
    if (typeof window !== 'undefined') window.location.href = '/create-exercise';
    else router.push('/create-exercise' as any);
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

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>My Workouts</Text>
        <TouchableOpacity style={styles.addBtn} onPress={goToCreate}>
          <MaterialCommunityIcons name="plus" size={22} color="#44403C" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {loading ? (
          <Text style={styles.emptyText}>Loading...</Text>
        ) : (
          <>
            {/* Assigned by coach — Tier 2 tinted, informational/tap-worthy */}
            {assignments.length > 0 && (
              <View style={styles.assignSection}>
                <Text style={styles.sectionLabel}>ASSIGNED BY YOUR COACH</Text>
                {assignments.map((a) => (
                  <View key={a.id} style={styles.assignCard}>
                    <View style={styles.assignHeader}>
                      <MaterialCommunityIcons name="whistle" size={16} color={Theme.todayBlue} />
                      <Text style={styles.assignFrom}>from {a.coachName}</Text>
                      <TouchableOpacity onPress={() => dismissAssignment(a)}>
                        <MaterialCommunityIcons name="close" size={18} color={Theme.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.assignTitle}>{a.title}</Text>
                    {a.instructions ? <Text style={styles.assignInstructions}>{a.instructions}</Text> : null}

                    {a.media_url && a.media_type === 'image' ? (
                      <Image source={{ uri: a.media_url }} style={styles.assignImage} resizeMode="cover" />
                    ) : null}
                    {a.media_url && a.media_type === 'video' ? (
                      <TouchableOpacity style={styles.watchBtn} onPress={() => Linking.openURL(a.media_url)}>
                        <MaterialCommunityIcons name="play-circle-outline" size={18} color={Theme.todayBlue} />
                        <Text style={styles.watchText}>Watch video</Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity style={styles.addToBtn} onPress={() => addToMyWorkouts(a)}>
                      <MaterialCommunityIcons name="plus" size={16} color={Theme.todayBlue} />
                      <Text style={styles.addToBtnText}>Add to My Workouts</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Your custom exercises */}
            {exercises.length === 0 && assignments.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="dumbbell" size={48} color={Theme.textMuted} />
                <Text style={styles.emptyTitle}>No custom workouts yet</Text>
                <Text style={styles.emptyDesc}>Tap the + button to create your first custom exercise!</Text>
                <TouchableOpacity style={styles.createBtn} onPress={goToCreate}>
                  <Text style={styles.createBtnText}>Create Exercise</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {exercises.length > 0 && assignments.length > 0 && (
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>MY WORKOUTS</Text>
                )}
                {exercises.map((exercise) => {
                  const cat = getCategoryTheme(exercise.category);
                  return (
                    <View key={exercise.id} style={styles.card}>
                      <TouchableOpacity style={styles.cardMain} onPress={() => goToExercise(exercise)}>
                        <View style={[styles.iconBox, { backgroundColor: cat.bg }]}>
                          <MaterialCommunityIcons
                            name={getCategoryIcon(exercise.category) as any}
                            size={22}
                            color={cat.fg}
                          />
                        </View>
                        <View style={styles.cardText}>
                          <Text style={styles.cardTitle}>{exercise.name}</Text>
                          <View style={styles.cardMeta}>
                            <Text style={styles.cardCategory}>{exercise.category}</Text>
                            {exercise.video_url ? (
                              <View style={[styles.videoTag, { backgroundColor: cat.bg }]}>
                                <MaterialCommunityIcons name="video" size={12} color={cat.fg} />
                                <Text style={[styles.videoTagText, { color: cat.fg }]}>Video</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={Theme.textMuted} />
                      </TouchableOpacity>

                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.editBtn} onPress={() => editExercise(exercise)}>
                          <MaterialCommunityIcons name="pencil-outline" size={14} color="#44403C" />
                          <Text style={styles.editBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteExercise(exercise.id, exercise.name)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={14} color="#E74C3C" />
                          <Text style={styles.deleteBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  title: { flex: 1, fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E7E5E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingBottom: 120 },
  sectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 12 },
  assignSection: { marginBottom: 20 },
  assignCard: {
    backgroundColor: '#E1F3EE',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  assignHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  assignFrom: { flex: 1, fontSize: 13, color: Theme.todayBlue, fontWeight: '600' },
  assignTitle: { fontSize: 16, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 6 },
  assignInstructions: { fontSize: 15, color: Theme.textSecondary, lineHeight: 20, marginBottom: 12 },
  assignImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 12 },
  watchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  watchText: { fontSize: 13, color: Theme.todayBlue, fontWeight: '600' },
  addToBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#BEE6DA',
    borderRadius: 10,
    paddingVertical: 12,
  },
  addToBtnText: { color: Theme.todayBlue, fontWeight: 'bold', fontSize: 14 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardCategory: { fontSize: 13, color: Theme.textSecondary, textTransform: 'capitalize' },
  videoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  videoTagText: { fontSize: 12, fontWeight: '600' },
  actionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Theme.divider },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: Theme.divider,
  },
  editBtnText: { fontSize: 13, color: '#44403C', fontWeight: '600' },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  deleteBtnText: { fontSize: 13, color: '#E74C3C', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyText: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  createBtn: {
    backgroundColor: '#E7E5E0',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  createBtnText: { color: '#44403C', fontWeight: 'bold', fontSize: 14 },
});
