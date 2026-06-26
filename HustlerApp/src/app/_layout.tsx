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
      <Stack.Screen name="categories" options={{ title: 'Workouts' }} />
      <Stack.Screen name="workouts" options={{ title: 'Workouts' }} />
      <Stack.Screen name="exercise" options={{ title: '' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
    </Stack>
  );
}