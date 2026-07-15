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

// ── Editorial light theme ──
// New tokens for the in-progress redesign. `Colors` above stays untouched
// so screens not yet migrated keep rendering on the old dark theme; each
// screen switches over to `Theme` as it gets rebuilt.
export const Theme = {
  background: '#F3F5F0',
  cardWhite: '#FFFFFF',
  cardTinted: '#CFE0F9',
  cardDark: '#0D2818',

  textPrimary: '#1A1A18',
  textSecondary: '#6B6A63',
  textMuted: '#A8A69C',
  eyebrowGreen: '#123C35',
  mutedGreen: '#6E8C61',
  divider: '#EFEEE6',

  // Text/icon colors that read on the dark (cardDark) tier
  onDarkPrimary: '#FFFFFF',
  onDarkSecondary: 'rgba(255,255,255,0.7)',
  onDarkAccent: '#E2EFAE',

  // Bright lime — completed-day circles and progress fills on the dark card
  limeAccent: '#C6E86B',
  limeAccentDark: '#1A3D27',
  flameOrange: '#F2994A',
  todayBlue: '#0B7D62',
} as const;

// One pastel bg/fg pair per workout category — use everywhere a category
// shows up (icon tiles, tags, chips) so the mapping stays consistent.
export const CategoryTheme = {
  strength: { bg: '#CFE0F9', fg: '#0C447C' },
  footwork: { bg: '#E2EFAE', fg: '#3B6D11' },
  endurance: { bg: '#FBDAB3', fg: '#854F0B' },
  recovery: { bg: '#E3D9F5', fg: '#534AB7' },
} as const;

// Serif (Fraunces) is for section headlines only; body/UI text uses DM Sans.
export const Fonts = {
  serifRegular: 'Fraunces_400Regular',
  serifMedium: 'Fraunces_500Medium',
  serifSemiBold: 'Fraunces_600SemiBold',

  sansRegular: 'DMSans_400Regular',
  sansItalic: 'DMSans_400Regular_Italic',
  sansMedium: 'DMSans_500Medium',
  sansSemiBold: 'DMSans_600SemiBold',
  sansBold: 'DMSans_700Bold',
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