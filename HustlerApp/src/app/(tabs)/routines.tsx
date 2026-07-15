import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text } from '@/components/Text';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../../lib/supabase';

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

export default function RoutinesScreen() {
  const [routines, setRoutines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }
    const { data } = await supabase
      .from('routines')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    setRoutines(data ?? []);
    setLoading(false);
  };

  const deleteRoutine = (id: string, name: string) => {
    showConfirm('Delete Routine', `Delete "${name}"? This can't be undone.`, async () => {
      await supabase.from('routines').delete().eq('id', id);
      setRoutines(prev => prev.filter(r => r.id !== id));
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Routines</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/create-routine' as any)}
        >
          <MaterialCommunityIcons name="plus" size={22} color="#44403C" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : routines.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="dumbbell" size={48} color={Theme.textMuted} />
            <Text style={styles.emptyTitle}>No routines yet</Text>
            <Text style={styles.emptyDesc}>Tap the + button to create your first routine.</Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => router.push('/create-routine' as any)}
            >
              <MaterialCommunityIcons name="plus" size={18} color="#44403C" />
              <Text style={styles.createBtnText}>Create Routine</Text>
            </TouchableOpacity>
          </View>
        ) : (
          routines.map((r: any) => {
            const exercises: any[] = r.exercises ?? [];
            // Get unique categories for color dots
            const cats = [...new Set(exercises.map((e: any) => e.category))].slice(0, 4);
            return (
              <TouchableOpacity
                key={r.id}
                style={styles.routineCard}
                onPress={() => router.push({ pathname: '/routine-detail', params: { id: r.id, name: r.name, exercises: JSON.stringify(exercises) } })}
              >
                <View style={styles.routineLeft}>
                  {/* Category color dots */}
                  <View style={styles.catDots}>
                    {cats.map((cat: string, i: number) => (
                      <View key={i} style={[styles.catDot, { backgroundColor: (CategoryTheme[cat as keyof typeof CategoryTheme] ?? { fg: Theme.eyebrowGreen }).fg }]} />
                    ))}
                  </View>
                  <View>
                    <Text style={styles.routineName}>{r.name}</Text>
                    <Text style={styles.routineSub}>
                      {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
                      {exercises.length > 0 ? ` · ${exercises.map((e: any) => e.name).slice(0, 2).join(', ')}${exercises.length > 2 ? '...' : ''}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.routineRight}>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => deleteRoutine(r.id, r.name)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color="#E74C3C" />
                  </TouchableOpacity>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Theme.textMuted} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingTop: 60, paddingBottom: 16 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 30, color: Theme.textPrimary },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E7E5E0', alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, paddingTop: 8, paddingBottom: 120 },
  muted: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary },
  emptyDesc: { fontSize: 15, color: Theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E7E5E0', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  createBtnText: { color: '#44403C', fontWeight: 'bold', fontSize: 14 },
  routineCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 16, marginBottom: 12 },
  routineLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  catDots: { flexDirection: 'column', gap: 4 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  routineName: { fontSize: 16, fontWeight: '700', color: Theme.textPrimary, marginBottom: 3 },
  routineSub: { fontSize: 13, color: Theme.textSecondary },
  routineRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: { padding: 4 },
});
