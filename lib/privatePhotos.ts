import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

// Private to this app install and scoped by the authenticated user ID.
// Not uploaded, not exposed to Circle, not synchronized across devices.
export type YouArt = { portraitUri?: string; backgroundUri?: string };
export type ProgressPhoto = {
  id: string;
  uri: string;
  createdAt: string;
  note: string;
  goalId?: string;
  goalTitle?: string;
};

const prefsKey = (userId: string) => `goaldin:you-art:v1:${userId}`;
const photosKey = (userId: string) => `goaldin:camera-photos:v1:${userId}`;

export async function loadYouArt(userId: string): Promise<YouArt> {
  const saved = await AsyncStorage.getItem(prefsKey(userId));
  if (!saved) return {};
  try {
    const data = JSON.parse(saved);
    return {
      portraitUri: typeof data.portraitUri === 'string' ? data.portraitUri : undefined,
      backgroundUri: typeof data.backgroundUri === 'string' ? data.backgroundUri : undefined,
    };
  } catch {
    return {};
  }
}

export async function saveYouArt(userId: string, art: YouArt): Promise<void> {
  await AsyncStorage.setItem(prefsKey(userId), JSON.stringify(art));
}

export async function savePhotoFile(userId: string, originalUri: string, category: string): Promise<string> {
  const directory = new Directory(Paths.document, 'goaldin-private', userId);
  directory.create({ idempotent: true, intermediates: true });
  const ending = originalUri.split('?')[0].match(/\.(jpg|jpeg|png|webp|heic)$/i)?.[1]?.toLowerCase() || 'jpg';
  const filename = `${category}-${Date.now()}-${Math.floor(Math.random() * 100000)}.${ending}`;
  const destination = new File(directory, filename);
  await new File(originalUri).copy(destination);
  return destination.uri;
}

export async function loadProgressPhotos(userId: string): Promise<ProgressPhoto[]> {
  const saved = await AsyncStorage.getItem(photosKey(userId));
  if (!saved) return [];
  try {
    const data = JSON.parse(saved);
    return Array.isArray(data) ? data.filter((item): item is ProgressPhoto =>
      !!item && typeof item.id === 'string' && typeof item.uri === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveProgressPhotos(userId: string, photos: ProgressPhoto[]): Promise<void> {
  await AsyncStorage.setItem(photosKey(userId), JSON.stringify(photos));
}

export function deletePhotoFile(uri: string): void {
  try {
    const image = new File(uri);
    if (image.exists) image.delete();
  } catch {
    // Removing a missing cached picture must never break the screen.
  }
}
