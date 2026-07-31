import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Switch, Modal } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { useState, useEffect, useRef } from 'react';
import * as Speech from 'expo-speech';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifyJournalShared, notifyPlayerMessage } from '../lib/notifications';
import { showAlert, showConfirm } from '../lib/ui';
import { GENERAL_PROMPTS } from '@/constants/journalPrompts';
import { getShareableCoaches, ShareableCoach } from '../lib/coachSharing';

type StepKey = 'type' | 'reflect' | 'done';
const STEPS: StepKey[] = ['type', 'reflect', 'done'];
type EntryType = 'lesson' | 'personal';

// Same neutral gray used for generic app utility actions elsewhere
// (My Routines, Create Exercise, Save buttons) — keeps Journal visually
// consistent with those rather than standing apart with its own accent.
const INK = '#44403C';
const PAPER = '#E7E5E0';

// Common female voice names across iOS/Android TTS engines, plus the literal
// word "female" that some Android voice identifiers include directly — used
// to pick a softer-sounding voice for "Listen to entry" instead of whatever
// the device's default (often male or robotic) system voice is.
const FEMALE_VOICE_HINTS = [
  'female', 'samantha', 'karen', 'moira', 'tessa', 'victoria', 'allison',
  'ava', 'susan', 'kate', 'serena', 'zoe', 'fiona', 'martha', 'nicky',
];

const pickSofterVoice = async (): Promise<string | undefined> => {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const english = voices.filter((v) => v.language?.toLowerCase().startsWith('en'));
    const pool = english.length ? english : voices;
    const female = pool.find((v) => {
      const haystack = `${v.identifier} ${v.name}`.toLowerCase();
      return FEMALE_VOICE_HINTS.some((hint) => haystack.includes(hint));
    });
    return female?.identifier;
  } catch {
    return undefined;
  }
};

type Props = {
  visible: boolean;
  onClose: () => void;
  entryDate: string; // YYYY-MM-DD, local — date a new entry is created under
  entryId?: string | null; // editing this existing entry; omit/null to resume/start one
  forceNew?: boolean; // skip resuming an in-progress draft — always start blank
  onSaved?: () => void;
};

