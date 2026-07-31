import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_CHILD_KEY = 'hustler.activeChildId';

// Which linked child is "in view" across the parent's 4 separate tab
// screens (Home/Schedule/Tournaments/Journal) — same AsyncStorage-backed
// pattern as lib/club.ts's active-club selection, since expo-router tabs are
// independently mounted screens with no shared React state between them.
export async function getActiveChildId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_CHILD_KEY);
  } catch {
    return null;
  }
}

export async function setActiveChildId(childId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_CHILD_KEY, childId);
  } catch {
    // best-effort — a failed write just means the switcher default resets next load
  }
}
