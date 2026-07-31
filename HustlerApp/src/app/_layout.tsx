import { Stack } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
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

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.background }}>
        <ActivityIndicator color={Theme.eyebrowGreen} />
      </View>
    );
  }

  return (
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
  );
}
