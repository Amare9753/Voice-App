import { Buffer } from 'buffer';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../services/provider';
import { theme } from '../ui/theme';

const globalScope = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (!globalScope.Buffer) globalScope.Buffer = Buffer;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
      </AppProvider>
    </SafeAreaProvider>
  );
}
