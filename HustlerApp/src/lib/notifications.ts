import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { formatTime12h, firstName } from './scheduling';

// ── Configure how notifications appear when app is open ──
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Register device for push notifications + save token to Supabase ──
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1a6b3c',
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    // Save token to Supabase so we can send to this device later
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user && token) {
      await supabase.from('push_tokens').upsert({
        user_id: session.user.id,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }

    return token;
  } catch (e) {
    console.log('Error getting push token:', e);
    return null;
  }
}

// ── Send a push notification to a user ──
async function sendPushToUser(userId: string, title: string, body: string, data?: any) {
  try {
    const { data: tokenRow } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId)
      .single();

    if (!tokenRow?.token) return; // user hasn't enabled notifications

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: tokenRow.token,
        title,
        body,
        data: data ?? {},
        sound: 'default',
        priority: 'high',
      }),
    });
  } catch (e) {
    console.log('Push notification error:', e);
  }
}

// ── Generalized in-app bell + per-category preferences ──
// Categories are free-form strings (not a DB enum) — see NOTIFICATION_CATEGORIES
// below for the canonical list shown in notification settings. Absence of a
// notification_preferences row means enabled (opt-out model, not opt-in).
// 'lesson_reminder' (evening-before-lesson) and 'lesson_recap' (post-lesson
// "what did you learn" nudge) are sent server-side by a pg_cron job — see
// send_evening_lesson_reminders() / send_post_lesson_nudges() in
// supabase/migrations/20260731100000_lesson_recap_and_evening_reminder_cron.sql
// — not by a notify*() call below, since neither fires from a live user
// action the way everything else here does.
export const NOTIFICATION_CATEGORIES: { key: string; label: string }[] = [
  { key: 'lesson_reminder', label: 'Lesson reminders' },
  { key: 'lesson_recap', label: 'Lesson recap prompts' },
  { key: 'attendance', label: 'Attendance changes' },
  { key: 'cancellation', label: 'Last-minute cancellations' },
  { key: 'coach_feedback', label: 'Coach feedback' },
  { key: 'waitlist', label: 'Waitlist updates' },
  { key: 'makeup', label: 'Makeup credits available' },
  { key: 'tournament', label: 'Tournament approvals' },
  { key: 'club', label: 'Club & join requests' },
  { key: 'schedule_request', label: 'Schedule requests' },
  { key: 'payment', label: 'Payments' },
  { key: 'message', label: 'Messages' },
  { key: 'workout', label: 'Workouts & plans' },
];

export async function isCategoryEnabled(userId: string, category: string): Promise<boolean> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('enabled')
    .eq('user_id', userId)
    .eq('category', category)
    .maybeSingle();
  return data ? data.enabled : true;
}

export async function getNotificationPreferences(userId: string): Promise<Record<string, boolean>> {
  const { data } = await supabase.from('notification_preferences').select('category, enabled').eq('user_id', userId);
  const map: Record<string, boolean> = {};
  (data ?? []).forEach((r: any) => { map[r.category] = r.enabled; });
  return map;
}

export async function setNotificationPreference(userId: string, category: string, enabled: boolean): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('notification_preferences').upsert(
    { user_id: userId, category, enabled, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,category' }
  );
  return { ok: !error };
}

export type AppNotification = {
  id: string; type: string; category: string | null; title: string | null; body: string | null;
  screen: string | null; seen: boolean; created_at: string;
};

export async function getMyNotifications(userId: string): Promise<AppNotification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, type, category, title, body, screen, seen, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function markAllNotificationsSeen(userId: string): Promise<void> {
  await supabase.from('notifications').update({ seen: true }).eq('user_id', userId).eq('seen', false);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('seen', false);
  return count ?? 0;
}

