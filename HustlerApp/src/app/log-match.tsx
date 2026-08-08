import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';
import { notifyMatchShared } from '../lib/notifications';
import { showAlert } from '../lib/ui';
import { STRENGTH_CATEGORIES, WEAKNESS_CATEGORIES } from '@/constants/matchTags';
import { TagChipSelector } from '@/components/TagChipSelector';
import { getShareableCoaches, ShareableCoach } from '../lib/coachSharing';
import { getAllTournaments, UpcomingTournament } from '../lib/parentDashboard';

type Result = 'win' | 'loss' | 'unsure';
type MatchType = 'singles' | 'doubles';
type StepKey = 'opponent' | 'score' | 'strengths' | 'weaknesses' | 'nextTime' | 'done';
type GameScore = { my: string; opp: string };

const FULL_STEPS: StepKey[] = ['opponent', 'score', 'strengths', 'weaknesses', 'nextTime', 'done'];

const emptyGames = (): GameScore[] => [{ my: '', opp: '' }, { my: '', opp: '' }, { my: '', opp: '' }];

const parseScoreToGames = (s: string): GameScore[] => {
  const rows = emptyGames();
  s.split(',').map(g => g.trim()).filter(Boolean).slice(0, 3).forEach((g, i) => {
    const [a, b] = g.split('-').map(x => x.trim());
    rows[i] = { my: a ?? '', opp: b ?? '' };
  });
  return rows;
};

const gamesToScore = (rows: GameScore[]) =>
  rows.filter(r => r.my.trim() !== '' && r.opp.trim() !== '').map(r => `${r.my.trim()}-${r.opp.trim()}`).join(', ');

