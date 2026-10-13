import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActivitySession } from './types';

const TIMER_STORAGE_KEY = 'goaldin-active-timer';
let storageQueue: Promise<void> = Promise.resolve();

function queueStorageWrite(
  operation: () => Promise<void>
): Promise<void> {
  const result = storageQueue.then(operation);

  storageQueue = result.catch(() => {});

  return result;
}

export type SavedTimer = {
  endAt: number;
  session: ActivitySession;
};

export async function saveTimerState(
  timer: SavedTimer
): Promise<void> {
 await queueStorageWrite(() =>
  AsyncStorage.setItem(
    TIMER_STORAGE_KEY,
    JSON.stringify(timer)
  )
);
}

export async function loadTimerState(): Promise<SavedTimer | null> {
    await storageQueue;
  const stored = await AsyncStorage.getItem(TIMER_STORAGE_KEY);

  if (!stored) return null;

  const parsed: SavedTimer = JSON.parse(stored);

  if (
    !Number.isFinite(parsed.endAt) ||
    !parsed.session?.id
  ) {
    return null;
  }

  return parsed;
}

export async function clearTimerState(): Promise<void> {
  await queueStorageWrite(() =>
    AsyncStorage.removeItem(TIMER_STORAGE_KEY)
  );
}