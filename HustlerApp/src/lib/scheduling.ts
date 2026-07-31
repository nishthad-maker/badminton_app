export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = DAY_NAMES.map((d) => d.slice(0, 3));

// group_tiers has no end_time column (unlike schedule_assignments) — assume
// a 1-hour session purely for visualizations/overlap checks that need a
// duration. If a club ever reports false conflicts/utilization for tiers
// that run longer or shorter than an hour, add a real end_time column
// instead of tuning this constant.
export const ASSUMED_TIER_DURATION_MINUTES = 60;

// Players/parents are shown by first name only in rosters and schedule
// cards — coaches keep their full name everywhere (see formatTime12h below
// for the same "always convert before display" rule, applied to names).
export const firstName = (fullName: string | null | undefined): string => (fullName ?? '').trim().split(/\s+/)[0] || 'Player';

// Postgres `time` comes back as "HH:MM:SS"; form inputs are "HH:MM". Trim
// both to 5 chars so string comparison lines up (equal times compare equal
// instead of one looking like a prefix of the other).
export const hhmm = (time: string) => time.slice(0, 5);

export const timeToMinutes = (time: string): number => {
  const [h, m] = hhmm(time).split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
};

export const addMinutesToTime = (time: string, minutes: number): string => {
  const total = (timeToMinutes(time) + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const timesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  hhmm(aStart) < hhmm(bEnd) && hhmm(bStart) < hhmm(aEnd);

// Every stored/typed time is 24h ("16:00"); display always converts to 12h
// with AM/PM so a schedule never reads like a bare "16:00" to a coach.
export const formatTime12h = (time: string): string => {
  const [hStr, mStr] = hhmm(time).split(':');
  const h = parseInt(hStr, 10) || 0;
  const minute = parseInt(mStr, 10) || 0;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
};
