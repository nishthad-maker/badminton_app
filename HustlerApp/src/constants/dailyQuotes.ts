export const DAILY_QUOTES: string[] = [
  "If we dare to win, we should also dare to lose. — Lee Chong Wei",
  "You have to go through the hardest phase to succeed. — Lee Chong Wei",
  "I can, because I believe I can. — Carolina Marín",
  "I never think about giving up. I always think there is a way to win. — Carolina Marín",
  "Every day is an exam for me. — Viktor Axelsen",
  "It doesn't matter how many times you fall, it's how many times you stand back up. — Lin Dan",
  "The greatest asset is a strong mind. If I know someone is training harder than I am, I have no excuses. — P.V. Sindhu",
  "Losing is not my choice, but fighting till the end is. — P.V. Sindhu",
  "Badminton has given me life, and I've given it mine. — Carolina Marin"
]

export type DailyQuote = { quote: string; author: string };

export const getDailyQuote = (date: Date = new Date()): DailyQuote => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);
  const raw = DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
  const sepIndex = raw.lastIndexOf(' — ');
  return sepIndex >= 0
    ? { quote: raw.slice(0, sepIndex), author: raw.slice(sepIndex + 3) }
    : { quote: raw, author: '' };
};
