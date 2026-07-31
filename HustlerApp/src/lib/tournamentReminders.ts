import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// How many days before the registration deadline the reminder fires, and
// what time of day it fires at.
const DAYS_BEFORE = 3;
const REMINDER_HOUR = 9;

// expo-notifications has no local-scheduling implementation on web at all —
// same platform limitation already handled in routineReminders.ts.
const supportsLocalScheduling = Platform.OS !== 'web';

const ensurePermission = async (): Promise<boolean> => {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
};

export async function cancelTournamentReminder(notificationId: string | null | undefined) {
  if (!supportsLocalScheduling || !notificationId) return;
  try { await Notifications.cancelScheduledNotificationAsync(notificationId); } catch {}
}

// Schedules a one-time local reminder a few days before a tournament's
// registration deadline. Returns the new notification id (to persist on the
// calendar_events row) so it can be cancelled/rescheduled if the deadline
// changes or the event is deleted. Returns null if there's no deadline, the
// reminder moment has already passed, or scheduling isn't supported here.
export async function scheduleTournamentReminder(
  eventId: string,
  tournamentName: string,
  registrationDeadline: string | null // "YYYY-MM-DD"
): Promise<string | null> {
  if (!registrationDeadline || !supportsLocalScheduling) return null;

  const granted = await ensurePermission();
  if (!granted) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('tournament-reminders', {
      name: 'Tournament reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E74C3C',
    });
  }

  const deadline = new Date(`${registrationDeadline}T00:00:00`);
  const reminderDate = new Date(deadline);
  reminderDate.setDate(reminderDate.getDate() - DAYS_BEFORE);
  reminderDate.setHours(REMINDER_HOUR, 0, 0, 0);

  if (reminderDate.getTime() <= Date.now()) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '🏆 Registration closing soon',
      body: `Registration for ${tournamentName} closes in ${DAYS_BEFORE} days.`,
      data: { screen: 'calendar', eventId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
      channelId: 'tournament-reminders',
    },
  });
  return id;
}