// Every notify*() below routes through this — checks the user's category
// preference, writes a bell row (title/body so the generic bell screen never
// needs per-type branching), and sends the push. Pre-existing direct
// `supabase.from('notifications').insert(...)` call sites elsewhere in the
// app (payments.tsx, coach-player.tsx, coach-section.tsx) are untouched —
// they predate this and still work for their own narrow screens.
async function notify(opts: {
  userId: string; category: string; title: string; body: string; screen?: string; data?: any; fromUserId?: string;
}) {
  const enabled = await isCategoryEnabled(opts.userId, opts.category);
  if (!enabled) return;
  await supabase.from('notifications').insert({
    user_id: opts.userId,
    type: opts.category,
    category: opts.category,
    title: opts.title,
    body: opts.body,
    screen: opts.screen ?? null,
    from_user_id: opts.fromUserId ?? null,
  });
  await sendPushToUser(opts.userId, opts.title, opts.body, opts.data ?? { screen: opts.screen });
}

// ── Notification triggers ──

// Coach assigned a workout to a player
export async function notifyWorkoutAssigned(playerId: string, coachName: string, workoutTitle: string) {
  await notify({ userId: playerId, category: 'workout', title: '💪 New Workout from Your Coach', body: `${coachName} assigned you: ${workoutTitle}`, screen: 'coach-section' });
}

// Coach sent a message / feedback
export async function notifyCoachMessage(playerId: string, coachName: string, message: string) {
  await notify({ userId: playerId, category: 'message', title: `💬 Message from ${coachName}`, body: message.length > 60 ? message.slice(0, 60) + '...' : message, screen: 'coach-section' });
}

// Player sent a message to coach
export async function notifyPlayerMessage(coachId: string, playerName: string, message: string) {
  await notify({ userId: coachId, category: 'message', title: `💬 ${firstName(playerName)} sent a message`, body: message.length > 60 ? message.slice(0, 60) + '...' : message, screen: 'coach-player' });
}

// Player completed an assigned workout
export async function notifyWorkoutCompleted(coachId: string, playerName: string, workoutTitle: string) {
  await notify({ userId: coachId, category: 'workout', title: `✅ ${firstName(playerName)} completed a workout`, body: `They finished: ${workoutTitle}`, screen: 'coach-player' });
}

// Player uploaded proof
export async function notifyProofUploaded(coachId: string, playerName: string, workoutTitle: string) {
  await notify({ userId: coachId, category: 'workout', title: `📸 ${firstName(playerName)} uploaded proof`, body: `Proof submitted for: ${workoutTitle}`, screen: 'coach-player' });
}

// Coach accepted a player connection
export async function notifyConnectionAccepted(playerId: string, coachName: string) {
  await notify({ userId: playerId, category: 'club', title: '🏸 Coach Connected!', body: `${coachName} accepted your request. You're now connected!`, screen: 'my-coaches' });
}

// Player sent a connection request to coach
export async function notifyConnectionRequest(coachId: string, playerName: string) {
  await notify({ userId: coachId, category: 'club', title: '🤝 New Connection Request', body: `${firstName(playerName)} wants to connect with you`, screen: '(coach-tabs)/players' });
}

// Coach sent a weekly plan
export async function notifyWeeklyPlan(playerId: string, coachName: string) {
  await notify({ userId: playerId, category: 'workout', title: '📅 New Weekly Training Plan', body: `${coachName} sent you a training plan for this week`, screen: 'coach-section' });
}

// Player shared a match/opponent scouting log
export async function notifyMatchShared(coachId: string, playerName: string, opponentName: string) {
  await notify({ userId: coachId, category: 'message', title: `🏸 ${firstName(playerName)} shared a match report`, body: `New scouting notes vs ${opponentName}`, screen: 'coach-player' });
}

// Player shared a journal entry
export async function notifyJournalShared(coachId: string, playerName: string) {
  await notify({ userId: coachId, category: 'message', title: `📓 ${firstName(playerName)} shared a journal entry`, body: "Tap to see how they're feeling", screen: 'coach-player' });
}

// Coach added a note visible to the player
export async function notifySharedNoteAdded(playerId: string, coachName: string) {
  await notify({ userId: playerId, category: 'message', title: `📝 Note from ${coachName}`, body: 'Your coach left you a note', screen: 'coach-section' });
}

// Club admin approved a player's membership payment
export async function notifyPaymentApproved(playerId: string, clubName: string) {
  // Sent to the player, not the admin — (club-admin) is the owner-only route
  // group and would 404/redirect for a player. Their club membership status
  // (payment, waitlist) lives on the Calendar tab via getPlayerClubMembership.
  await notify({ userId: playerId, category: 'payment', title: '✅ Payment Approved', body: `${clubName} confirmed your membership payment`, screen: '(tabs)/calendar' });
}

