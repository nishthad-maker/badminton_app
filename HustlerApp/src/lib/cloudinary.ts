import { Platform } from 'react-native';

const CLOUDINARY_CLOUD = 'pyqqwrax';
const CLOUDINARY_PRESET = 'hustler_videos';

export type MediaAssetKind = 'image' | 'video';

export async function uploadToCloudinary(uri: string, kind: MediaAssetKind, folder: string): Promise<string | null> {
  try {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      formData.append('file', blob, kind === 'video' ? 'clip.mp4' : 'photo.jpg');
    } else {
      formData.append('file', { uri, type: kind === 'video' ? 'video/mp4' : 'image/jpeg', name: kind === 'video' ? 'clip.mp4' : 'photo.jpg' } as any);
    }
    formData.append('upload_preset', CLOUDINARY_PRESET);
    formData.append('folder', folder);
    const endpoint = kind === 'video' ? 'video' : 'image';
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${endpoint}/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    return data.secure_url ?? null;
  } catch (e) {
    return null;
  }
}
