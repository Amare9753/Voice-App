import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { vocabularyFromSeed } from '../domain/vocabulary';
import { openExpoDatabase } from '../storage/expoDb';
import { SessionRepository } from '../storage/repository';
import { theme } from '../ui/theme';

const AppContext = createContext<{ repo: SessionRepository } | null>(null);

export function useApp(): { repo: SessionRepository } {
  const value = useContext(AppContext);
  if (!value) throw new Error('The local notebook is not open yet.');
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<SessionRepository | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const database = await openExpoDatabase();
        const repository = new SessionRepository(database);
        await repository.init();
        await repository.seedVocabulary(vocabularyFromSeed());
        if (!cancelled) setRepo(repository);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not open the local database.');
      }
    })();

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('timers', {
        name: 'Bench timers',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!repo) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.green} />
        <Text style={styles.loading}>Opening the notebook on this device…</Text>
      </View>
    );
  }
  return <AppContext.Provider value={{ repo }}>{children}</AppContext.Provider>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: 24, gap: 16 },
  loading: { fontSize: 18, color: theme.ink, textAlign: 'center' },
  error: { fontSize: 18, color: theme.danger, textAlign: 'center' },
});
