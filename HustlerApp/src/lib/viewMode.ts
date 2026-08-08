import AsyncStorage from '@react-native-async-storage/async-storage';

const VIEW_MODE_KEY = 'hustler.preferredViewMode';

export type ViewMode = 'coach' | 'club';

// Which route group a dual-role account (profiles.is_coach = true AND
// role = 'club' — an owner who also coaches) lands in — same
// AsyncStorage-backed pattern as lib/club.ts's active-club selection and
// lib/parentSelection.ts's active-child selection, since expo-router tabs
// are independently mounted screens with no shared React state between them.
// Only meaningful for dual-role accounts; roleFromProfile() falls back to
// 'coach' when nothing has been stored yet.
export async function getPreferredViewMode(): Promise<ViewMode | null> {
  try {
    const v = await AsyncStorage.getItem(VIEW_MODE_KEY);
    return v === 'coach' || v === 'club' ? v : null;
  } catch {
    return null;
  }
}

export async function setPreferredViewMode(mode: ViewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // best-effort — a failed write just means the default resets next load
  }
}