// Club admin promoted a player off the waitlist into a lesson
export async function notifyWaitlistPromoted(playerId: string, className: string) {
  await notify({ userId: playerId, category: 'waitlist', title: "🎉 You're off the waitlist!", body: `A spot opened up in ${className}`, screen: '(tabs)/calendar' });
}

// Club admin rejected a self-reported payment
export async function notifyPaymentRejected(playerId: string, label: string) {
  await notify({ userId: playerId, category: 'payment', title: '⚠️ Payment Not Confirmed', body: `Payment not confirmed for ${label} — please resubmit payment.`, screen: '(tabs)/calendar' });
}

// A parent redeemed a link code — the child must explicitly accept before it's active
export async function notifyParentLinkRequest(playerId: string, parentName: string) {
  await notify({ userId: playerId, category: 'club', title: '👪 Parent Link Request', body: `${parentName} wants to link to your account — accept from your profile.`, screen: '(tabs)/profile' });
}

// The child accepted a pending parent-link request
export async function notifyParentLinkAccepted(parentId: string, playerName: string) {
  await notify({ userId: parentId, category: 'club', title: '✅ Link Accepted', body: `${firstName(playerName)} accepted your link request.`, screen: '(parent-tabs)/home' });
}

// Club approved a parent's schedule request — a private lesson was created
export async function notifyScheduleRequestApproved(parentId: string, childName: string, label: string) {
  await notify({ userId: parentId, category: 'schedule_request', title: '✅ Lesson Request Approved', body: `${firstName(childName)}'s request for ${label} was approved and added to their schedule.`, screen: '(parent-tabs)/home' });
}

// Club rejected a parent's schedule request
export async function notifyScheduleRequestRejected(parentId: string, childName: string, label: string) {
  await notify({ userId: parentId, category: 'schedule_request', title: '⚠️ Lesson Request Declined', body: `${firstName(childName)}'s request for ${label} wasn't approved this time.`, screen: '(parent-tabs)/home' });
}

// Club approved a player's code-based join request
export async function notifyClubJoinApproved(playerId: string, clubName: string) {
  await notify({ userId: playerId, category: 'club', title: '✅ Club Request Approved', body: `You're in! ${clubName} approved your request to join.`, screen: '(tabs)/workouts' });
}

// Club rejected a player's code-based join request
export async function notifyClubJoinRejected(playerId: string, clubName: string) {
  await notify({ userId: playerId, category: 'club', title: '⚠️ Club Request Declined', body: `${clubName} didn't approve your request to join this time.`, screen: '(tabs)/workouts' });
}

// A lesson is starting soon — called by whatever schedules reminders for the player/parent.
export async function notifyLessonReminder(userId: string, label: string, whenText: string) {
  await notify({ userId, category: 'lesson_reminder', title: '⏰ Upcoming Lesson', body: `${label} ${whenText}`, screen: '(tabs)/calendar' });
}

// A player/parent toggled attendance for a lesson — alerts the coach.
export async function notifyAttendanceChanged(coachId: string, playerName: string, label: string, attending: boolean) {
  await notify({
    userId: coachId, category: 'attendance',
    title: attending ? `✅ ${firstName(playerName)} is attending` : `⚠️ ${firstName(playerName)} marked not attending`,
    body: label, screen: '(club-admin)/club-calendar',
  });
}

// A cancellation happened after the club's cutoff window — alerts the coach/club.
export async function notifyPostCutoffCancellation(coachId: string, playerName: string, label: string) {
  await notify({ userId: coachId, category: 'cancellation', title: `🚨 Late cancellation: ${firstName(playerName)}`, body: `${label} — this is past the cancellation cutoff.`, screen: '(club-admin)/club-calendar' });
}

// A makeup credit became available for a player.
export async function notifyMakeupAvailable(playerId: string, label: string) {
  await notify({ userId: playerId, category: 'makeup', title: '🔁 Makeup Credit Available', body: `You have a makeup credit for ${label}.`, screen: '(tabs)/calendar' });
}

