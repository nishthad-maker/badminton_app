import { Platform } from 'react-native';

export const Colors = {
  // Background gradient stops
  backgroundTop: '#0D2818',
  backgroundBottom: '#14532D',

  // Cards
  backgroundCard: '#1A3D27',

  // Accent
  accent: '#2ECC71',
  accentMuted: '#1A5C38',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0B8A8',
  textAccent: '#2ECC71',

  // Tags
  tagBackground: '#1A3D27',
  tagText: '#FFFFFF',

  // Borders
  border: '#2A5C3A',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;