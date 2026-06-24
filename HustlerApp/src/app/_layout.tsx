import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0D0D0D',
        },
        headerTintColor: '#FF6B00',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    />
  );
}