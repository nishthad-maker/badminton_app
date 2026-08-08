import { supabase } from './supabase';

export type MaintenanceBlock = {
  id: string;
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string | null;
};

export async function getClubMaintenanceBlocksForDate(clubId: string, date: string): Promise<MaintenanceBlock[]> {
  const { data } = await supabase
    .from('court_maintenance_blocks')
    .select('id, court_id, date, start_time, end_time, reason, courts(name)')
    .eq('club_id', clubId)
    .eq('date', date)
    .order('start_time', { ascending: true });
  return (data ?? []).map((b: any) => ({
    id: b.id, courtId: b.court_id, courtName: b.courts?.name ?? 'Court',
    date: b.date, startTime: b.start_time, endTime: b.end_time, reason: b.reason,
  }));
}

// The full, club-wide list (not scoped to one date) — used by the Club
// Settings maintenance-block manager, which shows/edits every upcoming
// block rather than just one day at a time.
export async function getClubMaintenanceBlocks(clubId: string): Promise<MaintenanceBlock[]> {
  const { data } = await supabase
    .from('court_maintenance_blocks')
    .select('id, court_id, date, start_time, end_time, reason, courts(name)')
    .eq('club_id', clubId)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });
  return (data ?? []).map((b: any) => ({
    id: b.id, courtId: b.court_id, courtName: b.courts?.name ?? 'Court',
    date: b.date, startTime: b.start_time, endTime: b.end_time, reason: b.reason,
  }));
}

export async function addMaintenanceBlock(opts: {
  clubId: string; courtId: string; date: string; startTime: string; endTime: string; reason: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from('court_maintenance_blocks').insert({
    club_id: opts.clubId, court_id: opts.courtId, date: opts.date,
    start_time: opts.startTime, end_time: opts.endTime, reason: opts.reason || null,
    created_by: session?.user.id ?? null,
  });
  if (error) return { ok: false, message: 'Could not add that block.' };
  return { ok: true };
}

export async function removeMaintenanceBlock(id: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('court_maintenance_blocks').delete().eq('id', id);
  return { ok: !error };
}
