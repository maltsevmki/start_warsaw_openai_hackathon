import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { ClearCartThemeProvider, useClearCartTheme } from '@/providers/theme-provider';

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ClearCartThemeProvider>
        <RootNavigator />
      </ClearCartThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { colors, isDark } = useClearCartTheme();
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}