// Local calendar date as YYYY-MM-DD — never use toISOString() for "today", it's UTC
// and drifts a day off from local midnight depending on the user's timezone.
export const localDateStr = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fmtHeaderDate = (dateStr: string) => {
  if (dateStr === localDateStr()) return 'Today';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtFullDate = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export function JournalSheet({ visible, onClose, entryDate, entryId: entryIdProp, forceNew, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState('Your player');

  const [entryType, setEntryType] = useState<EntryType | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);
  const [promptVisible, setPromptVisible] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [shareableCoaches, setShareableCoaches] = useState<ShareableCoach[]>([]);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>([]);
  const [previousSharedIds, setPreviousSharedIds] = useState<string[]>([]);
  const [sharedWithParent, setSharedWithParent] = useState(false);
  const [hasLinkedParent, setHasLinkedParent] = useState(false);
  const [saving, setSaving] = useState(false);

  const [entryId, setEntryId] = useState<string | null>(null);
  // True while this entry hasn't been explicitly finalized via the Save button —
  // autosave is only allowed to write while a row is still a draft, never once
  // it's been finalized (editing a past finalized entry stays explicit-save-only).
  const [isDraft, setIsDraft] = useState(true);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  const [voiceLoaded, setVoiceLoaded] = useState(false);

  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible, entryDate, entryIdProp, forceNew]);

  // Stop any in-progress read-aloud the moment the sheet closes or the
  // entry it's reading gets edited/navigated away from.
  useEffect(() => {
    if (!visible) { Speech.stop(); setSpeaking(false); }
    return () => { Speech.stop(); };
  }, [visible]);

  // Also stop if the player navigates away from the writing step (Next,
  // Back, or the header arrow) while it's reading.
  useEffect(() => {
    if (step !== 'reflect') { Speech.stop(); setSpeaking(false); }
  }, [step]);

  const toggleListen = async () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    const text = freeText.trim();
    if (!text) return;

    let voice = voiceId;
    if (!voiceLoaded) {
      voice = await pickSofterVoice();
      setVoiceId(voice);
      setVoiceLoaded(true);
    }

    setSpeaking(true);
    Speech.speak(text, {
      voice,
      pitch: 1.15, // slightly higher — reads as softer/sweeter than the flat default
      rate: 0.95, // slightly slower/gentler pacing
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const resetState = () => {
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }
    setStepIndex(0);
    setEntryType(null);
    setPromptIndex(0);
    setPromptVisible(false);
    setFreeText('');
    setSelectedCoachIds([]);
    setPreviousSharedIds([]);
    setSharedWithParent(false);
    setEntryId(null);
    setIsDraft(true);
    setMessages([]);
    setMsgInput('');
  };

  // Starts a brand-new blank entry without touching whatever is currently
  // open — any draft already autosaved (or a finalized entry being edited)
  // is left exactly as it is in the database.
  const startNewEntry = () => {
    Speech.stop();
    setSpeaking(false);
    resetState();
  };

  const applyExisting = async (existing: any) => {
    setEntryId(existing.id);
    setIsDraft(existing.is_draft ?? false);
    const type: EntryType = existing.entry_type === 'personal' ? 'personal' : 'lesson';
    setEntryType(type);
    if (type === 'personal' && existing.prompt_text) {
      const idx = GENERAL_PROMPTS.indexOf(existing.prompt_text);
      if (idx >= 0) { setPromptIndex(idx); setPromptVisible(true); }
    }
    setFreeText(existing.free_text ?? '');
    const sharedIds: string[] = existing.shared_with_coach_ids ?? [];
    setSelectedCoachIds(sharedIds);
    setPreviousSharedIds(sharedIds);
    setSharedWithParent(existing.shared_with_parent ?? false);
    setStepIndex(1);

    if (existing.shared_with_coach) {
      const { data: msgs } = await supabase
        .from('journal_entry_messages').select('*').eq('journal_entry_id', existing.id).order('created_at', { ascending: true });
      setMessages(msgs ?? []);
    }
  };

  const load = async () => {
    setLoading(true);
    resetState();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setLoading(false); return; }
    const me = session.user.id;
    setMyId(me);
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', me).single();
    if (prof?.full_name) setMyName(prof.full_name);

    getShareableCoaches(me).then(setShareableCoaches);

    const { count: parentCount } = await supabase
      .from('parent_children')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', me)
      .eq('status', 'accepted')
      .is('unlinked_at', null);
    setHasLinkedParent((parentCount ?? 0) > 0);

    if (entryIdProp) {
      const { data: existing } = await supabase
        .from('journal_entries').select('*').eq('user_id', me).eq('id', entryIdProp).single();
      if (existing) await applyExisting(existing);
      setLoading(false);
      return;
    }

    if (forceNew) { setLoading(false); return; }

    // No specific entry requested — pick up wherever we left off: the most
    // recently autosaved draft for this date, if any, so nothing written is lost.
    const { data: draft } = await supabase
      .from('journal_entries').select('*').eq('user_id', me).eq('entry_date', entryDate).eq('is_draft', true)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (draft) await applyExisting(draft);
    setLoading(false);
  };

  const chooseType = (type: EntryType) => {
    setEntryType(type);
    setStepIndex(1);
  };

  // Personal entries only — the prompt is hidden until the player asks for one.
  const generatePrompt = () => {
    if (GENERAL_PROMPTS.length <= 1) { setPromptVisible(true); return; }
    let next = Math.floor(Math.random() * GENERAL_PROMPTS.length);
    while (promptVisible && next === promptIndex) next = Math.floor(Math.random() * GENERAL_PROMPTS.length);
    setPromptIndex(next);
    setPromptVisible(true);
  };

  // Silently persists whatever's been typed so far as a draft — never shown in
  // Journal History until the player actually taps Save. Skipped once an entry
  // has been finalized (editing a past saved entry stays explicit-save-only).
  const autosaveDraft = async () => {
    if (!myId || !entryType || !isDraft) return;
    const promptText = entryType === 'personal' && promptVisible ? GENERAL_PROMPTS[promptIndex] : null;

    if (entryId) {
      await supabase.from('journal_entries').update({
        entry_type: entryType,
        prompt_text: promptText,
        free_text: freeText.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', entryId);
    } else {
      const { data } = await supabase.from('journal_entries').insert({
        user_id: myId,
        entry_date: entryDate,
        entry_type: entryType,
        prompt_text: promptText,
        free_text: freeText.trim() || null,
        shared_with_coach: false,
        shared_with_parent: false,
        is_draft: true,
        updated_at: new Date().toISOString(),
      }).select().single();
      if (data) setEntryId(data.id);
    }
  };

  useEffect(() => {
    if (loading || !isDraft || !entryType) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { autosaveDraft(); }, 700);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryType, freeText, promptVisible, promptIndex, loading, isDraft]);

  const save = async () => {
    if (!myId || !entryType) return;
    setSaving(true);
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }

    // Personal entries are for the player only — never shared, regardless of the picker.
    const shareIds = entryType === 'lesson' ? selectedCoachIds : [];
    // Lesson entries are free-write only; a personal entry only has a prompt if one was generated.
    const promptText = entryType === 'personal' && promptVisible ? GENERAL_PROMPTS[promptIndex] : null;

    const { error } = entryId
      ? await supabase.from('journal_entries').update({
          entry_type: entryType,
          prompt_text: promptText,
          free_text: freeText.trim() || null,
          shared_with_coach: shareIds.length > 0,
          shared_with_coach_ids: shareIds,
          shared_with_parent: sharedWithParent,
          is_draft: false,
          updated_at: new Date().toISOString(),
        }).eq('id', entryId).select().single()
      : await supabase.from('journal_entries').insert({
          user_id: myId,
          entry_date: entryDate,
          entry_type: entryType,
          prompt_text: promptText,
          free_text: freeText.trim() || null,
          shared_with_coach: shareIds.length > 0,
          shared_with_coach_ids: shareIds,
          shared_with_parent: sharedWithParent,
          is_draft: false,
          updated_at: new Date().toISOString(),
        }).select().single();

    if (error) {
      setSaving(false);
      console.error('journal_entries save failed:', error);
      showAlert('Error', error.message || 'Could not save your entry. Please try again.');
      return;
    }

    const newlyShared = shareIds.filter((id) => !previousSharedIds.includes(id));
    for (const coachId of newlyShared) { await notifyJournalShared(coachId, myName); }

    setIsDraft(false);
    setSaving(false);
    onSaved?.();
    onClose();
  };

  const sendMessage = async () => {
    const text = msgInput.trim();
    if (!text || !myId || !entryId) return;
    setSendingMsg(true);
    const { data: inserted, error } = await supabase
      .from('journal_entry_messages').insert({ journal_entry_id: entryId, sender_id: myId, message: text }).select().single();
    setSendingMsg(false);
    if (error) { showAlert('Error', 'Could not send your message. Please try again.'); return; }
    setMessages(prev => [...prev, inserted]);
    setMsgInput('');

    for (const coachId of selectedCoachIds) { await notifyPlayerMessage(coachId, myName, text); }
  };

  const renderType = () => (
    <>
      <Text style={styles.typeHeading}>What kind of entry is this?</Text>
      <TouchableOpacity style={styles.typeCard} onPress={() => chooseType('lesson')} activeOpacity={0.8}>
        <View style={styles.typeCardHeader}>
          <View style={styles.typeIconWrap}>
            <Icon name="school-outline" size={26} color={INK} />
          </View>
          <Text style={[styles.typeCardTitle, { flex: 1 }]}>Lesson learned</Text>
          <Icon name="chevron-right" size={26} color={Theme.textMuted} />
        </View>
        <Text style={styles.typeCardDesc}>Technical stuff from training or a private lesson you want to remember. Shareable with your coach — training purposes only.</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.typeCard} onPress={() => chooseType('personal')} activeOpacity={0.8}>
        <View style={styles.typeCardHeader}>
          <View style={styles.typeIconWrap}>
            <Icon name="heart-outline" size={26} color={INK} />
          </View>
          <Text style={[styles.typeCardTitle, { flex: 1 }]}>Journal entry</Text>
          <Icon name="chevron-right" size={26} color={Theme.textMuted} />
        </View>
        <Text style={styles.typeCardDesc}>Mental health, feelings, anything else on your mind. Always private — your coach never sees this.</Text>
      </TouchableOpacity>
    </>
  );

  const clearText = () => {
    if (!freeText.trim()) return;
    showConfirm('Clear entry?', "This will erase everything you've written here.", () => {
      Speech.stop();
      setSpeaking(false);
      setFreeText('');
    });
  };

  const clearRow = (
    <View style={styles.clearRow}>
      <TouchableOpacity
        style={styles.listenBtn}
        onPress={clearText}
        disabled={!freeText.trim()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="trash-can-outline" size={16} color={freeText.trim() ? '#C0392B' : Theme.textMuted} />
        <Text style={[styles.listenBtnText, { color: freeText.trim() ? '#C0392B' : Theme.textMuted }]}>
          Clear
        </Text>
      </TouchableOpacity>
    </View>
  );

  const listenBtn = (
    <TouchableOpacity
      style={[styles.listenBtn, { alignSelf: 'flex-start', marginTop: 12 }]}
      onPress={toggleListen}
      disabled={!freeText.trim()}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Icon name={speaking ? 'stop' : 'volume-high'} size={16} color={freeText.trim() ? INK : Theme.textMuted} />
      <Text style={[styles.listenBtnText, !freeText.trim() && { color: Theme.textMuted }]}>
        {speaking ? 'Stop listening' : 'Listen to entry'}
      </Text>
    </TouchableOpacity>
  );

  const renderReflect = () => {
    if (entryType === 'lesson') {
      return (
        <>
          {clearRow}
          <TextInput
            style={styles.input}
            placeholder="Write down what you want to remember..."
            placeholderTextColor={Theme.textMuted}
            value={freeText}
            onChangeText={setFreeText}
            multiline
            autoFocus
          />
          {listenBtn}
        </>
      );
    }
    return (
      <>
        {promptVisible ? (
          <View style={styles.promptRow}>
            <Text style={styles.promptText}>{GENERAL_PROMPTS[promptIndex]}</Text>
            <TouchableOpacity style={styles.shuffleBtn} onPress={generatePrompt} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="dice-3-outline" size={15} color={Theme.textSecondary} />
              <Text style={styles.shuffleText}>Try another prompt</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.shuffleBtnStandalone} onPress={generatePrompt} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="dice-3-outline" size={15} color={Theme.textSecondary} />
            <Text style={styles.shuffleText}>Stuck? Generate a prompt</Text>
          </TouchableOpacity>
        )}
        {clearRow}
        <TextInput
          style={styles.input}
          placeholder="Start writing..."
          placeholderTextColor={Theme.textMuted}
          value={freeText}
          onChangeText={setFreeText}
          multiline
          autoFocus={promptVisible}
        />
        {listenBtn}
      </>
    );
  };

  const renderDone = () => (
    <>
      <Text style={styles.cardTitle}>Entry ready</Text>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryDate}>{fmtFullDate(entryDate)}</Text>
        {freeText.trim() !== '' && <Text style={styles.summaryLine} numberOfLines={4}>{freeText.trim()}</Text>}
      </View>

      {entryType === 'lesson' && (
        <View style={styles.shareBlock}>
          <View style={styles.shareRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareLabel}>Share with coach</Text>
              <Text style={styles.shareHint}>
                {selectedCoachIds.length > 0
                  ? `Shared with ${selectedCoachIds.length} coach${selectedCoachIds.length > 1 ? 'es' : ''} — they can see this and give feedback.`
                  : 'Off by default — only you can see it until you share.'}
              </Text>
            </View>
            <Switch
              value={selectedCoachIds.length > 0}
              onValueChange={(v) => setSelectedCoachIds(v ? shareableCoaches.map((c) => c.id) : [])}
              trackColor={{ false: Theme.divider, true: INK }}
              thumbColor="#FFFFFF"
              disabled={shareableCoaches.length === 0}
            />
          </View>
          {shareableCoaches.length === 0 ? (
            <Text style={styles.shareHint}>You don't have a coach to share with yet.</Text>
          ) : selectedCoachIds.length > 0 && shareableCoaches.length > 1 && (
            <View style={styles.coachChipRow}>
              {shareableCoaches.map((c) => {
                const active = selectedCoachIds.includes(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.coachChip, active && styles.coachChipActive]}
                    onPress={() => setSelectedCoachIds((prev) => prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id])}
                  >
                    <Text style={[styles.coachChipText, active && styles.coachChipTextActive]}>{c.full_name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {hasLinkedParent && (
        <View style={styles.shareRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.shareLabel}>Share with parent</Text>
            <Text style={styles.shareHint}>
              {sharedWithParent ? 'Your linked parent can see this entry.' : 'Off by default — only you can see it until you share.'}
            </Text>
          </View>
          <Switch value={sharedWithParent} onValueChange={setSharedWithParent} trackColor={{ false: Theme.divider, true: INK }} thumbColor="#FFFFFF" />
        </View>
      )}

      {entryType === 'lesson' && selectedCoachIds.length > 0 && entryId && (
        <View style={styles.chatSection}>
          <Text style={styles.chatLabel}>COACH CHAT</Text>
          {messages.length === 0 ? (
            <Text style={styles.chatEmpty}>No messages yet.</Text>
          ) : (
            <View style={styles.chatThread}>
              {messages.map(m => (
                <View key={m.id} style={[styles.chatBubble, m.sender_id === myId ? styles.chatBubbleMine : styles.chatBubbleTheirs]}>
                  <Text style={styles.chatSender}>{m.sender_id === myId ? 'You' : 'Coach'}</Text>
                  <Text style={styles.chatText}>{m.message}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder="Reply..."
              placeholderTextColor={Theme.textSecondary}
              value={msgInput}
              onChangeText={setMsgInput}
              multiline
            />
            <TouchableOpacity style={[styles.chatSendBtn, (!msgInput.trim() || sendingMsg) && styles.primaryBtnDisabled]} onPress={sendMessage} disabled={!msgInput.trim() || sendingMsg}>
              {sendingMsg ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="send" size={16} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!sharedWithParent && (entryType === 'personal' || selectedCoachIds.length === 0) && (
        <View style={styles.privateNote}>
          <Icon name="lock-outline" size={14} color={Theme.textSecondary} />
          <Text style={styles.privateNoteText}>Private — only you can see this entry.</Text>
        </View>
      )}
    </>
  );

  const renderStep = () => {
    if (step === 'type') return renderType();
    if (step === 'reflect') return renderReflect();
    return renderDone();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (stepIndex > 0 ? setStepIndex((i) => i - 1) : onClose())}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          {!loading && step !== 'type' && (entryId || entryType) && (
            <TouchableOpacity style={styles.newEntryBtn} onPress={startNewEntry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="plus" size={18} color={INK} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.headerEyebrow}>{fmtHeaderDate(entryDate) === 'Today' ? "TODAY'S ENTRY" : 'JOURNAL ENTRY'}</Text>
            <Text style={styles.headerTitle}>{fmtFullDate(entryDate)}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
        ) : (
          <>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              {renderStep()}
            </ScrollView>
            {step !== 'type' && (
              <View style={styles.footer}>
                {stepIndex > 0 && (
                  <TouchableOpacity style={styles.backBtn} onPress={() => setStepIndex(i => Math.max(0, i - 1))}>
                    <Text style={styles.backBtnText}>Back</Text>
                  </TouchableOpacity>
                )}
                {step === 'done' ? (
                  <TouchableOpacity style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]} onPress={save} disabled={saving}>
                    {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Save</Text>}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => setStepIndex(i => Math.min(STEPS.length - 1, i + 1))}
                  >
                    <Text style={styles.primaryBtnText}>Next</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.background, paddingHorizontal: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 },
  newEntryBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: PAPER, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { fontSize: 11, fontWeight: '700', color: INK, letterSpacing: 1, marginBottom: 4 },
  headerTitle: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 16 },
  typeHeading: { fontFamily: Fonts.sansSemiBold, fontSize: 24, color: Theme.textPrimary, marginBottom: 24 },
  typeCard: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: Theme.divider, padding: 22, marginBottom: 20 },
  typeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  typeIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: PAPER, alignItems: 'center', justifyContent: 'center' },
  typeCardTitle: { fontSize: 21, fontWeight: '700', color: Theme.textPrimary },
  typeCardDesc: { fontSize: 16, color: Theme.textSecondary, lineHeight: 23 },
  promptRow: { marginBottom: 18 },
  promptText: { fontFamily: Fonts.sansSemiBold, fontSize: 17, lineHeight: 24, color: Theme.textPrimary, marginBottom: 8 },
  shuffleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  shuffleBtnStandalone: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 18 },
  shuffleText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600', textDecorationLine: 'underline' },
  clearRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  listenBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listenBtnText: { fontSize: 13, color: INK, fontWeight: '600' },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    color: Theme.textPrimary,
    fontSize: 17,
    lineHeight: 26,
    minHeight: 280,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.divider,
    padding: 18,
    outlineStyle: 'none',
  } as any,
  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, gap: 6, marginBottom: 20, borderLeftWidth: 3, borderLeftColor: INK },
  summaryDate: { fontSize: 14, fontWeight: '700', color: INK, marginBottom: 2 },
  summaryLine: { fontSize: 14, color: Theme.textSecondary, lineHeight: 20 },
  privateNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  privateNoteText: { fontSize: 13, color: Theme.textSecondary },
  shareBlock: { gap: 10 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareLabel: { fontSize: 14, fontWeight: '600', color: Theme.textPrimary },
  shareHint: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
  coachChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coachChip: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Theme.divider, backgroundColor: '#FFFFFF' },
  coachChipActive: { backgroundColor: INK, borderColor: INK },
  coachChipText: { fontSize: 13, fontWeight: '600', color: Theme.textPrimary },
  coachChipTextActive: { color: '#FFFFFF' },
  chatSection: { marginTop: 20, gap: 10 },
  chatLabel: { fontSize: 11, fontWeight: 'bold', color: INK, letterSpacing: 1 },
  chatEmpty: { fontSize: 13, color: Theme.textSecondary, fontStyle: 'italic' },
  chatThread: { gap: 8 },
  chatBubble: { borderRadius: 10, padding: 10, maxWidth: '85%' },
  chatBubbleMine: { backgroundColor: PAPER, alignSelf: 'flex-end' },
  chatBubbleTheirs: { backgroundColor: '#FFFFFF', alignSelf: 'flex-start' },
  chatSender: { fontSize: 10, fontWeight: '700', color: Theme.textSecondary, marginBottom: 2 },
  chatText: { fontSize: 13, color: Theme.textPrimary },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatInput: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, color: Theme.textPrimary, fontSize: 13, borderWidth: 1, borderColor: Theme.divider, maxHeight: 80 },
  chatSendBtn: { backgroundColor: INK, borderRadius: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingBottom: 24 },
  backBtn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#FFFFFF' },
  backBtnText: { color: Theme.textSecondary, fontWeight: '600', fontSize: 14 },
  primaryBtn: { flex: 1, backgroundColor: INK, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});
