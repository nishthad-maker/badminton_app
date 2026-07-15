import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Switch, Modal } from 'react-native';
import { Text } from '@/components/Text';
import { useState, useEffect } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { notifyJournalShared, notifyPlayerMessage } from '../lib/notifications';
import { showAlert } from '../lib/ui';
import { GENERAL_PROMPTS, TRAINING_PROMPTS, MATCH_PROMPTS } from '@/constants/journalPrompts';

type StepKey = 'reflect' | 'done';
const STEPS: StepKey[] = ['reflect', 'done'];

// Same neutral gray used for generic app utility actions elsewhere
// (My Routines, Create Exercise, Save buttons) — keeps Journal visually
// consistent with those rather than standing apart with its own accent.
const INK = '#44403C';
const PAPER = '#E7E5E0';

type Props = {
  visible: boolean;
  onClose: () => void;
  entryDate: string; // YYYY-MM-DD, local
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

const dayBounds = (dateStr: string) => {
  const start = new Date(dateStr + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

const fmtHeaderDate = (dateStr: string) => {
  if (dateStr === localDateStr()) return 'Today';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtFullDate = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export function JournalSheet({ visible, onClose, entryDate, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState('Your player');

  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const [promptPool, setPromptPool] = useState<string[]>(GENERAL_PROMPTS);
  const [promptIndex, setPromptIndex] = useState(0);
  const [freeText, setFreeText] = useState('');
  const [sharedWithCoach, setSharedWithCoach] = useState(false);
  const [wasShared, setWasShared] = useState(false);
  const [saving, setSaving] = useState(false);

  const [entryId, setEntryId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible, entryDate]);

  const resetState = () => {
    setStepIndex(0);
    setContextLabel(null);
    setPromptPool(GENERAL_PROMPTS);
    setPromptIndex(0);
    setFreeText('');
    setSharedWithCoach(false);
    setWasShared(false);
    setEntryId(null);
    setMessages([]);
    setMsgInput('');
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

    const { start, end } = dayBounds(entryDate);
    const { data: sessionLogs } = await supabase
      .from('session_logs').select('id').eq('user_id', me).gte('created_at', start).lt('created_at', end);
    const { data: matchLogs } = await supabase
      .from('opponent_logs').select('id, opponents(name)').eq('player_id', me).gte('created_at', start).lt('created_at', end);

    let pool = GENERAL_PROMPTS;
    let label: string | null = null;
    if ((matchLogs ?? []).length > 0) {
      pool = MATCH_PROMPTS;
      const oppName = (matchLogs?.[0] as any)?.opponents?.name;
      label = `Match logged${oppName ? ` vs ${oppName}` : ''} today`;
    } else if ((sessionLogs ?? []).length > 0) {
      pool = TRAINING_PROMPTS;
      const n = sessionLogs!.length;
      label = `${n} exercise${n !== 1 ? 's' : ''} logged today`;
    }
    setPromptPool(pool);
    let initialPromptIndex = Math.floor(Math.random() * pool.length);
    setContextLabel(label);

    const { data: existing } = await supabase
      .from('journal_entries').select('*').eq('user_id', me).eq('entry_date', entryDate).single();
    if (existing) {
      setEntryId(existing.id);
      if (existing.prompt_text) {
        const idx = pool.indexOf(existing.prompt_text);
        if (idx >= 0) initialPromptIndex = idx;
      }
      setFreeText(existing.free_text ?? '');
      setSharedWithCoach(existing.shared_with_coach ?? false);
      setWasShared(existing.shared_with_coach ?? false);

      if (existing.shared_with_coach) {
        const { data: msgs } = await supabase
          .from('journal_entry_messages').select('*').eq('journal_entry_id', existing.id).order('created_at', { ascending: true });
        setMessages(msgs ?? []);
      }
    }
    setPromptIndex(initialPromptIndex);
    setLoading(false);
  };

  const refreshPrompt = () => {
    if (promptPool.length <= 1) return;
    let next = Math.floor(Math.random() * promptPool.length);
    while (next === promptIndex) next = Math.floor(Math.random() * promptPool.length);
    setPromptIndex(next);
  };

  const save = async () => {
    if (!myId) return;
    setSaving(true);

    const { error } = await supabase.from('journal_entries').upsert({
      user_id: myId,
      entry_date: entryDate,
      prompt_text: promptPool[promptIndex] ?? null,
      free_text: freeText.trim() || null,
      shared_with_coach: sharedWithCoach,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,entry_date' }).select().single();

    if (error) {
      setSaving(false);
      console.error('journal_entries save failed:', error);
      showAlert('Error', error.message || 'Could not save your entry. Please try again.');
      return;
    }

    if (sharedWithCoach && !wasShared) {
      const { data: conns } = await supabase.from('coach_connections').select('coach_id').eq('player_id', myId).eq('status', 'accepted');
      for (const c of conns ?? []) { await notifyJournalShared(c.coach_id, myName); }
    }

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

    const { data: conns } = await supabase.from('coach_connections').select('coach_id').eq('player_id', myId).eq('status', 'accepted');
    for (const c of conns ?? []) { await notifyPlayerMessage(c.coach_id, myName, text); }
  };

  const renderReflect = () => (
    <>
      {contextLabel && (
        <View style={styles.contextBanner}>
          <MaterialCommunityIcons name="feather" size={13} color={INK} />
          <Text style={styles.contextText}>{contextLabel}</Text>
        </View>
      )}
      <View style={styles.promptRow}>
        <Text style={styles.promptText}>{promptPool[promptIndex]}</Text>
        <TouchableOpacity style={styles.shuffleBtn} onPress={refreshPrompt} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="dice-3-outline" size={15} color={Theme.textSecondary} />
          <Text style={styles.shuffleText}>Stuck? Try another prompt</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        placeholder="Start writing..."
        placeholderTextColor={Theme.textMuted}
        value={freeText}
        onChangeText={setFreeText}
        multiline
        autoFocus
      />
    </>
  );

  const renderDone = () => (
    <>
      <Text style={styles.cardTitle}>Entry ready</Text>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryDate}>{fmtFullDate(entryDate)}</Text>
        {freeText.trim() !== '' && <Text style={styles.summaryLine} numberOfLines={4}>{freeText.trim()}</Text>}
      </View>

      <View style={styles.shareRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.shareLabel}>Share with coach</Text>
          <Text style={styles.shareHint}>
            {sharedWithCoach ? 'Your coach can see this entry and reply.' : 'Off by default — only you can see it until you share.'}
          </Text>
        </View>
        <Switch value={sharedWithCoach} onValueChange={setSharedWithCoach} trackColor={{ false: Theme.divider, true: INK }} thumbColor="#FFFFFF" />
      </View>

      {sharedWithCoach && entryId && (
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
              {sendingMsg ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!sharedWithCoach && (
        <View style={styles.privateNote}>
          <MaterialCommunityIcons name="lock-outline" size={14} color={Theme.textSecondary} />
          <Text style={styles.privateNoteText}>Private — only you can see this entry.</Text>
        </View>
      )}
    </>
  );

  const renderStep = () => {
    if (step === 'reflect') return renderReflect();
    return renderDone();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
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
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.background, paddingHorizontal: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 },
  headerEyebrow: { fontSize: 11, fontWeight: '700', color: INK, letterSpacing: 1, marginBottom: 4 },
  headerTitle: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 16 },
  contextBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: PAPER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 18, alignSelf: 'flex-start' },
  contextText: { fontSize: 13, color: INK, fontWeight: '600' },
  promptRow: { marginBottom: 18 },
  promptText: { fontFamily: Fonts.sansSemiBold, fontSize: 17, lineHeight: 24, color: Theme.textPrimary, marginBottom: 8 },
  shuffleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  shuffleText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600', textDecorationLine: 'underline' },
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
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareLabel: { fontSize: 14, fontWeight: '600', color: Theme.textPrimary },
  shareHint: { fontSize: 13, color: Theme.textSecondary, marginTop: 2 },
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
