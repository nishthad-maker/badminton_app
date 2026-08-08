import { Modal, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import pepTalks from '@/data/pepTalks';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const pickIndex = (avoid: number | null): number => {
  if (pepTalks.length <= 1) return 0;
  let next = Math.floor(Math.random() * pepTalks.length);
  while (next === avoid) next = Math.floor(Math.random() * pepTalks.length);
  return next;
};

// On-demand motivational message — for a rough training day or before/after
// a match, wherever a player taps "Mental Prep". The messages are static
// (see data/pepTalks.js) and each has a real recorded clip (ElevenLabs
// "Bella" voice, picked by comparing 5 real voices) rather than live
// on-device text-to-speech — that used to sound however robotic the user's
// installed OS voice happened to be, no picker could fix that. Playback
// here is the same Audio.Sound pattern MessageBubble.tsx already uses for
// voice-note playback.
export function PepTalkModal({ visible, onClose }: Props) {
  const [index, setIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const stopSound = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setPlaying(false);
  };

  useEffect(() => {
    if (visible) setIndex(pickIndex(null));
  }, [visible]);

  // Stop playback the moment the modal closes, the message changes
  // underneath it, or the component unmounts.
  useEffect(() => {
    if (!visible) stopSound();
    return () => { stopSound(); };
  }, [visible]);

  useEffect(() => {
    stopSound();
  }, [index]);

  const toggleSpeak = async () => {
    if (playing) {
      await stopSound();
      return;
    }
    if (index === null) return;
    const { sound } = await Audio.Sound.createAsync({ uri: pepTalks[index].audioUrl }, { shouldPlay: true });
    soundRef.current = sound;
    setPlaying(true);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) stopSound();
    });
  };

  const another = () => setIndex((prev) => pickIndex(prev));

  const handleClose = async () => {
    await stopSound();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Icon name="heart-pulse" size={30} color={Theme.flameOrange} />
          </View>
          <Text style={styles.eyebrow}>MENTAL PREP</Text>
          <Text style={styles.message}>{index !== null ? pepTalks[index].text : ''}</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={toggleSpeak}>
              <Icon name={playing ? 'volume-off' : 'volume-high'} size={17} color={Theme.eyebrowGreen} />
              <Text style={styles.actionBtnText}>{playing ? 'Stop' : 'Play'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={another}>
              <Icon name="refresh" size={17} color={Theme.eyebrowGreen} />
              <Text style={styles.actionBtnText}>Another one</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeBtnText}>Back to it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 26, padding: 28, alignItems: 'center', width: '100%', maxWidth: 380 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FCE7D2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  eyebrow: { fontFamily: Fonts.sansBold, fontSize: 13, color: Theme.flameOrange, letterSpacing: 1.5, marginBottom: 14 },
  message: { fontFamily: Fonts.serifMedium, fontSize: 21, lineHeight: 29, color: Theme.textPrimary, textAlign: 'center', marginBottom: 24 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 22 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Theme.eyebrowGreen },
  closeBtn: { backgroundColor: Theme.limeAccent, borderRadius: 30, paddingVertical: 14, paddingHorizontal: 36 },
  closeBtnText: { fontFamily: Fonts.sansBold, fontSize: 16, color: Theme.limeAccentDark },
});
