import { Stack, router } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { Theme } from '@/constants/theme';

export default function Layout() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    DMSans_400Regular,
    DMSans_400Regular_Italic,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  // Every notify*() call (and the lesson-reminder cron jobs) already sends a
  // `data.screen` payload, but nothing ever read it when the system push
  // notification itself was tapped — tapping just opened the app wherever it
  // was left. useLastNotificationResponse covers both a cold start from a
  // tap and a tap while backgrounded/running. getLastNotificationResponse has
  // no web implementation, so skip the hook there (Platform.OS is constant
  // for the app's lifetime, so this conditional hook call is safe).
  const lastNotificationResponse = Platform.OS === 'web' ? null : Notifications.useLastNotificationResponse();
  useEffect(() => {
    const screen = lastNotificationResponse?.notification.request.content.data?.screen as string | undefined;
    if (screen) router.push(('/' + screen) as any);
  }, [lastNotificationResponse]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.background }}>
        <ActivityIndicator color={Theme.eyebrowGreen} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: Theme.background,
          },
          headerTintColor: Theme.eyebrowGreen,
          headerTitleStyle: {
            fontWeight: 'bold',
            color: Theme.textPrimary,
          },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(coach-tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(club-admin)" options={{ headerShown: false }} />
        <Stack.Screen name="(parent-tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="exercise-list" options={{ headerShown: false }} />
        <Stack.Screen name="exercise" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="community-post" options={{ headerShown: false }} />
        <Stack.Screen name="community-thread" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="create-exercise" options={{ headerShown: false }} />
        <Stack.Screen name="coach-player" options={{ headerShown: false }} />
        <Stack.Screen name="assign-workout" options={{ headerShown: false }} />
        <Stack.Screen name="my-coaches" options={{ headerShown: false }} />
        <Stack.Screen name="notification-center" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
