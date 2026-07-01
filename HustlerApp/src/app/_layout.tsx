import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.backgroundTop,
        },
        headerTintColor: Colors.accent,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="exercise-list" options={{ headerShown: false }} />
      <Stack.Screen name="exercise" options={{ title: '' }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="community-post" options={{ headerShown: false }} />
      <Stack.Screen name="community-thread" options={{ headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
    </Stack>
  );
}
