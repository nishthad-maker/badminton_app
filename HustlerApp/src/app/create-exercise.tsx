import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@/components/icons/Icon';
import { Theme, CategoryTheme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';

const CLOUDINARY_CLOUD_NAME = 'pyqqwrax';
const CLOUDINARY_UPLOAD_PRESET = 'hustler_videos';

const CATEGORIES = ['strength', 'footwork', 'endurance', 'recovery'];

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'dumbbell',
  footwork: 'footprints',
  endurance: 'lightning-bolt',
  recovery: 'heart-pulse',
};

// What you can track depends on the category. Categories with a single sensible
// option auto-select it, so the athlete never has to understand the jargon.
type LogTypeOption = { key: string; label: string; desc: string };

const LOG_TYPES_BY_CATEGORY: Record<string, LogTypeOption[]> = {
  strength: [
    { key: 'strength', label: 'Weight + Sets + Reps', desc: 'e.g. 20kg · 3 sets · 8 reps' },
    { key: 'reps-sets', label: 'Sets + Reps', desc: 'e.g. 3 sets · 12 reps' },
    { key: 'plank', label: 'Sets + Time', desc: 'e.g. 3 sets · 45 sec' },
  ],
  footwork: [
    { key: 'footwork', label: 'Sets + Duration', desc: 'e.g. 4 sets · 5 min' },
  ],
  endurance: [
    { key: 'skipping', label: 'Sets + Reps + Time', desc: 'e.g. 3 sets · 50 reps · 45 sec' },
    { key: 'sets-duration', label: 'Sets + Duration', desc: 'e.g. 4 sets · 20 min' },
    { key: 'duration-distance', label: 'Duration + Distance', desc: 'e.g. 30 min · 5 km' },
  ],
  recovery: [
    { key: 'recovery', label: 'Duration + Feeling', desc: 'e.g. 20 min · Great' },
  ],
};

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const uploadToCloudinary = async (uri: string): Promise<string | null> => {
  try {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      // On web, fetch the blob from the URI and append it directly
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('file', blob, 'video.mp4');
    } else {
      const filename = uri.split('/').pop() ?? 'video.mp4';
      const type = filename.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
      formData.append('file', { uri, name: filename, type } as any);
    }

    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('resource_type', 'video');

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
      { method: 'POST', body: formData }
    );

    const data = await res.json();
    if (data.secure_url) return data.secure_url;
    console.log('Cloudinary error:', data);
    return null;
  } catch (e) {
    console.log('Upload error:', e);
    return null;
  }
};

