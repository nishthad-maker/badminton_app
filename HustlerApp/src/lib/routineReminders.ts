import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// expo-notifications' weekly trigger numbers weekdays 1-7 starting at Sunday,
// while the rest of the app (weekly plans, calendar) keys days Monday-first.
const WEEKDAY_NUMBERS: Record<string, number> = {
  sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7,
};

export const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

const ensurePermission = async (): Promise<boolean> => {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
};

// expo-notifications has no local-scheduling implementation on web at all
// (scheduleNotificationAsync/cancelScheduledNotificationAsync throw there) —
// reminders are a native-only capability, so both functions below just no-op
// on web instead of failing the routine save over a missing platform feature.
const supportsLocalScheduling = Platform.OS !== 'web';

// Cancels whatever reminders a routine had previously scheduled — used both
// before rescheduling (so edits don't pile up duplicate reminders) and when
// a routine is deleted outright.
export async function cancelRoutineReminders(notificationIds: string[]) {
  if (!supportsLocalScheduling) return;
  for (const id of notificationIds ?? []) {
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
  }
}

// Schedules one recurring weekly local notification per day, each at that
// day's own time (e.g. Mon 5:00 AM, Tue 6:30 AM). Returns the new
// notification ids (to persist on the routine row) so they can be
// cancelled/replaced the next time the schedule changes.
export async function scheduleRoutineReminders(
  routineId: string,
  routineName: string,
  times: Record<string, string> // day key -> "HH:MM", 24-hour
): Promise<string[]> {
  const days = Object.keys(times);
  if (!days.length || !supportsLocalScheduling) return [];

  const granted = await ensurePermission();
  if (!granted) return [];

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('routine-reminders', {
      name: 'Routine reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1a6b3c',
    });
  }

  const ids: string[] = [];
  for (const day of days) {
    const weekday = WEEKDAY_NUMBERS[day];
    const time = times[day];
    if (!weekday || !time) continue;
    const [hourStr, minuteStr] = time.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) continue;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time for your routine',
        body: `${routineName} is on your schedule now.`,
        data: { screen: 'routines', routineId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
        channelId: 'routine-reminders',
      },
    });
    ids.push(id);
  }
  return ids;
}
