import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, ActivityIndicator } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@/components/icons/Icon';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifyWorkoutAssigned } from '../lib/notifications';
import { getMyClub, getClubRosterForCoach } from '../lib/club';
import workouts from '../data/workouts';

const CLOUDINARY_CLOUD = 'pyqqwrax';
const CLOUDINARY_PRESET = 'hustler_videos';

const CATEGORIES = ['strength', 'footwork', 'endurance', 'recovery'];

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'footprints',
  endurance: 'lightning-bolt',
  recovery: 'heart-pulse',
};

const catTheme = (cat: string) => CategoryTheme[cat as keyof typeof CategoryTheme] ?? { bg: Theme.cardTinted, fg: Theme.eyebrowGreen };

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const buildInstructions = (instructions: string, notes: string) => [
  instructions.trim(),
  notes.trim() ? `Coach note: ${notes.trim()}` : '',
].filter(Boolean).join('\n\n');

// Flatten all library exercises with their category
const ALL_EXERCISES: { name: string; description: string; category: string }[] = CATEGORIES.flatMap(cat =>
  ((workouts as any)[cat] ?? []).map((ex: any) => ({
    name: ex.name,
    description: ex.description ?? '',
    category: cat,
  }))
);

type WorkoutDraft = {
  id: string;
  title: string;
  notes: string;
  instructions: string;
  category: string;
  mediaUri: string;
  mediaType: 'image' | 'video' | '';
  requiresProof: boolean;
};

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

  // Queue of workouts already added, waiting to be sent alongside the one
  // currently being drafted below.
  const [queue, setQueue] = useState<WorkoutDraft[]>([]);
  const [optionalOpen, setOptionalOpen] = useState(false);

  // Form state (the workout currently being drafted)
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
      const [{ data: conns }, club] = await Promise.all([
        supabase.from('coach_connections').select('player_id').eq('coach_id', session.user.id).eq('status', 'accepted'),
        getMyClub(),
      ]);
      let pIds = (conns ?? []).map((c: any) => c.player_id);
      // A club-joined coach's roster comes from club_members, not
      // coach_connections — union both so bulk-assign can reach club players too.
      if (club) {
        const batches = await getClubRosterForCoach(club.clubId);
        const clubIds = batches.flatMap((b) => b.players.map((p) => p.id));
        pIds = [...new Set([...pIds, ...clubIds])];
      }
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
    setOptionalOpen(true);
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

  const addToQueue = () => {
    if (!title.trim()) { showAlert('Missing title', 'Give the workout a title before adding another.'); return; }
    if (uploading) { showAlert('Please wait', 'Media is still uploading.'); return; }
    setQueue(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: title.trim(), notes, instructions, category, mediaUri, mediaType, requiresProof,
    }]);
    clearForm();
    setOptionalOpen(false);
  };

  const editQueued = (w: WorkoutDraft) => {
    setTitle(w.title);
    setNotes(w.notes);
    setInstructions(w.instructions);
    setCategory(w.category);
    setMediaUri(w.mediaUri);
    setMediaType(w.mediaType);
    setRequiresProof(w.requiresProof);
    setQueue(prev => prev.filter(q => q.id !== w.id));
    setOptionalOpen(Boolean(w.notes || w.category || w.mediaUri || w.requiresProof));
    setMode('create');
  };

  const removeFromQueue = (id: string) => setQueue(prev => prev.filter(w => w.id !== id));

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
    if (uploading) { showAlert('Please wait', 'Media is still uploading.'); return; }
    if (selectedPlayerIds.length === 0) { showAlert('No players selected', 'Select at least one player.'); return; }

    const draftValid = title.trim().length > 0;
    const allWorkouts: WorkoutDraft[] = [
      ...queue,
      ...(draftValid ? [{
        id: 'draft', title: title.trim(), notes, instructions, category, mediaUri, mediaType, requiresProof,
      }] : []),
    ];
    if (allWorkouts.length === 0) { showAlert('No workouts', 'Add at least one workout before assigning.'); return; }

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }

    // Insert one assignment per selected player per queued workout
    const inserts = selectedPlayerIds.flatMap(pid => allWorkouts.map(w => ({
      coach_id: session.user.id,
      player_id: pid,
      title: w.title,
      instructions: buildInstructions(w.instructions, w.notes) || null,
      category: w.category || null,
      media_url: w.mediaUri || null,
      media_type: w.mediaType || null,
      requires_proof: w.requiresProof,
    })));

    const { error } = await supabase.from('assignments').insert(inserts);
    setLoading(false);
    if (error) { showAlert('Error', error.message); return; }

    // Notify each selected player about each workout they received
    const { data: coachProfile } = await supabase
      .from('profiles').select('full_name').eq('id', session.user.id).single();
    const coachName = coachProfile?.full_name ?? 'Your coach';
    for (const pid of selectedPlayerIds) {
      for (const w of allWorkouts) {
        await notifyWorkoutAssigned(pid, coachName, w.title);
      }
    }

    const recipientNames = isMultiMode
      ? connectedPlayers.filter(p => selectedPlayerIds.includes(p.id)).map(p => p.name).join(', ')
      : (name || 'your player');

    showAlert('Sent!', `${allWorkouts.length} workout${allWorkouts.length !== 1 ? 's' : ''} assigned to ${recipientNames}.`);
    goBack();
  };

  // Filtered library exercises
  const filteredExercises = libraryFilter
    ? ALL_EXERCISES.filter(ex => ex.category === libraryFilter)
    : ALL_EXERCISES;

  const pendingCount = queue.length + (title.trim() ? 1 : 0);

  const optionalSummary = [
    notes.trim() ? 'Notes' : '',
    category ? category.charAt(0).toUpperCase() + category.slice(1) : '',
    mediaUri ? (mediaType === 'video' ? 'Video' : 'Photo') : '',
    requiresProof ? 'Proof required' : '',
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Assign Workout</Text>
        </View>
        {name ? <Text style={styles.forWho}>For {name}</Text> : null}

        {/* Multi-player selector */}
        {isMultiMode && (
          <View style={styles.playerSelectSection}>
            <View style={styles.playerSelectHeader}>
              <Text style={styles.label}>Select Players</Text>
              {connectedPlayers.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSelectedPlayerIds(
                    selectedPlayerIds.length === connectedPlayers.length ? [] : connectedPlayers.map(p => p.id)
                  )}
                >
                  <Text style={styles.selectAllText}>
                    {selectedPlayerIds.length === connectedPlayers.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {loadingPlayers ? (
              <ActivityIndicator color={Theme.eyebrowGreen} />
            ) : connectedPlayers.length === 0 ? (
              <Text style={styles.noPlayersText}>No connected players found.</Text>
            ) : (
              <>
                <View style={styles.playerGrid}>
                  {connectedPlayers.map(p => {
                    const sel = selectedPlayerIds.includes(p.id);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.playerChip, sel && styles.playerChipActive]}
                        onPress={() => setSelectedPlayerIds(prev =>
                          sel ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        )}
                      >
                        <View style={[styles.playerChipAvatar, sel && styles.playerChipAvatarActive]}>
                          <Text style={[styles.playerChipAvatarText, sel && styles.playerChipAvatarTextActive]}>
                            {p.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.playerChipName, sel && styles.playerChipNameActive]} numberOfLines={1}>{p.name}</Text>
                        {sel && (
                          <View style={styles.playerChipCheck}>
                            <Icon name="check" size={14} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {selectedPlayerIds.length > 0 && (
                  <Text style={styles.selectedCount}>{selectedPlayerIds.length} player{selectedPlayerIds.length !== 1 ? 's' : ''} selected</Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Queued workouts */}
        {queue.length > 0 && (
          <View style={styles.queueSection}>
            <Text style={styles.label}>Workouts to Assign ({queue.length})</Text>
            {queue.map(w => {
              const cat = catTheme(w.category);
              return (
                <View key={w.id} style={styles.queueCard}>
                  <TouchableOpacity style={styles.queueCardMain} onPress={() => editQueued(w)}>
                    <View style={[styles.queueIcon, { backgroundColor: cat.bg }]}>
                      <Icon
                        name={((w.category && CATEGORY_ICONS[w.category]) || 'clipboard-text-outline') as any}
                        size={18}
                        color={cat.fg}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.queueTitle} numberOfLines={1}>{w.title}</Text>
                      {(w.requiresProof || w.mediaUri) && (
                        <View style={styles.queueTagRow}>
                          {w.requiresProof && <Text style={styles.queueTag}>Proof required</Text>}
                          {w.mediaUri && (
                            <Icon name={w.mediaType === 'video' ? 'video' : 'image'} size={14} color={Theme.eyebrowGreen} />
                          )}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeFromQueue(w.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icon name="trash-can-outline" size={20} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'create' && styles.modeBtnActive]}
            onPress={() => setMode('create')}
          >
            <Icon name="pencil-outline" size={18} color={mode === 'create' ? '#fff' : Theme.textSecondary} />
            <Text style={[styles.modeBtnText, mode === 'create' && styles.modeBtnTextActive]} numberOfLines={1}>Create your own</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'library' && styles.modeBtnActive]}
            onPress={() => setMode('library')}
          >
            <Icon name="book-open-outline" size={18} color={mode === 'library' ? '#fff' : Theme.textSecondary} />
            <Text style={[styles.modeBtnText, mode === 'library' && styles.modeBtnTextActive]} numberOfLines={1}>Pick from library</Text>
          </TouchableOpacity>
        </View>

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
            {filteredExercises.map((ex, i) => {
              const cat = catTheme(ex.category);
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.libraryCard}
                  onPress={() => pickFromLibrary(ex)}
                >
                  <View style={[styles.libraryCatIcon, { backgroundColor: cat.bg }]}>
                    <Icon
                      name={CATEGORY_ICONS[ex.category] as any}
                      size={18}
                      color={cat.fg}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.libraryExName}>{ex.name}</Text>
                    <Text style={styles.libraryExCat}>{ex.category.charAt(0).toUpperCase() + ex.category.slice(1)}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={Theme.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* CREATE / FORM MODE */}
        {mode === 'create' && (
          <>
            {/* Show a "picked from library" chip if title was pre-filled */}
            {title && category ? (
              <View style={styles.prefilledBanner}>
                <Icon name="check-circle-outline" size={16} color={Theme.eyebrowGreen} />
                <Text style={styles.prefilledText}>Pre-filled from library — edit as needed</Text>
                <TouchableOpacity onPress={clearForm}>
                  <Icon name="close-circle" size={18} color={Theme.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Footwork ladder drills"
              placeholderTextColor={Theme.textSecondary}
              value={title}
              onChangeText={setTitle}
            />

            {/* Optional details dropdown */}
            <TouchableOpacity style={styles.optionalToggle} onPress={() => setOptionalOpen(!optionalOpen)} activeOpacity={0.7}>
              <Text style={styles.optionalToggleText}>Optional details</Text>
              {!optionalOpen && optionalSummary ? (
                <Text style={styles.optionalSummary} numberOfLines={1}>{optionalSummary}</Text>
              ) : null}
              <Icon name={optionalOpen ? 'chevron-up' : 'chevron-down'} size={24} color={Theme.eyebrowGreen} />
            </TouchableOpacity>

            {optionalOpen && (
              <View style={styles.optionalPanel}>
                <Text style={styles.label}>Notes for player</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Focus on form, use 10kg, try 3 sets"
                  placeholderTextColor={Theme.textSecondary}
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

                <Text style={styles.label}>Category</Text>
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

                <Text style={styles.label}>Photo or video</Text>
                {uploading ? (
                  <View style={styles.mediaBox}>
                    <ActivityIndicator color={Theme.eyebrowGreen} />
                    <Text style={styles.mediaHint}>Uploading...</Text>
                  </View>
                ) : mediaUri ? (
                  <View style={styles.mediaSelected}>
                    <Icon
                      name={mediaType === 'video' ? 'video-check' : 'image-check'}
                      size={22}
                      color={Theme.eyebrowGreen}
                    />
                    <Text style={styles.mediaSelectedText}>{mediaType === 'video' ? 'Video attached' : 'Photo attached'}</Text>
                    <TouchableOpacity onPress={removeMedia}>
                      <Icon name="close-circle" size={20} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.mediaRow}>
                    <TouchableOpacity style={styles.mediaBtn} onPress={() => pickMedia('image')}>
                      <Icon name="image-outline" size={24} color={Theme.eyebrowGreen} />
                      <Text style={styles.mediaBtnText}>Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mediaBtn} onPress={() => pickMedia('video')}>
                      <Icon name="video-outline" size={24} color={Theme.eyebrowGreen} />
                      <Text style={styles.mediaBtnText}>Video</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Require proof toggle */}
                <TouchableOpacity style={styles.toggleRow} onPress={() => setRequiresProof(!requiresProof)} activeOpacity={0.7}>
                  <View style={styles.toggleLeft}>
                    <Icon name="check-circle-outline" size={22} color={requiresProof ? Theme.eyebrowGreen : Theme.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.toggleLabel, requiresProof && styles.toggleLabelActive]}>Require proof</Text>
                      <Text style={styles.toggleSub}>Player must upload a photo or video to mark this done</Text>
                    </View>
                  </View>
                  <View style={[styles.toggle, requiresProof && styles.toggleOn]}>
                    <View style={[styles.toggleThumb, requiresProof && styles.toggleThumbOn]} />
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.addAnotherBtn} onPress={addToQueue}>
              <Icon name="plus-circle-outline" size={22} color={Theme.eyebrowGreen} />
              <Text style={styles.addAnotherBtnText}>Add Another Workout</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sendBtn, (loading || uploading) && styles.sendBtnDisabled]}
              onPress={send}
              disabled={loading || uploading}
            >
              <Text style={styles.sendBtnText}>
                {loading ? 'Sending...' : pendingCount > 1 ? `Assign ${pendingCount} Workouts` : 'Assign Workout'}
              </Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Theme.textPrimary },
  forWho: { fontSize: 15, color: Theme.eyebrowGreen, fontWeight: '600', marginBottom: 20 },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Theme.cardWhite,
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
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  modeBtnActive: { backgroundColor: Theme.eyebrowGreen },
  modeBtnText: { fontSize: 15, fontWeight: '600', color: Theme.textSecondary },
  modeBtnTextActive: { color: '#FFFFFF' },

  // Library
  libraryHint: { fontSize: 14, color: Theme.textSecondary, marginBottom: 12 },
  libraryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.cardWhite,
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
  libraryExName: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  libraryExCat: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },

  // Pre-filled banner
  prefilledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.onDarkAccent,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  prefilledText: { flex: 1, fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '600' },

  // Instructions preview
  instructionsPreview: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 2,
    borderLeftColor: Theme.eyebrowGreen,
  },
  instructionsPreviewLabel: { fontSize: 12, color: Theme.textSecondary, fontWeight: '600', marginBottom: 4 },
  instructionsPreviewText: { fontSize: 13, color: Theme.textSecondary, lineHeight: 18 },

  // Form
  label: { fontSize: 16, color: Theme.textSecondary, marginBottom: 9, fontWeight: '600' },
  labelOptional: { fontWeight: '400', color: Theme.textSecondary, fontSize: 14 },
  input: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
    color: Theme.textPrimary,
    fontSize: 17,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Theme.divider,
    minHeight: 54,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  catBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  catBtnActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  catText: { fontSize: 15, color: Theme.textSecondary, fontWeight: '600' },
  catTextActive: { color: '#FFFFFF' },
  mediaRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Theme.onDarkAccent,
    borderRadius: 14,
    paddingVertical: 20,
    borderWidth: 1.5,
    borderColor: Theme.eyebrowGreen,
    borderStyle: 'dashed',
  },
  mediaBtnText: { fontSize: 15, color: Theme.eyebrowGreen, fontWeight: '600' },
  mediaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.onDarkAccent,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  mediaHint: { fontSize: 15, color: Theme.eyebrowGreen, fontWeight: '600' },
  mediaSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.onDarkAccent,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  mediaSelectedText: { flex: 1, fontSize: 15, color: Theme.eyebrowGreen, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Theme.textSecondary, marginBottom: 2 },
  toggleLabelActive: { color: Theme.eyebrowGreen },
  toggleSub: { fontSize: 13, color: Theme.textSecondary, flexShrink: 1 },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.divider,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: { backgroundColor: Theme.eyebrowGreen },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },

  // Optional-details dropdown
  optionalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    paddingVertical: 17,
    paddingHorizontal: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  optionalToggleText: { fontSize: 17, fontWeight: '700', color: Theme.eyebrowGreen },
  optionalSummary: { flex: 1, fontSize: 14, color: Theme.textSecondary, textAlign: 'right', marginRight: 4 },
  optionalPanel: { marginBottom: 4 },

  // Add another workout
  addAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 17,
    marginTop: 20,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Theme.eyebrowGreen,
    borderStyle: 'dashed',
  },
  addAnotherBtnText: { fontSize: 17, fontWeight: '700', color: Theme.eyebrowGreen },

  sendBtn: {
    backgroundColor: Theme.eyebrowGreen,
    borderRadius: 30,
    paddingVertical: 19,
    alignItems: 'center',
    marginTop: 8,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 18 },

  // Multi-player selector — compact wrap grid so long rosters don't push
  // the rest of the form far down the page.
  playerSelectSection: { marginBottom: 22 },
  playerSelectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  noPlayersText: { fontSize: 14, color: Theme.textSecondary, fontStyle: 'italic' },
  selectAllText: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '700' },
  playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  playerChip: {
    width: '47%',
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 13,
    borderWidth: 2, borderColor: 'transparent',
  },
  playerChipActive: { borderColor: Theme.eyebrowGreen, backgroundColor: Theme.onDarkAccent },
  playerChipAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Theme.onDarkAccent, alignItems: 'center', justifyContent: 'center' },
  playerChipAvatarActive: { backgroundColor: Theme.eyebrowGreen },
  playerChipAvatarText: { fontSize: 17, fontWeight: 'bold', color: Theme.eyebrowGreen },
  playerChipAvatarTextActive: { color: '#FFFFFF' },
  playerChipName: { flex: 1, fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  playerChipNameActive: { color: Theme.eyebrowGreen },
  playerChipCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: Theme.eyebrowGreen, alignItems: 'center', justifyContent: 'center' },
  selectedCount: { fontSize: 14, color: Theme.eyebrowGreen, fontWeight: '700', textAlign: 'center', marginTop: 8 },

  // Workout queue
  queueSection: { marginBottom: 20 },
  queueCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Theme.cardWhite, borderRadius: 14, padding: 12, marginBottom: 10,
  },
  queueCardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  queueIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  queueTitle: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  queueTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  queueTag: { fontSize: 12, fontWeight: '600', color: Theme.eyebrowGreen },
});
