import { supabase } from './supabase';

export type SessionLogRow = { id: string; category: string; created_at: string; exercise_name: string; log_data: Record<string, any> | null };

// One fetch, several derived views — mirrors (tabs)/index.tsx's own Overview
// card (kept as a separate parallel implementation rather than importing
// from there, to avoid touching the player's own home screen for this), so
// the parent dashboard's Progress card can look the same without a second
// round-trip per view.
export async function getChildSessionLogs(playerId: string): Promise<SessionLogRow[]> {
  const { data } = await supabase
    .from('session_logs')
    .select('id, category, created_at, exercise_name, log_data')
    .eq('user_id', playerId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export type PersonalBest = { name: string; category: string; log: Record<string, any> };

const BEST_METRIC_PRIORITY = ['weight', 'height', 'distance', 'time', 'reps', 'duration'];

// Picks the single best-performing logged session per exercise (not an
// independently-maxed Frankenstein of fields), then shows that whole session
// as logged.
export function computePersonalBests(logs: SessionLogRow[]): PersonalBest[] {
  const bestMap: Record<string, PersonalBest & { value: number }> = {};
  logs.forEach((s) => {
    const ld = s.log_data;
    if (!ld) return;
    const key = s.exercise_name;
    const metric = BEST_METRIC_PRIORITY.find((m) => (parseFloat(ld[m]) || 0) > 0);
    if (!metric) return;
    const value = parseFloat(ld[metric]) || 0;
    const existing = bestMap[key];
    if (!existing || value > existing.value) {
      bestMap[key] = { name: key, category: s.category, log: ld, value };
    }
  });
  return Object.values(bestMap).slice(0, 10).map(({ value, ...rest }) => rest);
}

export const ACTIVITY_RANGES: { key: string; label: string; rangeLabel: string; days: number; granularity: 'day' | 'week' }[] = [
  { key: '10d', label: '10D', rangeLabel: 'LAST 10 DAYS', days: 10, granularity: 'day' },
  { key: '2w', label: '2W', rangeLabel: 'LAST 2 WEEKS', days: 14, granularity: 'day' },
  { key: '4w', label: '4W', rangeLabel: 'LAST 4 WEEKS', days: 28, granularity: 'week' },
  { key: '8w', label: '8W', rangeLabel: 'LAST 8 WEEKS', days: 56, granularity: 'week' },
];

export type ActivityBucket = { count: number; label: string; isCurrent: boolean };

export function computeActivityBuckets(logs: SessionLogRow[], range: (typeof ACTIVITY_RANGES)[number]): ActivityBucket[] {
  const countInRange = (start: Date, end: Date) =>
    new Set(
      logs
        .filter((s) => { const d = new Date(s.created_at); return d >= start && d < end; })
        .map((s) => new Date(s.created_at).toDateString())
    ).size;

  if (range.granularity === 'day') {
    const buckets: ActivityBucket[] = [];
    for (let d = range.days - 1; d >= 0; d--) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - d);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      buckets.push({
        count: countInRange(dayStart, dayEnd),
        label: d === 0 ? 'Now' : dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
        isCurrent: d === 0,
      });
    }
    return buckets;
  }

  const weeks = Math.ceil(range.days / 7);
  const buckets: ActivityBucket[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const wStart = new Date();
    wStart.setDate(wStart.getDate() - w * 7 - ((wStart.getDay() + 6) % 7));
    wStart.setHours(0, 0, 0, 0);
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 7);
    buckets.push({
      count: countInRange(wStart, wEnd),
      label: w === 0 ? 'Now' : `W${weeks - w}`,
      isCurrent: w === 0,
    });
  }
  return buckets;
}

export type CategoryCounts = { strength: number; footwork: number; endurance: number; recovery: number };

const countUniqueSessions = (logs: SessionLogRow[]) =>
  new Set(logs.map((s) => `${new Date(s.created_at).toDateString()}_${s.category}`)).size;

export function computeCategoryCounts(logs: SessionLogRow[]): CategoryCounts {
  return {
    strength: countUniqueSessions(logs.filter((s) => s.category === 'strength')),
    footwork: countUniqueSessions(logs.filter((s) => s.category === 'footwork')),
    endurance: countUniqueSessions(logs.filter((s) => s.category === 'endurance')),
    recovery: countUniqueSessions(logs.filter((s) => s.category === 'recovery')),
  };
}

export function computeTotalSessions(logs: SessionLogRow[]): number {
  return countUniqueSessions(logs);
}
