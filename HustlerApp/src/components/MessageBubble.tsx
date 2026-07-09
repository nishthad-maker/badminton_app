import { View, Text, TouchableOpacity, Image, Linking, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';

export function MessageBubble({
  isMine,
  senderLabel,
  message,
  mediaUrl,
  mediaType,
  timeLabel,
}: {
  isMine: boolean;
  senderLabel?: string;
  message?: string;
  mediaUrl?: string | null;
  mediaType?: 'photo' | 'video' | null;
  timeLabel: string;
}) {
  return (
    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
      {!isMine && senderLabel ? <Text style={styles.sender}>{senderLabel}</Text> : null}
      {mediaUrl ? (
        mediaType === 'video' ? (
          <TouchableOpacity style={styles.video} onPress={() => Linking.openURL(mediaUrl)}>
            <MaterialCommunityIcons name="play-circle-outline" size={26} color={isMine ? '#fff' : Colors.accent} />
            <Text style={[styles.videoText, isMine ? styles.textMine : styles.textOther]}>Tap to watch</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => Linking.openURL(mediaUrl)}>
            <Image source={{ uri: mediaUrl }} style={styles.thumb} resizeMode="cover" />
          </TouchableOpacity>
        )
      ) : (
        <Text style={[styles.text, isMine ? styles.textMine : styles.textOther]}>{message}</Text>
      )}
      <Text style={[styles.time, isMine ? styles.timeMine : styles.timeOther]}>{timeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  bubbleMine: { backgroundColor: Colors.accent, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  sender: { fontSize: 10, color: Colors.accent, fontWeight: '700', marginBottom: 2 },
  text: { fontSize: 13, lineHeight: 18 },
  textMine: { color: '#FFFFFF' },
  textOther: { color: Colors.textPrimary },
  time: { fontSize: 10 },
  timeMine: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  timeOther: { color: Colors.textSecondary },
  thumb: { width: 180, height: 130, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.2)' },
  video: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  videoText: { fontSize: 13, fontWeight: '600' },
});