export default function LogMatchScreen() {
  const params = useLocalSearchParams();
  const presetOpponentId = params.opponentId as string | undefined;
  const isQuickLog = params.quick === '1';
  const editingLogId = params.logId as string | undefined;

  const steps = presetOpponentId ? FULL_STEPS.filter(s => s !== 'opponent') : FULL_STEPS;
  const [stepIndex, setStepIndex] = useState(0);
  const step = isQuickLog ? 'quick' : steps[stepIndex];

  const [loading, setLoading] = useState(!!editingLogId);
  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState('Your player');

  const [opponentId, setOpponentId] = useState<string | null>(presetOpponentId ?? null);
  const [opponentName, setOpponentName] = useState((params.name as string) ?? '');
  const [allOpponents, setAllOpponents] = useState<{ id: string; name: string; wins: number; losses: number }[]>([]);

  const [gameScores, setGameScores] = useState<GameScore[]>(emptyGames());
  const score = gamesToScore(gameScores);
  const [result, setResult] = useState<Result>('win');
  const [matchType, setMatchType] = useState<MatchType>('singles');
  const [originalResult, setOriginalResult] = useState<Result | null>(null);
  const [strengthsTags, setStrengthsTags] = useState<string[]>([]);
  const [weaknessesTags, setWeaknessesTags] = useState<string[]>([]);
  const [strengthsText, setStrengthsText] = useState('');
  const [weaknessesText, setWeaknessesText] = useState('');
  const [nextTimeText, setNextTimeText] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [myTournaments, setMyTournaments] = useState<UpcomingTournament[]>([]);
  const [tournamentBlockId, setTournamentBlockId] = useState<string | null>(null);
  const [shareableCoaches, setShareableCoaches] = useState<ShareableCoach[]>([]);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>([]);
  const [previousSharedIds, setPreviousSharedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceNoteUri, setVoiceNoteUri] = useState<string | null>(null);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState<string | null>(null);
  const [voiceNoteDuration, setVoiceNoteDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setLoading(false); return; }
      setMyId(session.user.id);
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).single();
      if (prof?.full_name) setMyName(prof.full_name);
      const { data: opps } = await supabase.from('opponents').select('id, name, wins, losses').eq('player_id', session.user.id);
      setAllOpponents(opps ?? []);
      getShareableCoaches(session.user.id).then(setShareableCoaches);
      getAllTournaments(session.user.id).then(setMyTournaments);

      if (editingLogId) {
        const { data: existing } = await supabase.from('opponent_logs').select('*').eq('id', editingLogId).single();
        if (existing) {
          setGameScores(parseScoreToGames(existing.score ?? ''));
          setResult(existing.result ?? 'win');
          setOriginalResult(existing.result ?? 'win');
          setMatchType(existing.match_type ?? 'singles');
          setStrengthsTags(existing.strengths_tags ?? []);
          setWeaknessesTags(existing.weaknesses_tags ?? []);
          setStrengthsText(existing.strengths_text ?? '');
          setWeaknessesText(existing.weaknesses_text ?? '');
          setNextTimeText(existing.next_time_text ?? '');
          setVideoUrl(existing.video_url ?? '');
          setTournamentBlockId(existing.tournament_block_id ?? null);
          setVoiceNoteUrl(existing.voice_note_url ?? null);
          setVoiceNoteDuration(existing.voice_note_duration_seconds ?? 0);
          const sharedIds: string[] = existing.shared_with_coach_ids ?? [];
          setSelectedCoachIds(sharedIds);
          setPreviousSharedIds(sharedIds);
        }
      }
      setLoading(false);
    })();
  }, []);

  const goBack = () => {
    if (isQuickLog || stepIndex === 0) { router.back(); return; }
    setStepIndex(i => Math.max(0, i - 1));
  };

  const goNext = () => setStepIndex(i => Math.min(steps.length - 1, i + 1));

  const selectSuggestion = (opp: { id: string; name: string }) => {
    setOpponentId(opp.id);
    setOpponentName(opp.name);
  };

  const nameSuggestions = opponentName.trim().length > 0
    ? allOpponents.filter(o => o.name.toLowerCase().includes(opponentName.trim().toLowerCase()) && o.name.toLowerCase() !== opponentName.trim().toLowerCase())
    : [];

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) { showAlert('Permission needed', 'Please allow microphone access to record a voice note.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch {
      showAlert('Error', 'Could not start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) { showAlert('Error', 'Recording failed — no audio captured.'); return; }
      setVoiceNoteUri(uri);
      setVoiceNoteDuration(recordingDuration);
      setRecordingDuration(0);
    } catch {
      showAlert('Error', 'Could not save recording.');
    }
  };

  const discardVoiceNote = () => { setVoiceNoteUri(null); setVoiceNoteUrl(null); setVoiceNoteDuration(0); };

  const save = async () => {
    if (!myId) return;
    if (!editingLogId && !opponentId && !opponentName.trim()) { showAlert('Opponent name needed', 'Enter who you played.'); return; }
    setSaving(true);

    let finalOpponentId = opponentId;
    let priorWins = 0;
    let priorLosses = 0;
    if (!editingLogId) {
      if (finalOpponentId) {
        const existing = allOpponents.find(o => o.id === finalOpponentId);
        priorWins = existing?.wins ?? 0;
        priorLosses = existing?.losses ?? 0;
      } else {
        const { data: created, error } = await supabase
          .from('opponents')
          .insert({ player_id: myId, name: opponentName.trim() })
          .select()
          .single();
        if (error || !created) { setSaving(false); showAlert('Error', 'Could not save opponent. Please try again.'); return; }
        finalOpponentId = created.id;
      }
    }

    let finalVoiceUrl = voiceNoteUrl;
    let finalVoiceDuration = voiceNoteDuration;
    if (voiceNoteUri) {
      const uploaded = await uploadToCloudinary(voiceNoteUri, 'audio', 'hustler_match_voice_notes');
      if (!uploaded) showAlert('Voice note upload failed', 'Saving your log without the voice note.');
      else { finalVoiceUrl = uploaded; finalVoiceDuration = voiceNoteDuration; }
    }

    const payload = {
      opponent_id: finalOpponentId,
      opponent_name: opponentName.trim() || null,
      player_id: myId,
      score: score.trim() || null,
      result,
      match_type: matchType,
      strengths_tags: strengthsTags,
      weaknesses_tags: weaknessesTags,
      strengths_text: strengthsText.trim() || null,
      weaknesses_text: weaknessesText.trim() || null,
      next_time_text: nextTimeText.trim() || null,
      video_url: videoUrl.trim() || null,
      tournament_block_id: tournamentBlockId,
      voice_note_url: finalVoiceUrl,
      voice_note_duration_seconds: finalVoiceUrl ? finalVoiceDuration : null,
      shared_with_coach: selectedCoachIds.length > 0,
      shared_with_coach_ids: selectedCoachIds,
      updated_at: new Date().toISOString(),
    };

    if (editingLogId) {
      const { error: logError } = await supabase.from('opponent_logs').update(payload).eq('id', editingLogId);
      if (logError) { setSaving(false); showAlert('Error', 'Could not save changes. Please try again.'); return; }

      if (originalResult !== result) {
        const opp = allOpponents.find(o => o.id === finalOpponentId);
        let w = opp?.wins ?? 0;
        let l = opp?.losses ?? 0;
        if (originalResult === 'win') w = Math.max(0, w - 1);
        if (originalResult === 'loss') l = Math.max(0, l - 1);
        if (result === 'win') w += 1;
        if (result === 'loss') l += 1;
        await supabase.from('opponents').update({ wins: w, losses: l, updated_at: new Date().toISOString() }).eq('id', finalOpponentId as string);
      }
    } else {
      const { error: logError } = await supabase.from('opponent_logs').insert({ ...payload, is_quick_log: isQuickLog });
      if (logError) { setSaving(false); showAlert('Error', 'Could not save this log. Please try again.'); return; }

      if (result !== 'unsure') {
        await supabase.from('opponents').update({
          wins: priorWins + (result === 'win' ? 1 : 0),
          losses: priorLosses + (result === 'loss' ? 1 : 0),
          updated_at: new Date().toISOString(),
        }).eq('id', finalOpponentId as string);
      }
    }

    const newlyShared = selectedCoachIds.filter((id) => !previousSharedIds.includes(id));
    for (const coachId of newlyShared) {
      await notifyMatchShared(coachId, myName, opponentName.trim() || 'an opponent');
    }

    setSaving(false);
    router.replace({ pathname: '/opponent-detail', params: { opponentId: finalOpponentId as string, name: opponentName.trim() } });
  };

  const resultOptions: { key: Result; label: string; icon: string }[] = [
    { key: 'win', label: 'Win', icon: 'trophy-outline' },
    { key: 'loss', label: 'Loss', icon: 'close-circle-outline' },
  ];

  const matchTypeOptions: { key: MatchType; label: string; icon: string }[] = [
    { key: 'singles', label: 'Singles', icon: 'account-outline' },
    { key: 'doubles', label: 'Doubles', icon: 'account-multiple-outline' },
  ];

  const setGame = (index: number, field: 'my' | 'opp', value: string) => {
    setGameScores(prev => prev.map((g, i) => (i === index ? { ...g, [field]: value.replace(/[^0-9]/g, '') } : g)));
  };

  const renderScoreCard = () => (
    <View style={styles.scoreCard}>
      {gameScores.map((g, i) => (
        <View key={i} style={styles.scoreGameRow}>
          <Text style={styles.scoreGameLabel}>Game {i + 1}</Text>
          <View style={styles.scoreBoxRow}>
            <TextInput
              style={styles.scoreBox}
              placeholder="0"
              placeholderTextColor={Theme.textSecondary}
              value={g.my}
              onChangeText={t => setGame(i, 'my', t)}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.scoreDash}>-</Text>
            <TextInput
              style={styles.scoreBox}
              placeholder="0"
              placeholderTextColor={Theme.textSecondary}
              value={g.opp}
              onChangeText={t => setGame(i, 'opp', t)}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
        </View>
      ))}
    </View>
  );

  const renderResultChips = () => (
    <View style={styles.resultRow}>
      {resultOptions.map(opt => (
        <TouchableOpacity
          key={opt.key}
          style={[styles.resultChip, result === opt.key && styles.resultChipActive]}
          onPress={() => setResult(opt.key)}
        >
          <Icon name={opt.icon as any} size={16} color={result === opt.key ? '#FFFFFF' : Theme.textSecondary} />
          <Text style={[styles.resultChipText, result === opt.key && styles.resultChipTextActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderMatchTypeChips = () => (
    <View style={styles.resultRow}>
      {matchTypeOptions.map(opt => (
        <TouchableOpacity
          key={opt.key}
          style={[styles.resultChip, matchType === opt.key && styles.resultChipActive]}
          onPress={() => setMatchType(opt.key)}
        >
          <Icon name={opt.icon as any} size={16} color={matchType === opt.key ? '#FFFFFF' : Theme.textSecondary} />
          <Text style={[styles.resultChipText, matchType === opt.key && styles.resultChipTextActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderVoiceNoteControl = () => (
    <View style={styles.voiceSection}>
      <Text style={styles.label}>Voice note (optional)</Text>
      {voiceNoteUri || voiceNoteUrl ? (
        <View style={styles.voiceSavedRow}>
          <Icon name="microphone-outline" size={18} color={Theme.eyebrowGreen} />
          <Text style={styles.voiceSavedText}>{voiceNoteUri ? `Recorded · ${voiceNoteDuration}s` : `Voice note saved${voiceNoteDuration ? ` · ${voiceNoteDuration}s` : ''}`}</Text>
          <TouchableOpacity onPress={discardVoiceNote}><Icon name="close" size={18} color={Theme.textSecondary} /></TouchableOpacity>
        </View>
      ) : isRecording ? (
        <TouchableOpacity style={styles.recordBtnActive} onPress={stopRecording}>
          <Icon name="stop-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.recordBtnText}>Stop · {recordingDuration}s</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.recordBtn} onPress={startRecording}>
          <Icon name="microphone-outline" size={20} color={Theme.eyebrowGreen} />
          <Text style={styles.recordBtnTextIdle}>Record a voice note</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const canGoNext = () => {
    if (step === 'opponent') return opponentName.trim().length > 0;
    return true;
  };

  const renderCard = () => {
    if (step === 'quick') {
      return (
        <>
          <Text style={styles.cardTitle}>Quick log</Text>
          <Text style={styles.label}>Opponent</Text>
          {presetOpponentId ? (
            <Text style={styles.presetName}>{opponentName}</Text>
          ) : (
            <>
              <TextInput style={styles.input} placeholder="Opponent name" placeholderTextColor={Theme.textSecondary} value={opponentName} onChangeText={t => { setOpponentName(t); setOpponentId(null); }} />
              {nameSuggestions.length > 0 && (
                <View style={styles.suggestionList}>
                  {nameSuggestions.map(o => (
                    <TouchableOpacity key={o.id} style={styles.suggestionRow} onPress={() => selectSuggestion(o)}>
                      <Text style={styles.suggestionText}>{o.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
          <Text style={[styles.label, { marginTop: 16 }]}>Match type</Text>
          {renderMatchTypeChips()}
          <Text style={[styles.label, { marginTop: 16 }]}>Score</Text>
          {renderScoreCard()}
          <Text style={[styles.label, { marginTop: 16 }]}>Did you win?</Text>
          {renderResultChips()}
        </>
      );
    }
    if (step === 'opponent') {
      return (
        <>
          <Text style={styles.cardTitle}>Who did you play?</Text>
          <TextInput style={styles.input} placeholder="Opponent name" placeholderTextColor={Theme.textSecondary} value={opponentName} onChangeText={t => { setOpponentName(t); setOpponentId(null); }} autoFocus />
          {nameSuggestions.length > 0 && (
            <View style={styles.suggestionList}>
              {nameSuggestions.map(o => (
                <TouchableOpacity key={o.id} style={styles.suggestionRow} onPress={() => selectSuggestion(o)}>
                  <Icon name="history" size={14} color={Theme.textSecondary} />
                  <Text style={styles.suggestionText}>{o.name}</Text>
                  <Text style={styles.suggestionHint}>Rematch</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      );
    }
    if (step === 'score') {
      return (
        <>
          <Text style={styles.cardTitle}>What was the score?</Text>
          <Text style={styles.label}>Match type</Text>
          {renderMatchTypeChips()}
          <Text style={[styles.label, { marginTop: 16 }]}>Score</Text>
          {renderScoreCard()}
          <Text style={[styles.label, { marginTop: 16 }]}>Did you win?</Text>
          {renderResultChips()}
        </>
      );
    }
    if (step === 'strengths') {
      return (
        <>
          <Text style={styles.cardTitle}>What were their strengths?</Text>
          <TagChipSelector categories={STRENGTH_CATEGORIES} selected={strengthsTags} onChange={setStrengthsTags} />
          <Text style={[styles.label, { marginTop: 16 }]}>Anything else?</Text>
          <TextInput style={[styles.input, styles.multiline]} placeholder="Optional notes..." placeholderTextColor={Theme.textSecondary} value={strengthsText} onChangeText={setStrengthsText} multiline />
        </>
      );
    }
    if (step === 'weaknesses') {
      return (
        <>
          <Text style={styles.cardTitle}>What were their weaknesses?</Text>
          <TagChipSelector categories={WEAKNESS_CATEGORIES} selected={weaknessesTags} onChange={setWeaknessesTags} />
          <Text style={[styles.label, { marginTop: 16 }]}>Anything else?</Text>
          <TextInput style={[styles.input, styles.multiline]} placeholder="Optional notes..." placeholderTextColor={Theme.textSecondary} value={weaknessesText} onChangeText={setWeaknessesText} multiline />
        </>
      );
    }
    if (step === 'nextTime') {
      return (
        <>
          <Text style={styles.cardTitle}>What will you try next time?</Text>
          <TextInput style={[styles.input, styles.multiline]} placeholder="e.g. Attack the backhand more, mix up serve length..." placeholderTextColor={Theme.textSecondary} value={nextTimeText} onChangeText={setNextTimeText} multiline autoFocus />
          <Text style={[styles.label, { marginTop: 16 }]}>Match video link (optional)</Text>
          <TextInput style={styles.input} placeholder="Paste a link to your match video" placeholderTextColor={Theme.textSecondary} value={videoUrl} onChangeText={setVideoUrl} autoCapitalize="none" keyboardType="url" />
          {myTournaments.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: 16 }]}>Tournament (optional)</Text>
              <View style={[styles.resultRow, { flexWrap: 'wrap' }]}>
                <TouchableOpacity
                  style={[styles.resultChip, !tournamentBlockId && styles.resultChipActive]}
                  onPress={() => setTournamentBlockId(null)}
                >
                  <Text style={[styles.resultChipText, !tournamentBlockId && styles.resultChipTextActive]}>None</Text>
                </TouchableOpacity>
                {myTournaments.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.resultChip, tournamentBlockId === t.id && styles.resultChipActive]}
                    onPress={() => setTournamentBlockId(t.id)}
                  >
                    <Text style={[styles.resultChipText, tournamentBlockId === t.id && styles.resultChipTextActive]}>{t.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          {renderVoiceNoteControl()}
        </>
      );
    }
    // done
    return (
      <>
        <Text style={styles.cardTitle}>{editingLogId ? 'Changes ready' : 'Scouting report ready'}</Text>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryOpponent}>{opponentName || 'Opponent'}</Text>
          {score.trim() !== '' && <Text style={styles.summaryLine}>Score: {score}</Text>}
          {strengthsTags.length > 0 && <Text style={styles.summaryLine}>Strengths: {strengthsTags.join(', ')}</Text>}
          {weaknessesTags.length > 0 && <Text style={styles.summaryLine}>Weaknesses: {weaknessesTags.join(', ')}</Text>}
        </View>
        <View style={styles.shareBlock}>
          <View style={styles.shareRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareLabel}>Share this log with your coach</Text>
              <View style={styles.shareHintRow}>
                <Icon name="lock-outline" size={12} color={Theme.textSecondary} />
                <Text style={styles.shareHint}>
                  {selectedCoachIds.length > 0
                    ? `Shared with ${selectedCoachIds.length} coach${selectedCoachIds.length > 1 ? 'es' : ''}.`
                    : 'Off by default — only you can see it until you share.'}
                </Text>
              </View>
            </View>
            <Switch
              value={selectedCoachIds.length > 0}
              onValueChange={(v) => setSelectedCoachIds(v ? shareableCoaches.map((c) => c.id) : [])}
              trackColor={{ false: Theme.divider, true: Theme.eyebrowGreen }}
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
      </>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={goBack}>
            <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{editingLogId ? 'Edit Match' : isQuickLog ? 'Quick Log' : 'Log a Match'}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Theme.eyebrowGreen} style={{ marginTop: 40 }} />
        ) : (
          <>
            {!isQuickLog && (
              <Text style={styles.stepIndicator}>Step {stepIndex + 1} of {steps.length}</Text>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              <View style={styles.card}>{renderCard()}</View>
            </ScrollView>

            <View style={styles.footer}>
              {isQuickLog || step === 'done' ? (
                <TouchableOpacity style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Save</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.primaryBtn, !canGoNext() && styles.primaryBtnDisabled]} onPress={goNext} disabled={!canGoNext()}>
                  <Text style={styles.primaryBtnText}>Next</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Theme.textPrimary },
  stepIndicator: { fontSize: 13, color: Theme.textSecondary, marginBottom: 16 },
  scroll: { paddingBottom: 24 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 20, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: Theme.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, color: Theme.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Theme.background,
    borderRadius: 10,
    padding: 14,
    color: Theme.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Theme.divider,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  scoreCard: { gap: 12 },
  scoreGameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreGameLabel: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  scoreBoxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: Theme.background,
    borderWidth: 1,
    borderColor: Theme.divider,
    color: Theme.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  scoreDash: { fontSize: 18, fontWeight: '700', color: Theme.textSecondary },
  presetName: { fontSize: 16, fontWeight: '600', color: Theme.textPrimary },
  suggestionList: { marginTop: 8, gap: 4 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.background, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Theme.divider },
  suggestionText: { flex: 1, fontSize: 14, color: Theme.textPrimary },
  suggestionHint: { fontSize: 13, color: Theme.eyebrowGreen, fontWeight: '600' },
  resultRow: { flexDirection: 'row', gap: 8 },
  resultChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: Theme.background, borderWidth: 1, borderColor: Theme.divider },
  resultChipActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  resultChipText: { fontSize: 13, color: Theme.textSecondary, fontWeight: '600' },
  resultChipTextActive: { color: '#FFFFFF' },
  voiceSection: { marginTop: 16 },
  recordBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 12, justifyContent: 'center' },
  recordBtnTextIdle: { color: Theme.eyebrowGreen, fontWeight: '600', fontSize: 13 },
  recordBtnActive: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E67E22', borderRadius: 10, padding: 12, justifyContent: 'center' },
  recordBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  voiceSavedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.cardTinted, borderRadius: 10, padding: 12 },
  voiceSavedText: { flex: 1, color: Theme.eyebrowGreen, fontWeight: '600', fontSize: 13 },
  summaryCard: { backgroundColor: Theme.background, borderRadius: 12, padding: 14, gap: 6, marginBottom: 20 },
  summaryOpponent: { fontSize: 16, fontWeight: 'bold', color: Theme.textPrimary },
  summaryLine: { fontSize: 14, color: Theme.textSecondary },
  shareBlock: { gap: 10 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareLabel: { fontSize: 14, fontWeight: '600', color: Theme.textPrimary },
  shareHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  shareHint: { fontSize: 13, color: Theme.textSecondary },
  coachChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coachChip: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Theme.divider, backgroundColor: Theme.background },
  coachChipActive: { backgroundColor: Theme.eyebrowGreen, borderColor: Theme.eyebrowGreen },
  coachChipText: { fontSize: 13, fontWeight: '600', color: Theme.textPrimary },
  coachChipTextActive: { color: '#FFFFFF' },
  footer: { paddingTop: 16 },
  primaryBtn: { backgroundColor: Theme.limeAccent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: Theme.limeAccentDark, fontWeight: 'bold', fontSize: 15 },
});
