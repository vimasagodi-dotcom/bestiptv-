import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EulaModal } from '../components/EulaModal';
import { AppProvider } from '../context/AppContext';
import { I18nProvider } from '../i18n';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AppProvider>
          <StatusBar style="light" />
          <EulaModal />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="player" options={{ animation: 'fade', gestureEnabled: false }} />
          </Stack>
        </AppProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
