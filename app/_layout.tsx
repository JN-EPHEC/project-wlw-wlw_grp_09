import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/hooks/use-color-scheme';
import NotificationCenter from '@/components/notification-center';
import { LanguageProvider } from '@/hooks/use-language';
import { DocumentStoreProvider } from '@/hooks/use-document-store';

if (__DEV__ && typeof window !== 'undefined' && !((window as any).__openStackFrameFetchPatched)) {
  (window as any).__openStackFrameFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const requestTarget =
      typeof args[0] === 'string' ? args[0] : typeof args[0] === 'object' ? args[0]?.url : undefined;
    const host = window.location?.host ?? '';
    const shouldSkip =
      typeof requestTarget === 'string' &&
      requestTarget.includes('/open-stack-frame') &&
      !host.includes('localhost') &&
      !host.includes('127.0.0.1');

    if (shouldSkip) {
      if (typeof window.Response === 'function') {
        return Promise.resolve(new window.Response(null, { status: 200 }));
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    }

    return originalFetch(...args);
  };
}

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
        <DocumentStoreProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <NotificationCenter />
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
                name="ride/request-confirmation"
                options={{ title: 'Demande envoyée', presentation: 'modal', headerShown: false }}
              />
              <Stack.Screen name="requests" options={{ headerShown: false }} />
              <Stack.Screen name="trips" options={{ headerShown: false }} />
              <Stack.Screen
                name="review/[rideId]"
                options={{ presentation: 'modal', title: 'Laisser un avis' }}
              />
              <Stack.Screen
                name="reviews/[email]"
                options={{ title: 'Avis du conducteur' }}
              />
              <Stack.Screen
                name="notifications"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="wallet"
                options={{ title: 'Mon wallet' }}
              />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <StatusBar style="light" translucent backgroundColor="transparent" />
          </ThemeProvider>
        </DocumentStoreProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
