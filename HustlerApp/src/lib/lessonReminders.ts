import { notifyLessonReminder } from './notifications';
import { formatTime12h, localDateStr } from './scheduling';

// Best-effort, client-triggered "soft" reminder — fires when a player's or
// parent's own screen happens to load within 2 hours of an upcoming lesson.
// This is NOT a true scheduled push (that needs server-side cron/edge-function
// infra this project doesn't have) — it only fires on app open/focus, so a
// player who never opens the app before the lesson never gets one. Dedupes
// per lesson+day for the lifetime of the app session so refocusing the
// screen doesn't re-notify every time.
const remindedThisSession = new Set<string>();

export async function maybeRemindUpcoming(
  notifyUserId: string,
  lessons: { id: string; day_of_week: number; start_time: string; label: string }[]
) {
  const now = new Date();
  const todayStr = localDateStr(now);
  for (const l of lessons) {
    if (l.day_of_week !== now.getDay()) continue;
    const [h, m] = l.start_time.split(':').map(Number);
    const lessonTs = new Date(now);
    lessonTs.setHours(h, m, 0, 0);
    const diffMin = (lessonTs.getTime() - now.getTime()) / 60000;
    const key = `${l.id}_${todayStr}`;
    if (diffMin > 0 && diffMin <= 120 && !remindedThisSession.has(key)) {
      remindedThisSession.add(key);
      const whenText = diffMin <= 60 ? `in ${Math.round(diffMin)} min` : `at ${formatTime12h(l.start_time)}`;
      await notifyLessonReminder(notifyUserId, l.label, whenText);
    }
  }
}
