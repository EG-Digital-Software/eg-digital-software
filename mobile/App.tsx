import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider } from './src/context/AuthContext';
import { ScopeProvider } from './src/context/ScopeContext';
import Navigation from './src/navigation';
import { FileViewerProvider } from './src/lib/fileViewer';
import { useAppUpdates } from './src/lib/appUpdates';
import { AppLockProvider } from './src/lib/appLock';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

export default function App() {
  // Pick up over-the-air updates (EAS Update) in installed builds.
  useAppUpdates();
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    JetBrainsMono_500Medium,
  });
  // Fall back to system fonts rather than block the app if a font fails.
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: '#fff' }} />;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ScopeProvider>
            <AppLockProvider>
              <FileViewerProvider>
                <StatusBar style="dark" />
                <Navigation />
              </FileViewerProvider>
            </AppLockProvider>
          </ScopeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
