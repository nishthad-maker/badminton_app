export const DAILY_QUOTES: string[] = [
  "Pain is temporary. Quitting lasts forever. — Lance Armstrong",
  "I've failed over and over again, and that is why I succeed. — Michael Jordan",
  "It's not whether you get knocked down, it's whether you get up. — Vince Lombardi",
  "A champion is defined not by their wins, but by how they recover when they fall. — Serena Williams",
  "The struggles within yourself are the battles that really matter. — Jesse Owens",
  "I fear the man who has practiced one kick 10,000 times. — Bruce Lee",
  "Hard work beats talent when talent doesn't work hard. — Tim Notke",
  "It took 17 years and 114 days to become an overnight success. — Lionel Messi",
  "I'd rather regret the risks that didn't work out than the chances I never took. — Simone Biles",
  "If we dare to win, we should also dare to lose. — Lee Chong Wei",
  "You have to fight to reach your dream. — Rafael Nadal",
  "The moment you give up is the moment you let someone else win. — Kobe Bryant",
  "There are no shortcuts. Everything is reps, reps, reps. — Michael Jordan",
   "I can, because I believe I can. — Carolina Marín",
   "Every day is an exam for me. — Viktor Axelsen",
  "It doesn't matter how many times you fall, it's how many times you stand back up. — Lin Dan",
  "You have to go through the hardest phase to succeed. — Lee Chong Wei",
  "I never think about giving up. I always think there is a way to win. — Carolina Marín",
  "The greatest asset is a strong mind. If I know someone is training harder than I am, I have no excuses. — P.V. Sindhu",
  "Losing is not my choice, but fighting till the end is. — P.V. Sindhu",
  "The harder the battle, the sweeter the victory. — Les Brown",
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
