import { View, TouchableOpacity, Image, Linking, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { Icon } from '@/components/icons/Icon';
import { Theme } from '@/constants/theme';

export function MessageBubble({
  isMine,
  senderLabel,
  message,
  mediaUrl,
  mediaType,
  timeLabel,
  onDelete,
  deletable = true,
}: {
  isMine: boolean;
  senderLabel?: string;
  message?: string;
  mediaUrl?: string | null;
  mediaType?: 'photo' | 'video' | null;
  timeLabel: string;
  onDelete?: () => void;
  deletable?: boolean;
}) {
  return (
    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
      {!isMine && senderLabel ? <Text style={styles.sender}>{senderLabel}</Text> : null}
      {mediaUrl ? (
        mediaType === 'video' ? (
          <TouchableOpacity style={styles.video} onPress={() => Linking.openURL(mediaUrl)}>
            <Icon name="play-circle-outline" size={26} color={isMine ? '#fff' : Theme.todayBlue} />
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
      <View style={styles.footer}>
        {isMine && onDelete && deletable ? (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Icon name="trash-can-outline" size={13} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.time, isMine ? styles.timeMine : styles.timeOther]}>{timeLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  bubbleMine: { backgroundColor: Theme.eyebrowGreen, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#E1F3EE', borderWidth: 1, borderColor: '#BEE6DA', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  sender: { fontSize: 11, color: Theme.todayBlue, fontWeight: '700', marginBottom: 2 },
  text: { fontSize: 13, lineHeight: 18 },
  textMine: { color: '#FFFFFF' },
  textOther: { color: Theme.textPrimary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  time: { fontSize: 11 },
  timeMine: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  timeOther: { color: Theme.textSecondary },
  thumb: { width: 180, height: 130, borderRadius: 10, backgroundColor: Theme.background },
  video: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  videoText: { fontSize: 13, fontWeight: '600' },
});
