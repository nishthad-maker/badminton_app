import { supabase } from './supabase';

export type TagSource = 'player' | 'parent' | 'coach';
export type TagCount = { tag: string; count: number; bySource: Record<TagSource, number> };

const emptySourceCounts = (): Record<TagSource, number> => ({ player: 0, parent: 0, coach: 0 });

const tally = (map: Map<string, TagCount>, tags: string[] | null | undefined, source: TagSource) => {
  (tags ?? []).forEach((tag) => {
    const entry = map.get(tag) ?? { tag, count: 0, bySource: emptySourceCounts() };
    entry.count += 1;
    entry.bySource[source] += 1;
    map.set(tag, entry);
  });
};

const toSortedList = (map: Map<string, TagCount>) =>
  Array.from(map.values()).sort((a, b) => b.count - a.count);

// Combines every strengths/weaknesses tag ever attached to this player —
// their own match logs, any a linked parent logged, and any a coach tagged
// on a shared note — into one ranked tally per side. Callers rely on RLS to
// scope what actually comes back: a player sees everything about themselves;
// a parent only sees opponent_logs shared with a coach or that they
// authored, plus coach_shared_notes (both already established policies).
export async function getStrengthWeaknessSummary(playerId: string): Promise<{ strengths: TagCount[]; weaknesses: TagCount[] }> {
  const [{ data: logs }, { data: notes }] = await Promise.all([
    supabase.from('opponent_logs').select('strengths_tags, weaknesses_tags, logged_by_parent_id').eq('player_id', playerId),
    supabase.from('coach_shared_notes').select('strengths_tags, weaknesses_tags').eq('player_id', playerId),
  ]);

  const strengths = new Map<string, TagCount>();
  const weaknesses = new Map<string, TagCount>();

  (logs ?? []).forEach((row: any) => {
    const source: TagSource = row.logged_by_parent_id ? 'parent' : 'player';
    tally(strengths, row.strengths_tags, source);
    tally(weaknesses, row.weaknesses_tags, source);
  });

  (notes ?? []).forEach((row: any) => {
    tally(strengths, row.strengths_tags, 'coach');
    tally(weaknesses, row.weaknesses_tags, 'coach');
  });

  return { strengths: toSortedList(strengths), weaknesses: toSortedList(weaknesses) };
}
