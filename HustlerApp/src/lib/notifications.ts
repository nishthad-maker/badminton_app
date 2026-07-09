import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

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

// ── Notification triggers ──

// Coach assigned a workout to a player
export async function notifyWorkoutAssigned(playerId: string, coachName: string, workoutTitle: string) {
  await sendPushToUser(
    playerId,
    '💪 New Workout from Your Coach',
    `${coachName} assigned you: ${workoutTitle}`,
    { screen: 'coach-section', tab: 'workouts' }
  );
}

// Coach sent a message / feedback
export async function notifyCoachMessage(playerId: string, coachName: string, message: string) {
  await sendPushToUser(
    playerId,
    `💬 Message from ${coachName}`,
    message.length > 60 ? message.slice(0, 60) + '...' : message,
    { screen: 'coach-section', tab: 'workouts' }
  );
}

// Player sent a message to coach
export async function notifyPlayerMessage(coachId: string, playerName: string, message: string) {
  await sendPushToUser(
    coachId,
    `💬 ${playerName} sent a message`,
    message.length > 60 ? message.slice(0, 60) + '...' : message,
    { screen: 'coach-player' }
  );
}

// Player completed an assigned workout
export async function notifyWorkoutCompleted(coachId: string, playerName: string, workoutTitle: string) {
  await sendPushToUser(
    coachId,
    `✅ ${playerName} completed a workout`,
    `They finished: ${workoutTitle}`,
    { screen: 'coach-player' }
  );
}

// Player uploaded proof
export async function notifyProofUploaded(coachId: string, playerName: string, workoutTitle: string) {
  await sendPushToUser(
    coachId,
    `📸 ${playerName} uploaded proof`,
    `Proof submitted for: ${workoutTitle}`,
    { screen: 'coach-player' }
  );
}

// Coach accepted a player connection
export async function notifyConnectionAccepted(playerId: string, coachName: string) {
  await sendPushToUser(
    playerId,
    '🏸 Coach Connected!',
    `${coachName} accepted your request. You're now connected!`,
    { screen: 'my-coaches' }
  );
}

// Player sent a connection request to coach
export async function notifyConnectionRequest(coachId: string, playerName: string) {
  await sendPushToUser(
    coachId,
    '🤝 New Connection Request',
    `${playerName} wants to connect with you`,
    { screen: 'coach' }
  );
}

// Coach sent a weekly plan
export async function notifyWeeklyPlan(playerId: string, coachName: string) {
  await sendPushToUser(
    playerId,
    '📅 New Weekly Training Plan',
    `${coachName} sent you a training plan for this week`,
    { screen: 'coach-section', tab: 'plans' }
  );
}

// Player asked a question
export async function notifyPlayerQuestion(coachId: string, playerName: string, question: string) {
  await sendPushToUser(
    coachId,
    `❓ ${playerName} has a question`,
    question.length > 60 ? question.slice(0, 60) + '...' : question,
    { screen: 'coach-player' }
  );
}