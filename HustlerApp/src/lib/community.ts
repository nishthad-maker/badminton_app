import { supabase } from './supabase';

// Basic blocklist - extend as needed
const BLOCKED_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga',
  'faggot', 'retard', 'whore', 'slut', 'dick', 'pussy', 'cock',
  'kill yourself', 'kys', 'sex', 'sexy'
];

export const containsBlockedWords = (text: string): boolean => {
  const lower = text.toLowerCase();
  return BLOCKED_WORDS.some((word) => lower.includes(word));
};

const ADJECTIVES = ['Swift', 'Quick', 'Sharp', 'Bold', 'Steady', 'Sonic', 'Power', 'Rapid', 'Iron', 'Fierce'];
const NOUNS = ['Smasher', 'Drive', 'Rally', 'Shuttle', 'Player', 'Ace', 'Net', 'Court', 'Hustler', 'Pro'];

const generateUsername = (): string => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}${noun}${num}`;
};

export const getOrCreateUsername = async (userId: string): Promise<string> => {
  const { data: existing } = await supabase
    .from('usernames')
    .select('username')
    .eq('user_id', userId)
    .single();

  if (existing?.username) return existing.username;

  for (let i = 0; i < 5; i++) {
    const candidate = generateUsername();
    const { error } = await supabase
      .from('usernames')
      .insert({ user_id: userId, username: candidate });
    if (!error) return candidate;
  }

  const fallback = `Player${Date.now() % 100000}`;
  await supabase.from('usernames').upsert({ user_id: userId, username: fallback });
  return fallback;
};

export const TOPICS = ['General Discussion', 'Training Tips', 'Recovery & Wellness', 'Equipment'];

// Same swatches used for workout categories elsewhere in the app, reused here
// so each poster's avatar gets a distinct, stable color instead of one flat blue.
export const AVATAR_COLORS = [
  { bg: '#CFE0F9', fg: '#0C447C' },
  { bg: '#E2EFAE', fg: '#3B6D11' },
  { bg: '#FBDAB3', fg: '#854F0B' },
  { bg: '#E3D9F5', fg: '#534AB7' },
  { bg: '#F9C9DE', fg: '#C0135E' },
];

export const avatarColorFor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

export const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};