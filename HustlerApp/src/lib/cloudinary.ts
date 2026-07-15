import { Platform } from 'react-native';

const CLOUDINARY_CLOUD = 'pyqqwrax';
const CLOUDINARY_PRESET = 'hustler_videos';

export type MediaAssetKind = 'image' | 'video' | 'audio';

const FILE_META: Record<MediaAssetKind, { type: string; name: string }> = {
  image: { type: 'image/jpeg', name: 'photo.jpg' },
  video: { type: 'video/mp4', name: 'clip.mp4' },
  audio: { type: 'audio/m4a', name: 'voice_note.m4a' },
};

export async function uploadToCloudinary(uri: string, kind: MediaAssetKind, folder: string): Promise<string | null> {
  try {
    const { type, name } = FILE_META[kind];
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      formData.append('file', blob, name);
    } else {
      formData.append('file', { uri, type, name } as any);
    }
    formData.append('upload_preset', CLOUDINARY_PRESET);
    formData.append('folder', folder);
    // Cloudinary treats audio uploads under its 'video' resource type/endpoint.
    const endpoint = kind === 'image' ? 'image' : 'video';
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${endpoint}/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    return data.secure_url ?? null;
  } catch (e) {
    return null;
  }
}