export default function CreateExerciseScreen() {
  const { id: exerciseId } = useLocalSearchParams();
  const isEditing = !!exerciseId;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [logType, setLogType] = useState('');
  const [steps, setSteps] = useState(['']);
  const [notes, setNotes] = useState('');
  const [videoUri, setVideoUri] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [savedBanner, setSavedBanner] = useState('');
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (exerciseId) loadExistingExercise();
  }, [exerciseId]);

  const loadExistingExercise = async () => {
    const { data } = await supabase
      .from('custom_exercises')
      .select('*')
      .eq('id', exerciseId)
      .single();

    if (data) {
      setName(data.name ?? '');
      setDescription(data.description ?? '');
      setCategory(data.category ?? '');
      setLogType(data.log_type ?? '');
      setSteps(data.steps?.length > 0 ? data.steps : ['']);
      setNotes(data.notes ?? '');
      setVideoUri(data.video_url ?? '');
      // When editing, reveal the detail section if there's anything in it.
      const hasDetail =
        (data.description && data.description.trim() !== '') ||
        (data.steps && data.steps.length > 0 && data.steps.some((s: string) => s.trim() !== '')) ||
        (data.notes && data.notes.trim() !== '') ||
        (data.video_url && data.video_url !== '');
      if (hasDetail) setShowMore(true);
    }
  };

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
    }
  };

  // Picking a category filters the tracking options. If there's only one, we
  // pick it automatically so the athlete isn't asked a pointless question.
  const selectCategory = (c: string) => {
    setCategory(c);
    const opts = LOG_TYPES_BY_CATEGORY[c] ?? [];
    if (opts.length === 1) {
      setLogType(opts[0].key);
    } else {
      setLogType('');
    }
  };

  const handleVideoSelected = async (uri: string) => {
    setVideoUri(uri);
    setUploading(true);
    // No blocking pop-ups here — the inline "Uploading..." state does the talking.
    const url = await uploadToCloudinary(uri);
    setUploading(false);
    if (url) {
      setVideoUri(url);
    } else {
      showAlert('Upload failed', 'Could not upload video. Please try again.');
      setVideoUri('');
    }
  };

  const filmVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Camera access is required to film videos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 60,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      await handleVideoSelected(result.assets[0].uri);
    }
  };

  const pickFromCameraRoll = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Photo library access is required to pick videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      await handleVideoSelected(result.assets[0].uri);
    }
  };

  const addStep = () => setSteps([...steps, '']);
  const removeStep = (index: number) => setSteps(steps.filter((_, i) => i !== index));
  const updateStep = (index: number, value: string) => {
    const updated = [...steps];
    updated[index] = value;
    setSteps(updated);
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      showAlert('Missing name', 'Please give your exercise a name.');
      return false;
    }
    if (!category) {
      showAlert('Missing category', 'Please select a category.');
      return false;
    }
    if (!logType) {
      showAlert('Missing tracking', 'Please choose what this exercise tracks.');
      return false;
    }
    if (uploading) {
      showAlert('Please wait', 'Your video is still uploading.');
      return false;
    }
    return true;
  };

  // Clears the form for the next entry but keeps category + tracking, since
  // people usually add several of the same type in a row (great for seeding).
  const resetForNext = () => {
    setName('');
    setDescription('');
    setSteps(['']);
    setNotes('');
    setVideoUri('');
    setShowMore(false);
  };

  const save = async (createAnother: boolean) => {
    if (!validate()) return;

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }

    const filteredSteps = steps.filter(s => s.trim() !== '');
    const payload = {
      name: name.trim(),
      description: description.trim(),
      category,
      log_type: logType,
      steps: filteredSteps,
      notes: notes.trim(),
      video_url: videoUri || null,
    };

    if (isEditing) {
      const { error } = await supabase
        .from('custom_exercises')
        .update(payload)
        .eq('id', exerciseId);
      setLoading(false);
      if (error) {
        showAlert('Error', 'Could not update your exercise. Please try again.');
        return;
      }
      goBack();
      return;
    }

    const { error } = await supabase
      .from('custom_exercises')
      .insert({ ...payload, user_id: session.user.id });
    setLoading(false);
    if (error) {
      showAlert('Error', 'Could not save your exercise. Please try again.');
      return;
    }

    if (createAnother) {
      const next = savedCount + 1;
      setSavedCount(next);
      setSavedBanner(`"${payload.name}" saved${next > 1 ? ` — ${next} created this session` : ''}. Ready for the next one!`);
      resetForNext();
    } else {
      goBack();
    }
  };

  const logTypesForCategory = category ? (LOG_TYPES_BY_CATEGORY[category] ?? []) : [];
  const isSingleLogType = logTypesForCategory.length === 1;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{isEditing ? 'Edit Exercise' : 'Create Exercise'}</Text>
        </View>

        {savedBanner !== '' && (
          <View style={styles.banner}>
            <Icon name="check-circle" size={18} color={Theme.eyebrowGreen} />
            <Text style={styles.bannerText}>{savedBanner}</Text>
          </View>
        )}

        {/* ── THE ESSENTIALS ── */}
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>THE ESSENTIALS</Text>

          <Text style={styles.label}>Exercise Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Jump Lunge"
            placeholderTextColor={Theme.textSecondary}
            value={name}
            onChangeText={(t) => { setName(t); if (savedBanner) setSavedBanner(''); }}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.optionsRow}>
            {CATEGORIES.map((option) => {
              const cat = CategoryTheme[option as keyof typeof CategoryTheme];
              const active = category === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.categoryBtn, active && { backgroundColor: cat.fg, borderColor: cat.fg }]}
                  onPress={() => selectCategory(option)}
                >
                  <Icon
                    name={CATEGORY_ICONS[option] as any}
                    size={16}
                    color={active ? '#FFFFFF' : Theme.textSecondary}
                  />
                  <Text style={[styles.categoryBtnText, active && styles.categoryBtnTextActive]}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: 8 }]}>What does it track?</Text>
          {!category ? (
            <Text style={styles.trackHint}>Pick a category first and we'll show the right options.</Text>
          ) : isSingleLogType ? (
            <View style={styles.trackInfo}>
              <Icon name="check-circle-outline" size={18} color={Theme.eyebrowGreen} />
              <View style={{ flex: 1 }}>
                <Text style={styles.trackInfoLabel}>{logTypesForCategory[0].label}</Text>
                <Text style={styles.trackInfoDesc}>{logTypesForCategory[0].desc}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.logTypeList}>
              {logTypesForCategory.map((lt) => (
                <TouchableOpacity
                  key={lt.key}
                  style={[styles.logTypeOption, logType === lt.key && styles.logTypeOptionActive]}
                  onPress={() => setLogType(lt.key)}
                >
                  <Icon
                    name={logType === lt.key ? 'radiobox-marked' : 'radiobox-blank'}
                    size={18}
                    color={logType === lt.key ? Theme.eyebrowGreen : Theme.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.logTypeLabel, logType === lt.key && styles.logTypeLabelActive]}>
                      {lt.label}
                    </Text>
                    <Text style={styles.logTypeDesc}>{lt.desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── OPTIONAL DETAIL (collapsed by default) ── */}
        <TouchableOpacity style={styles.moreToggle} onPress={() => setShowMore(!showMore)}>
          <Icon
            name={showMore ? 'chevron-down' : 'chevron-right'}
            size={22}
            color={Theme.eyebrowGreen}
          />
          <Text style={styles.moreToggleText}>Add more detail</Text>
          <Text style={styles.moreToggleHint}>optional</Text>
        </TouchableOpacity>

        {showMore && (
          <View>
            {/* Description */}
            <View style={styles.card}>
              <Text style={styles.cardSectionLabel}>DESCRIPTION</Text>
              <TextInput
                style={[styles.input, styles.multilineInput, { marginBottom: 0 }]}
                placeholder="What does this exercise do? Why is it useful for badminton?"
                placeholderTextColor={Theme.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Instructions */}
            <View style={styles.card}>
              <Text style={styles.cardSectionLabel}>INSTRUCTIONS</Text>
              <Text style={styles.cardHint}>Step-by-step instructions for how to do this exercise.</Text>
              {steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <TextInput
                    style={styles.stepInput}
                    placeholder={`Step ${i + 1}`}
                    placeholderTextColor={Theme.textSecondary}
                    value={step}
                    onChangeText={(v) => updateStep(i, v)}
                    multiline
                  />
                  {steps.length > 1 && (
                    <TouchableOpacity onPress={() => removeStep(i)}>
                      <Icon name="close-circle" size={20} color="#FF6B6B" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={styles.addStepBtn} onPress={addStep}>
                <Icon name="plus" size={16} color={Theme.eyebrowGreen} />
                <Text style={styles.addStepText}>Add Step</Text>
              </TouchableOpacity>
            </View>

            {/* Video */}
            <View style={styles.card}>
              <Text style={styles.cardSectionLabel}>VIDEO</Text>
              <Text style={styles.cardHint}>Add a demonstration video. Only use videos you own.</Text>

              {uploading ? (
                <View style={styles.uploadingState}>
                  <Icon name="cloud-upload-outline" size={24} color={Theme.eyebrowGreen} />
                  <Text style={styles.uploadingText}>Uploading...</Text>
                </View>
              ) : videoUri && videoUri.startsWith('https://') ? (
                <View style={styles.videoSelected}>
                  <Icon name="video-check" size={24} color={Theme.eyebrowGreen} />
                  <Text style={styles.videoSelectedText}>Video uploaded</Text>
                  <TouchableOpacity onPress={() => setVideoUri('')}>
                    <Icon name="close-circle" size={20} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.videoOptions}>
                  {Platform.OS !== 'web' && (
                    <TouchableOpacity style={styles.videoBtn} onPress={filmVideo}>
                      <Icon name="video" size={22} color={Theme.eyebrowGreen} />
                      <Text style={styles.videoBtnText}>Film Now</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.videoBtn} onPress={pickFromCameraRoll}>
                    <Icon name="image-multiple" size={22} color={Theme.eyebrowGreen} />
                    <Text style={styles.videoBtnText}>
                      {Platform.OS === 'web' ? 'Upload Video' : 'Camera Roll'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Notes */}
            <View style={styles.card}>
              <Text style={styles.cardSectionLabel}>PERSONAL NOTES</Text>
              <TextInput
                style={[styles.input, styles.multilineInput, { marginBottom: 0 }]}
                placeholder="Any personal reminders, modifications, or things to watch out for..."
                placeholderTextColor={Theme.textSecondary}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>
        )}

        {/* ── ACTIONS ── */}
        <TouchableOpacity
          style={[styles.saveBtn, (loading || uploading) && styles.saveBtnDisabled]}
          onPress={() => save(false)}
          disabled={loading || uploading}
        >
          <Text style={styles.saveBtnText}>
            {loading ? 'Saving...' : uploading ? 'Uploading video...' : isEditing ? 'Save Changes' : 'Save Exercise'}
          </Text>
        </TouchableOpacity>

        {!isEditing && (
          <TouchableOpacity
            style={[styles.saveAltBtn, (loading || uploading) && styles.saveBtnDisabled]}
            onPress={() => save(true)}
            disabled={loading || uploading}
          >
            <Icon name="plus-circle-outline" size={18} color={Theme.eyebrowGreen} />
            <Text style={styles.saveAltBtnText}>Save & Add Another</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.cardTinted,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  bannerText: { flex: 1, fontSize: 15, color: Theme.textPrimary, fontWeight: '600', lineHeight: 20 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardSectionLabel: { fontSize: 11, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 12 },
  cardHint: { fontSize: 13, color: Theme.textSecondary, marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 13, color: Theme.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Theme.background,
    borderRadius: 10,
    padding: 14,
    color: Theme.textPrimary,
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  categoryBtnText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  categoryBtnTextActive: { color: '#FFFFFF' },
  trackHint: { fontSize: 13, color: Theme.textSecondary, fontStyle: 'italic', lineHeight: 18 },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.cardTinted,
    borderRadius: 10,
    padding: 12,
  },
  trackInfoLabel: { fontSize: 13, fontWeight: '600', color: Theme.textPrimary },
  trackInfoDesc: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  logTypeList: { gap: 10 },
  logTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  logTypeOptionActive: { borderColor: Theme.eyebrowGreen, backgroundColor: Theme.cardTinted },
  logTypeLabel: { fontSize: 13, fontWeight: '600', color: Theme.textSecondary },
  logTypeLabelActive: { color: Theme.textPrimary },
  logTypeDesc: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    marginBottom: 8,
  },
  moreToggleText: { fontSize: 15, fontWeight: '600', color: Theme.textPrimary },
  moreToggleHint: { fontSize: 13, color: Theme.textSecondary, fontStyle: 'italic' },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.eyebrowGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  stepNumText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  stepInput: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    padding: 10,
    color: Theme.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: Theme.divider,
    minHeight: 44,
  },
  addStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  addStepText: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  videoOptions: { flexDirection: 'row', gap: 12 },
  videoBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.cardTinted,
    borderRadius: 12,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: Theme.eyebrowGreen,
    borderStyle: 'dashed',
  },
  videoBtnText: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  videoSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.cardTinted,
    borderRadius: 10,
    padding: 12,
  },
  videoSelectedText: { flex: 1, fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  uploadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.cardTinted,
    borderRadius: 10,
    padding: 12,
  },
  uploadingText: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#44403C',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  saveAltBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 30,
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#44403C',
  },
  saveAltBtnText: { color: '#44403C', fontWeight: 'bold', fontSize: 15 },
});
