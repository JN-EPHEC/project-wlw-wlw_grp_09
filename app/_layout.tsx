import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="verify-email" options={{ title: 'Vérifie ton email' }} />
        <Stack.Screen name="account-activated" options={{ headerShown: false }} />
        <Stack.Screen name="account-complete" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="ride/[id]"
          options={{ presentation: 'modal', title: 'Trajet CampusRide', headerShown: false }}
        />
        <Stack.Screen
          name="review/[rideId]"
          options={{ presentation: 'modal', title: 'Laisser un avis' }}
        />
        <Stack.Screen
          name="reviews/[email]"
          options={{ title: 'Avis du conducteur' }}
        />
        <Stack.Screen
          name="wallet"
          options={{ title: 'Mon wallet' }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" translucent backgroundColor="transparent" />
    </ThemeProvider>
  );
}
