import { supabase } from './supabase';
import { getClubCourts } from './courts';
import { getBusyCourtIds, findAdjacentFreeCourts, getOccurrenceDates, defaultBulkEndDate } from './courtAvailability';
import { localDateStr } from './scheduling';

export type CourtRental = {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  renterName: string;
  renterEmail: string;
  renterPhone: string | null;
  isPaid: boolean;
  rentalGroupId: string | null;
};

const todayStr = () => localDateStr(new Date());

export async function getRentalsForDate(clubId: string, date: string): Promise<CourtRental[]> {
  const { data } = await supabase
    .from('court_rentals')
    .select('id, court_id, date, start_time, end_time, renter_name, renter_email, renter_phone, is_paid, rental_group_id')
    .eq('club_id', clubId)
    .eq('date', date)
    .order('start_time', { ascending: true });
  return (data ?? []).map((r: any) => ({
    id: r.id, courtId: r.court_id, date: r.date, startTime: r.start_time, endTime: r.end_time,
    renterName: r.renter_name, renterEmail: r.renter_email, renterPhone: r.renter_phone,
    isPaid: r.is_paid, rentalGroupId: r.rental_group_id,
  }));
}

export async function createCourtRental(opts: {
  clubId: string; courtId: string; date: string; startTime: string; endTime: string;
  renterName: string; renterEmail: string; renterPhone: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from('court_rentals').insert({
    club_id: opts.clubId, court_id: opts.courtId, date: opts.date,
    start_time: opts.startTime, end_time: opts.endTime,
    renter_name: opts.renterName.trim(), renter_email: opts.renterEmail.trim(), renter_phone: opts.renterPhone?.trim() || null,
    created_by: session?.user.id ?? null,
  });
  if (error) return { ok: false, message: 'Could not book that.' };
  return { ok: true };
}

type RentalRow = { club_id: string; court_id: string; date: string; start_time: string; end_time: string };

// Inserts every row from one booking action, all sharing a single
// rental_group_id — which is just the first row's own id (no client-side
// UUID generator needed; Postgres already assigns one via
// gen_random_uuid()). A single-row booking (one court, one date) gets no
// group id at all — nothing to group.
async function insertRentalGroup(
  rows: RentalRow[],
  renter: { name: string; email: string; phone: string | null; isPaid: boolean }
): Promise<{ ok: boolean; message?: string }> {
  if (rows.length === 0) return { ok: false, message: 'Nothing to book.' };
  const { data: { session } } = await supabase.auth.getSession();
  const shared = {
    renter_name: renter.name.trim(), renter_email: renter.email.trim(), renter_phone: renter.phone?.trim() || null,
    is_paid: renter.isPaid, created_by: session?.user.id ?? null,
  };

  const [first, ...rest] = rows;
  const { data: firstRow, error: firstError } = await supabase.from('court_rentals').insert({ ...first, ...shared }).select('id').single();
  if (firstError || !firstRow) return { ok: false, message: 'Could not book that.' };

  if (rest.length === 0) return { ok: true };

  const { error: groupError } = await supabase.from('court_rentals').update({ rental_group_id: firstRow.id }).eq('id', firstRow.id);
  if (groupError) return { ok: false, message: 'Could not book that.' };

  const { error: restError } = await supabase.from('court_rentals').insert(rest.map((r) => ({ ...r, ...shared, rental_group_id: firstRow.id })));
  if (restError) {
    // Partial failure — clean up so a broken half-booking doesn't linger.
    await supabase.from('court_rentals').delete().eq('id', firstRow.id);
    return { ok: false, message: 'Could not book that.' };
  }
  return { ok: true };
}

export type BookingRenter = { name: string; email: string; phone: string | null; isPaid: boolean };

// One day, N courts (preferred or auto-adjacent).
export async function createOneDayRental(opts: {
  clubId: string; date: string; startTime: string; endTime: string;
  courtsNeeded: number; preferredCourtIds: string[]; renter: BookingRenter;
}): Promise<{ ok: boolean; message?: string }> {
  if (!opts.renter.name.trim()) return { ok: false, message: "Enter the renter's name." };
  if (!opts.renter.email.trim()) return { ok: false, message: "Enter the renter's email." };
  if (opts.startTime >= opts.endTime) return { ok: false, message: 'Pick a start and end time, with end after start.' };

  const courts = await getClubCourts(opts.clubId);
  const busy = await getBusyCourtIds(opts.clubId, opts.date, opts.startTime, opts.endTime);

  let courtIds: string[];
  if (opts.preferredCourtIds.length > 0) {
    const taken = opts.preferredCourtIds.filter((id) => busy.has(id));
    if (taken.length > 0) {
      const names = taken.map((id) => courts.find((c) => c.id === id)?.name ?? id).join(', ');
      return { ok: false, message: `${names} already booked at that time.` };
    }
    courtIds = opts.preferredCourtIds;
  } else {
    const found = findAdjacentFreeCourts(courts, busy, opts.courtsNeeded);
    if (!found) return { ok: false, message: `Couldn't find ${opts.courtsNeeded} adjacent free courts at that time.` };
    courtIds = found.map((c) => c.id);
  }

  const rows: RentalRow[] = courtIds.map((courtId) => ({
    club_id: opts.clubId, court_id: courtId, date: opts.date, start_time: opts.startTime, end_time: opts.endTime,
  }));
  return insertRentalGroup(rows, opts.renter);
}

// Recurring: one or more days of the week, same time, through an end date
// (defaults to +12 weeks if not given — see defaultBulkEndDate). Each day
// gets its own adjacent-court block, resolved independently since
// availability can differ by weekday. Verified across every occurrence
// date for every requested day BEFORE anything is inserted — a conflict on
// any single date anywhere in the range fails the whole booking.
export async function createBulkRental(opts: {
  clubId: string; daysOfWeek: number[]; startTime: string; endTime: string; endDate: string | null;
  courtsNeeded: number; preferredCourtIds: string[]; renter: BookingRenter;
}): Promise<{ ok: boolean; message?: string }> {
  if (!opts.renter.name.trim()) return { ok: false, message: "Enter the renter's name." };
  if (!opts.renter.email.trim()) return { ok: false, message: "Enter the renter's email." };
  if (opts.startTime >= opts.endTime) return { ok: false, message: 'Pick a start and end time, with end after start.' };
  if (opts.daysOfWeek.length === 0) return { ok: false, message: 'Pick at least one day of the week.' };

  const endDate = opts.endDate ?? defaultBulkEndDate();
  const courts = await getClubCourts(opts.clubId);
  const datesByDay = getOccurrenceDates(opts.daysOfWeek, endDate);

  const rows: RentalRow[] = [];
  for (const dow of opts.daysOfWeek) {
    const dates = datesByDay[dow];
    if (dates.length === 0) continue;

    const busyUnion = new Set<string>();
    for (const date of dates) {
      const busy = await getBusyCourtIds(opts.clubId, date, opts.startTime, opts.endTime);
      busy.forEach((id) => busyUnion.add(id));
    }

    let courtIds: string[];
    if (opts.preferredCourtIds.length > 0) {
      const taken = opts.preferredCourtIds.filter((id) => busyUnion.has(id));
      if (taken.length > 0) {
        const names = taken.map((id) => courts.find((c) => c.id === id)?.name ?? id).join(', ');
        return { ok: false, message: `${names} isn't free on every date in that range.` };
      }
      courtIds = opts.preferredCourtIds;
    } else {
      const found = findAdjacentFreeCourts(courts, busyUnion, opts.courtsNeeded);
      if (!found) return { ok: false, message: `Couldn't find ${opts.courtsNeeded} adjacent courts free on every date this recurs.` };
      courtIds = found.map((c) => c.id);
    }

    for (const date of dates) {
      for (const courtId of courtIds) {
        rows.push({ club_id: opts.clubId, court_id: courtId, date, start_time: opts.startTime, end_time: opts.endTime });
      }
    }
  }

  return insertRentalGroup(rows, opts.renter);
}

export async function setRentalPaid(rentalOrGroupId: string, isPaid: boolean, isGroup: boolean): Promise<{ ok: boolean }> {
  const query = supabase.from('court_rentals').update({ is_paid: isPaid });
  const { error } = isGroup ? await query.eq('rental_group_id', rentalOrGroupId) : await query.eq('id', rentalOrGroupId);
  return { ok: !error };
}

export async function cancelRental(id: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('court_rentals').delete().eq('id', id);
  return { ok: !error };
}

export async function updateRentalTime(id: string, startTime: string, endTime: string): Promise<{ ok: boolean; message?: string }> {
  if (startTime >= endTime) return { ok: false, message: 'Pick a start and end time, with end after start.' };
  const { error } = await supabase.from('court_rentals').update({ start_time: startTime, end_time: endTime }).eq('id', id);
  if (error) return { ok: false, message: 'Could not update that booking.' };
  return { ok: true };
}

// Stops future occurrences of a recurring booking — rows dated today or
// earlier are left alone so already-happened bookings stay as history.
export async function endRentalSeries(rentalGroupId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('court_rentals').delete().eq('rental_group_id', rentalGroupId).gte('date', todayStr());
  return { ok: !error };
}
