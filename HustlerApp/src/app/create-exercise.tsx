import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';

const CLOUDINARY_CLOUD_NAME = 'pyqqwrax';
const CLOUDINARY_UPLOAD_PRESET = 'hustler_videos';

const CATEGORIES = ['strength', 'footwork', 'endurance', 'recovery'];

const LOG_TYPES = [
  { key: 'strength', label: 'Weight + Sets + Reps', desc: 'e.g. 20kg, 3 sets, 8 reps' },
  { key: 'reps-sets', label: 'Sets + Reps', desc: 'e.g. 3 sets, 12 reps' },
  { key: 'plank', label: 'Sets + Time', desc: 'e.g. 3 sets, 45 sec' },
  { key: 'sets-duration', label: 'Sets + Duration', desc: 'e.g. 4 sets, 20 min' },
  { key: 'duration-distance', label: 'Duration + Distance', desc: 'e.g. 30 min, 5km' },
  { key: 'recovery', label: 'Duration + Feeling', desc: 'e.g. 20 min, Great' },
];

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
    const filename = uri.split('/').pop() ?? 'video.mp4';
    const type = filename.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';

    formData.append('file', { uri, name: filename, type } as any);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('resource_type', 'video');

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
      { method: 'POST', body: formData }
    );

    const data = await response.json();
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
    }
  };

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
    }
  };

  const handleVideoSelected = async (uri: string) => {
    setVideoUri(uri);
    setUploading(true);
    showAlert('Uploading', 'Your video is being uploaded...');
    const url = await uploadToCloudinary(uri);
    setUploading(false);
    if (url) {
      setVideoUri(url);
      showAlert('Upload complete', 'Your video has been uploaded successfully!');
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

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert('Missing name', 'Please give your exercise a name.');
      return;
    }
    if (!category) {
      showAlert('Missing category', 'Please select a category.');
      return;
    }
    if (!logType) {
      showAlert('Missing log type', 'Please select what you want to track.');
      return;
    }
    if (uploading) {
      showAlert('Please wait', 'Your video is still uploading.');
      return;
    }

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
      showAlert('Updated!', 'Your exercise has been updated.');
    } else {
      const { error } = await supabase
        .from('custom_exercises')
        .insert({ ...payload, user_id: session.user.id });
      setLoading(false);
      if (error) {
        showAlert('Error', 'Could not save your exercise. Please try again.');
        return;
      }
      showAlert('Saved!', 'Your custom exercise has been created.');
    }

    goBack();
  };

  const renderSelector = (
    label: string,
    options: string[],
    selected: string,
    onSelect: (v: string) => void,
    capitalize?: boolean
  ) => (
    <View style={styles.selectorGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.optionsRow}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.optionBtn, selected === option && styles.optionBtnActive]}
            onPress={() => onSelect(option)}
          >
            <Text style={[styles.optionBtnText, selected === option && styles.optionBtnTextActive]}>
              {capitalize ? option.charAt(0).toUpperCase() + option.slice(1) : option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={[Colors.backgroundTop, Colors.backgroundBottom]}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={styles.title}>{isEditing ? 'Edit Exercise' : 'Create Exercise'}</Text>
        </View>

        {/* Basic Info */}
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>BASIC INFO</Text>

          <Text style={styles.label}>Exercise Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Jump Lunge"
            placeholderTextColor={Colors.textSecondary}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="What does this exercise do? Why is it useful for badminton?"
            placeholderTextColor={Colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {renderSelector('Category', CATEGORIES, category, setCategory, true)}
        </View>

        {/* Tracking */}
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>WHAT DO YOU WANT TO TRACK?</Text>
          <View style={styles.logTypeList}>
            {LOG_TYPES.map((lt) => (
              <TouchableOpacity
                key={lt.key}
                style={[styles.logTypeOption, logType === lt.key && styles.logTypeOptionActive]}
                onPress={() => setLogType(lt.key)}
              >
                <View style={styles.logTypeLeft}>
                  <MaterialCommunityIcons
                    name={logType === lt.key ? 'radiobox-marked' : 'radiobox-blank'}
                    size={18}
                    color={logType === lt.key ? Colors.accent : Colors.textSecondary}
                  />
                  <View>
                    <Text style={[styles.logTypeLabel, logType === lt.key && styles.logTypeLabelActive]}>
                      {lt.label}
                    </Text>
                    <Text style={styles.logTypeDesc}>{lt.desc}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>INSTRUCTIONS</Text>
          <Text style={styles.cardHint}>Add step-by-step instructions for how to do this exercise.</Text>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <TextInput
                style={styles.stepInput}
                placeholder={`Step ${i + 1}`}
                placeholderTextColor={Colors.textSecondary}
                value={step}
                onChangeText={(v) => updateStep(i, v)}
                multiline
              />
              {steps.length > 1 && (
                <TouchableOpacity onPress={() => removeStep(i)}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#FF6B6B" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity style={styles.addStepBtn} onPress={addStep}>
            <MaterialCommunityIcons name="plus" size={16} color={Colors.accent} />
            <Text style={styles.addStepText}>Add Step</Text>
          </TouchableOpacity>
        </View>

        {/* Video */}
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>VIDEO (OPTIONAL)</Text>
          <Text style={styles.cardHint}>Add a demonstration video. Only use videos you own.</Text>

          {uploading ? (
            <View style={styles.uploadingState}>
              <MaterialCommunityIcons name="cloud-upload-outline" size={24} color={Colors.accent} />
              <Text style={styles.uploadingText}>Uploading to Cloudinary...</Text>
            </View>
          ) : videoUri && videoUri.startsWith('https://') ? (
            <View style={styles.videoSelected}>
              <MaterialCommunityIcons name="video-check" size={24} color={Colors.accent} />
              <Text style={styles.videoSelectedText}>Video uploaded ✓</Text>
              <TouchableOpacity onPress={() => setVideoUri('')}>
                <MaterialCommunityIcons name="close-circle" size={20} color="#FF6B6B" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.videoOptions}>
              <TouchableOpacity style={styles.videoBtn} onPress={filmVideo}>
                <MaterialCommunityIcons name="video" size={22} color={Colors.accent} />
                <Text style={styles.videoBtnText}>Film Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.videoBtn} onPress={pickFromCameraRoll}>
                <MaterialCommunityIcons name="image-multiple" size={22} color={Colors.accent} />
                <Text style={styles.videoBtnText}>Camera Roll</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>PERSONAL NOTES</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Any personal reminders, modifications, or things to watch out for..."
            placeholderTextColor={Colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, (loading || uploading) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={loading || uploading}
        >
          <Text style={styles.saveBtnText}>
            {loading ? 'Saving...' : uploading ? 'Uploading video...' : isEditing ? 'Save Changes' : 'Save Exercise'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardSectionLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1, marginBottom: 12 },
  cardHint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12, lineHeight: 17 },
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.backgroundTop,
    borderRadius: 10,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  selectorGroup: { marginBottom: 8 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.backgroundTop,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  optionBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  optionBtnTextActive: { color: '#FFFFFF' },
  logTypeList: { gap: 10 },
  logTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.backgroundTop,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logTypeOptionActive: { borderColor: Colors.accent, backgroundColor: Colors.accentMuted },
  logTypeLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  logTypeLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  logTypeLabelActive: { color: Colors.textPrimary },
  logTypeDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  stepNumText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  stepInput: {
    flex: 1,
    backgroundColor: Colors.backgroundTop,
    borderRadius: 10,
    padding: 10,
    color: Colors.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 44,
  },
  addStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  addStepText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  videoOptions: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  videoBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accentMuted,
    borderRadius: 12,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderStyle: 'dashed',
  },
  videoBtnText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  videoSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  videoSelectedText: { flex: 1, fontSize: 13, color: Colors.accent, fontWeight: '600' },
  uploadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  uploadingText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});