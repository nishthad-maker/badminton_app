import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { uploadToCloudinary, MediaAssetKind } from './cloudinary';

export type PickMediaResult =
  | { status: 'picked'; uri: string; kind: MediaAssetKind }
  | { status: 'permission-denied' }
  | { status: 'cancelled' };

export async function pickChatMedia(): Promise<PickMediaResult> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return { status: 'permission-denied' };
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 });
  if (result.canceled || !result.assets[0]) return { status: 'cancelled' };
  const asset = result.assets[0];
  return { status: 'picked', uri: asset.uri, kind: asset.type === 'video' ? 'video' : 'image' };
}

export type ChatMediaType = 'photo' | 'video';

export async function sendChatMediaMessage(params: {
  assignmentId: string;
  senderId: string;
  uri: string;
  kind: MediaAssetKind;
}): Promise<{ url: string; mediaType: ChatMediaType } | null> {
  const mediaType: ChatMediaType = params.kind === 'image' ? 'photo' : 'video';
  const url = await uploadToCloudinary(params.uri, params.kind, 'hustler_chat');
  if (!url) return null;
  const { error } = await supabase.from('assignment_messages').insert({
    assignment_id: params.assignmentId,
    sender_id: params.senderId,
    message: '',
    media_url: url,
    media_type: mediaType,
  });
  if (error) return null;
  return { url, mediaType };
}

export async function sendMatchVoiceMessage(params: {
  opponentLogId: string;
  senderId: string;
  uri: string;
  durationSeconds: number;
}): Promise<{ url: string; durationSeconds: number } | null> {
  const url = await uploadToCloudinary(params.uri, 'audio', 'hustler_match_feedback_voice_notes');
  if (!url) return null;
  const { error } = await supabase.from('opponent_log_messages').insert({
    opponent_log_id: params.opponentLogId,
    sender_id: params.senderId,
    message: '',
    media_url: url,
    media_type: 'audio',
    media_duration_seconds: params.durationSeconds,
  });
  if (error) return null;
  return { url, durationSeconds: params.durationSeconds };
}
