import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifyWorkoutAssigned } from '../lib/notifications';
import workouts from '../data/workouts';

const CLOUDINARY_CLOUD = 'pyqqwrax';
const CLOUDINARY_PRESET = 'hustler_videos';

const CATEGORIES = ['strength', 'footwork', 'endurance', 'recovery'];

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'badminton',
  endurance: 'lightning-bolt',
  recovery: 'heart-pulse',
};

const CATEGORY_COLORS: Record<string, string> = {
  strength: '#2ECC71',
  footwork: '#3498DB',
  endurance: '#E67E22',
  recovery: '#9B59B6',
};

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

// Flatten all library exercises with their category
const ALL_EXERCISES: { name: string; description: string; category: string }[] = CATEGORIES.flatMap(cat =>
  ((workouts as any)[cat] ?? []).map((ex: any) => ({
    name: ex.name,
    description: ex.description ?? '',
    category: cat,
  }))
);

export default function AssignWorkoutScreen() {
  const { playerId, name, multiMode, coachId } = useLocalSearchParams();
  const isMultiMode = multiMode === 'true';

  // Multi-player state
  const [connectedPlayers, setConnectedPlayers] = useState<{ id: string; name: string }[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(
    playerId ? [playerId as string] : []
  );
  const [loadingPlayers, setLoadingPlayers] = useState(isMultiMode);

  // Mode: 'create' or 'library'
  const [mode, setMode] = useState<'create' | 'library'>('create');
  const [libraryFilter, setLibraryFilter] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [instructions, setInstructions] = useState('');
  const [category, setCategory] = useState('');
  const [mediaUri, setMediaUri] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | ''>('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requiresProof, setRequiresProof] = useState(false);

  // Load connected players in multi mode
  useEffect(() => {
    if (!isMultiMode) return;
    const loadPlayers = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: conns } = await supabase
        .from('coach_connections').select('player_id').eq('coach_id', session.user.id).eq('status', 'accepted');
      const pIds = (conns ?? []).map((c: any) => c.player_id);
      if (!pIds.length) { setLoadingPlayers(false); return; }
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', pIds);
      setConnectedPlayers((profs ?? []).map((p: any) => ({ id: p.id, name: p.full_name ?? 'Player' })));
      setLoadingPlayers(false);
    };
    loadPlayers();
  }, []);

  const goBack = () => {
    if (typeof window !== 'undefined') window.history.back();
    else router.back();
  };

  const pickFromLibrary = (ex: { name: string; description: string; category: string }) => {
    setTitle(ex.name);
    setCategory(ex.category);
    setInstructions(ex.description);
    setNotes('');
    setMode('create'); // Switch to form view with pre-filled data
  };

  const clearForm = () => {
    setTitle('');
    setNotes('');
    setInstructions('');
    setCategory('');
    setMediaUri('');
    setMediaType('');
    setRequiresProof(false);
  };

  const uploadToCloudinary = async (uri: string, kind: 'image' | 'video'): Promise<string | null> => {
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        formData.append('file', blob, kind === 'video' ? 'clip.mp4' : 'photo.jpg');
      } else {
        formData.append('file', {
          uri,
          type: kind === 'video' ? 'video/mp4' : 'image/jpeg',
          name: kind === 'video' ? 'clip.mp4' : 'photo.jpg',
        } as any);
      }
      formData.append('upload_preset', CLOUDINARY_PRESET);
      formData.append('folder', 'hustler_assignments');
      const endpoint = kind === 'video' ? 'video' : 'image';
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${endpoint}/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      return data.secure_url ?? null;
    } catch (e) {
      return null;
    }
  };

  const pickMedia = async (kind: 'image' | 'video') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Please allow library access to attach media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'video' ? ['videos'] : ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    const url = await uploadToCloudinary(result.assets[0].uri, kind);
    setUploading(false);
    if (url) {
      setMediaUri(url);
      setMediaType(kind);
    } else {
      showAlert('Upload failed', 'Could not upload. Please try again.');
    }
  };

  const removeMedia = () => { setMediaUri(''); setMediaType(''); };

  const send = async () => {
    if (!title.trim()) { showAlert('Missing title', 'Give the workout a title.'); return; }
    if (uploading) { showAlert('Please wait', 'Media is still uploading.'); return; }
    if (selectedPlayerIds.length === 0) { showAlert('No players selected', 'Select at least one player.'); return; }
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }

    const fullInstructions = [
      instructions.trim(),
      notes.trim() ? `Coach note: ${notes.trim()}` : '',
    ].filter(Boolean).join('\n\n');

    // Insert one assignment per selected player
    const inserts = selectedPlayerIds.map(pid => ({
      coach_id: session.user.id,
      player_id: pid,
      title: title.trim(),
      instructions: fullInstructions || null,
      category: category || null,
      media_url: mediaUri || null,
      media_type: mediaType || null,
      requires_proof: requiresProof,
    }));

    const { error } = await supabase.from('assignments').insert(inserts);
    setLoading(false);
    if (error) { showAlert('Error', error.message); return; }

    // Notify each selected player
    const { data: coachProfile } = await supabase
      .from('profiles').select('full_name').eq('id', session.user.id).single();
    for (const pid of selectedPlayerIds) {
      await notifyWorkoutAssigned(pid, coachProfile?.full_name ?? 'Your coach', title.trim());
    }

    const recipientNames = isMultiMode
      ? connectedPlayers.filter(p => selectedPlayerIds.includes(p.id)).map(p => p.name).join(', ')
      : (name || 'your player');

    showAlert('Sent!', `Workout assigned to ${recipientNames}.`);
    goBack();
  };

  // Filtered library exercises
  const filteredExercises = libraryFilter
    ? ALL_EXERCISES.filter(ex => ex.category === libraryFilter)
    : ALL_EXERCISES;

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.title}>Assign Workout</Text>
        </View>
        {name ? <Text style={styles.forWho}>For {name}</Text> : null}

        {/* Multi-player selector */}
        {isMultiMode && (
          <View style={styles.playerSelectSection}>
            <Text style={styles.label}>Select Players</Text>
            {loadingPlayers ? (
              <ActivityIndicator color={Colors.accent} />
            ) : connectedPlayers.length === 0 ? (
              <Text style={styles.noPlayersText}>No connected players found.</Text>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.selectAllBtn}
                  onPress={() => setSelectedPlayerIds(
                    selectedPlayerIds.length === connectedPlayers.length ? [] : connectedPlayers.map(p => p.id)
                  )}
                >
                  <Text style={styles.selectAllText}>
                    {selectedPlayerIds.length === connectedPlayers.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
                {connectedPlayers.map(p => {
                  const sel = selectedPlayerIds.includes(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.playerSelectRow, sel && styles.playerSelectRowActive]}
                      onPress={() => setSelectedPlayerIds(prev =>
                        sel ? prev.filter(id => id !== p.id) : [...prev, p.id]
                      )}
                    >
                      <View style={styles.playerSelectAvatar}>
                        <Text style={styles.playerSelectAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.playerSelectName, sel && styles.playerSelectNameActive]}>{p.name}</Text>
                      <View style={[styles.playerCheckbox, sel && styles.playerCheckboxActive]}>
                        {sel && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {selectedPlayerIds.length > 0 && (
                  <Text style={styles.selectedCount}>{selectedPlayerIds.length} player{selectedPlayerIds.length !== 1 ? 's' : ''} selected</Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'create' && styles.modeBtnActive]}
            onPress={() => setMode('create')}
          >
            <MaterialCommunityIcons name="pencil-outline" size={16} color={mode === 'create' ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.modeBtnText, mode === 'create' && styles.modeBtnTextActive]}>Create your own</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'library' && styles.modeBtnActive]}
            onPress={() => setMode('library')}
          >
            <MaterialCommunityIcons name="book-open-outline" size={16} color={mode === 'library' ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.modeBtnText, mode === 'library' && styles.modeBtnTextActive]}>Pick from library</Text>
          </TouchableOpacity>
        </View>

        {/* Weekly plan shortcut */}
        <TouchableOpacity
          style={styles.weeklyPlanBtn}
          onPress={() => router.push({ pathname: '/assign-weekly-plan', params: { playerId: playerId as string, name: name as string } })}
        >
          <MaterialCommunityIcons name="calendar-week" size={18} color={Colors.accent} />
          <Text style={styles.weeklyPlanBtnText}>Assign a Weekly Training Plan instead →</Text>
        </TouchableOpacity>

        {/* LIBRARY MODE */}
        {mode === 'library' && (
          <View>
            <Text style={styles.libraryHint}>Tap an exercise to pre-fill the form</Text>

            {/* Category filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
              <TouchableOpacity
                style={[styles.catBtn, libraryFilter === '' && styles.catBtnActive]}
                onPress={() => setLibraryFilter('')}
              >
                <Text style={[styles.catText, libraryFilter === '' && styles.catTextActive]}>All</Text>
              </TouchableOpacity>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.catBtn, libraryFilter === c && styles.catBtnActive]}
                  onPress={() => setLibraryFilter(c)}
                >
                  <Text style={[styles.catText, libraryFilter === c && styles.catTextActive]}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Exercise list */}
            {filteredExercises.map((ex, i) => (
              <TouchableOpacity
                key={i}
                style={styles.libraryCard}
                onPress={() => pickFromLibrary(ex)}
              >
                <View style={[styles.libraryCatIcon, { backgroundColor: `${CATEGORY_COLORS[ex.category]}20` }]}>
                  <MaterialCommunityIcons
                    name={CATEGORY_ICONS[ex.category] as any}
                    size={18}
                    color={CATEGORY_COLORS[ex.category]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.libraryExName}>{ex.name}</Text>
                  <Text style={styles.libraryExCat}>{ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* CREATE / FORM MODE */}
        {mode === 'create' && (
          <>
            {/* Show a "picked from library" chip if title was pre-filled */}
            {title && category ? (
              <View style={styles.prefilledBanner}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={Colors.accent} />
                <Text style={styles.prefilledText}>Pre-filled from library — edit as needed</Text>
                <TouchableOpacity onPress={clearForm}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Footwork ladder drills"
              placeholderTextColor={Colors.textSecondary}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>Notes for player <Text style={styles.labelOptional}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Focus on form, use 10kg, try 3 sets"
              placeholderTextColor={Colors.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Show full instructions collapsed if pre-filled from library */}
            {instructions ? (
              <View style={styles.instructionsPreview}>
                <Text style={styles.instructionsPreviewLabel}>Exercise description (from library)</Text>
                <Text style={styles.instructionsPreviewText} numberOfLines={3}>{instructions}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Category <Text style={styles.labelOptional}>(optional)</Text></Text>
            <View style={styles.catRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.catBtn, category === c && styles.catBtnActive]}
                  onPress={() => setCategory(category === c ? '' : c)}
                >
                  <Text style={[styles.catText, category === c && styles.catTextActive]}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Photo or video <Text style={styles.labelOptional}>(optional)</Text></Text>
            {uploading ? (
              <View style={styles.mediaBox}>
                <ActivityIndicator color={Colors.accent} />
                <Text style={styles.mediaHint}>Uploading...</Text>
              </View>
            ) : mediaUri ? (
              <View style={styles.mediaSelected}>
                <MaterialCommunityIcons
                  name={mediaType === 'video' ? 'video-check' : 'image-check'}
                  size={22}
                  color={Colors.accent}
                />
                <Text style={styles.mediaSelectedText}>{mediaType === 'video' ? 'Video attached' : 'Photo attached'} ✓</Text>
                <TouchableOpacity onPress={removeMedia}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.mediaRow}>
                <TouchableOpacity style={styles.mediaBtn} onPress={() => pickMedia('image')}>
                  <MaterialCommunityIcons name="image-outline" size={20} color={Colors.accent} />
                  <Text style={styles.mediaBtnText}>Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaBtn} onPress={() => pickMedia('video')}>
                  <MaterialCommunityIcons name="video-outline" size={20} color={Colors.accent} />
                  <Text style={styles.mediaBtnText}>Video</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Require proof toggle */}
            <TouchableOpacity style={styles.toggleRow} onPress={() => setRequiresProof(!requiresProof)} activeOpacity={0.7}>
              <View style={styles.toggleLeft}>
                <MaterialCommunityIcons name="check-circle-outline" size={22} color={requiresProof ? Colors.accent : Colors.textSecondary} />
                <View>
                  <Text style={[styles.toggleLabel, requiresProof && styles.toggleLabelActive]}>Require proof</Text>
                  <Text style={styles.toggleSub}>Player must upload a photo or video to mark this done</Text>
                </View>
              </View>
              <View style={[styles.toggle, requiresProof && styles.toggleOn]}>
                <View style={[styles.toggleThumb, requiresProof && styles.toggleThumbOn]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sendBtn, (loading || uploading) && styles.sendBtnDisabled]}
              onPress={send}
              disabled={loading || uploading}
            >
              <Text style={styles.sendBtnText}>{loading ? 'Sending...' : 'Assign Workout'}</Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
  forWho: { fontSize: 13, color: Colors.accent, fontWeight: '600', marginBottom: 20 },

  weeklyPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  weeklyPlanBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600', flex: 1 },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeBtnActive: { backgroundColor: Colors.accent },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  modeBtnTextActive: { color: '#FFFFFF' },

  // Library
  libraryHint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  libraryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  libraryCatIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryExName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  libraryExCat: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // Pre-filled banner
  prefilledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  prefilledText: { flex: 1, fontSize: 12, color: Colors.accent, fontWeight: '600' },

  // Instructions preview
  instructionsPreview: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 2,
    borderLeftColor: Colors.accent,
  },
  instructionsPreviewLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4 },
  instructionsPreviewText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  // Form
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  labelOptional: { fontWeight: '400', color: Colors.textSecondary, fontSize: 12 },
  input: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 10,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 48,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  catText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  catTextActive: { color: '#FFFFFF' },
  mediaRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accentMuted,
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderStyle: 'dashed',
  },
  mediaBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  mediaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  mediaHint: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  mediaSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  mediaSelectedText: { flex: 1, fontSize: 13, color: Colors.accent, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 2 },
  toggleLabelActive: { color: Colors.accent },
  toggleSub: { fontSize: 11, color: Colors.textSecondary, flexShrink: 1 },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: { backgroundColor: Colors.accent },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
  sendBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },

  // Multi-player selector
  playerSelectSection: { marginBottom: 20 },
  noPlayersText: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  selectAllBtn: { alignSelf: 'flex-end', marginBottom: 8 },
  selectAllText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  playerSelectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: 'transparent',
  },
  playerSelectRowActive: { borderColor: Colors.accent, backgroundColor: Colors.accentMuted },
  playerSelectAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  playerSelectAvatarText: { fontSize: 15, fontWeight: 'bold', color: Colors.accent },
  playerSelectName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  playerSelectNameActive: { color: Colors.accent },
  playerCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  playerCheckboxActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  selectedCount: { fontSize: 12, color: Colors.accent, fontWeight: '600', textAlign: 'center', marginTop: 4 },
});
