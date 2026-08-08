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

// Every stored/typed date is "YYYY-MM-DD"; display always converts to
// "Month D, YYYY" (e.g. "August 4, 2026") so a date never reads as a bare
// ISO string anywhere in the app. The "T00:00:00" suffix forces the Date to
// parse in local time instead of UTC midnight, which would otherwise show
// the wrong day in negative-UTC-offset timezones.
export const formatDateLong = (dateStr: string): string =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// The other direction: a Date -> "YYYY-MM-DD". Never use `d.toISOString().split('T')[0]`
// for this — toISOString() converts to UTC first, so for anyone west of UTC
// (all of the Americas) it silently rolls the date forward by one once local
// time passes the UTC offset each evening (e.g. 8pm ET, 5pm PT). Read the
// local Y/M/D fields directly instead.
export const localDateStr = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Free-text time entry (club-onboarding.tsx's typed hours step, in place of
// a scroll-wheel TimePicker) — accepts "9am", "9:00am", "9:00 AM", "09:00",
// "21:00", etc. and normalizes to the 24h "HH:MM" storage format every
// other consumer (club_settings.open_time/close_time, getClubHours, the
// calendar) already expects unchanged. Returns null for anything
// unparseable so the caller can show an inline error instead of saving junk.
export const parseTypedTime = (input: string): string | null => {
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, '');
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];

  if (minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// Structured 3-field time entry (Hour, Minute, AM/PM cards) — used by
// club-onboarding.tsx's hours step in place of parseTypedTime's free-text
// box. Same 24h "HH:MM" output as every other time helper here. Returns
// null if the hour/minute fields don't parse to a valid clock time.
export const to24HourFromParts = (hourStr: string, minuteStr: string, meridiem: 'AM' | 'PM'): string | null => {
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  let hour24 = hour % 12;
  if (meridiem === 'PM') hour24 += 12;
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

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