// A player/parent's tournament block was approved (auto-excludes group lessons that week).
export async function notifyTournamentApproved(userId: string, startDate: string, endDate: string) {
  await notify({ userId, category: 'tournament', title: '🏆 Tournament Block Approved', body: `${startDate} – ${endDate} is now marked as a tournament block.`, screen: '(tabs)/profile' });
}

// A player submitted a requested makeup slot — needs the coach's approval
// before it's confirmed (mirrors the schedule-request / club-join-request
// pattern already used elsewhere, rather than letting a player self-book).
export async function notifyMakeupSlotRequested(coachId: string, playerName: string, label: string, date: string, startTime: string) {
  await notify({
    userId: coachId, category: 'makeup',
    title: `🔁 ${firstName(playerName)} requested a makeup time`,
    body: `${label} — ${date} at ${formatTime12h(startTime)}. Review it on the Makeups tab.`,
    screen: '(club-admin)/tiers',
  });
}

// The coach approved the player's requested makeup slot.
export async function notifyMakeupSlotApproved(playerId: string, label: string, date: string, startTime: string) {
  await notify({
    userId: playerId, category: 'makeup',
    title: '✅ Makeup Time Confirmed',
    body: `${label} is now scheduled for ${date} at ${formatTime12h(startTime)}.`,
    screen: '(tabs)/calendar',
  });
}

// The coach declined the player's requested makeup slot — back to 'owed' so
// they can pick another one.
export async function notifyMakeupSlotDeclined(playerId: string, label: string) {
  await notify({
    userId: playerId, category: 'makeup',
    title: '⚠️ Makeup Time Not Approved',
    body: `Your requested time for ${label} didn't work — pick another slot on your Calendar.`,
    screen: '(tabs)/calendar',
  });
}

// The club/coach picked a slot and sent it to the player — mirror of
// notifyMakeupSlotRequested, opposite direction: here the player is the one
// who still needs to act (confirm or decline it).
export async function notifyMakeupSlotProposed(playerId: string, label: string, date: string, startTime: string) {
  await notify({
    userId: playerId, category: 'makeup',
    title: '🔁 Your Coach Suggested a Makeup Time',
    body: `${label} — ${date} at ${formatTime12h(startTime)}. Confirm it on your Calendar.`,
    screen: '(tabs)/calendar',
  });
}

// The player confirmed a coach-proposed slot — it's booked now.
export async function notifyMakeupSlotConfirmedByPlayer(coachId: string, playerName: string, label: string, date: string, startTime: string) {
  await notify({
    userId: coachId, category: 'makeup',
    title: `✅ ${firstName(playerName)} confirmed the makeup time`,
    body: `${label} — ${date} at ${formatTime12h(startTime)} is booked.`,
    screen: '(club-admin)/tiers',
  });
}

// The player couldn't make the coach-proposed slot — back to 'owed'.
export async function notifyMakeupSlotDeclinedByPlayer(coachId: string, playerName: string, label: string) {
  await notify({
    userId: coachId, category: 'makeup',
    title: `⚠️ ${firstName(playerName)} couldn't make the suggested time`,
    body: `${label} needs another makeup slot suggested.`,
    screen: '(club-admin)/tiers',
  });
}

// A staff coach flagged they can't make a specific date of their own lesson —
// needs the owner's approval before it actually cancels.
export async function notifyCancellationRequested(ownerId: string, coachName: string, label: string, date: string) {
  await notify({
    userId: ownerId, category: 'cancellation',
    title: `🚫 ${firstName(coachName)} requested a cancellation`,
    body: `${label} on ${date}. Review it on the Calendar.`,
    screen: '(club-admin)/club-calendar',
  });
}

export async function notifyCancellationApproved(coachId: string, label: string, date: string) {
  await notify({
    userId: coachId, category: 'cancellation',
    title: '✅ Cancellation Approved',
    body: `${label} on ${date} is cancelled.`,
    screen: '(coach-tabs)/schedule',
  });
}

export async function notifyCancellationDeclined(coachId: string, label: string, date: string) {
  await notify({
    userId: coachId, category: 'cancellation',
    title: '⚠️ Cancellation Not Approved',
    body: `${label} on ${date} is still on — check with your club if you're not sure why.`,
    screen: '(coach-tabs)/schedule',
  });
}
