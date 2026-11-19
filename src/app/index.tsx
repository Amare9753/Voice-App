import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createId } from '../domain/ids';
import { createEmptySession } from '../domain/session';
import type { SessionSummary } from '../domain/types';
import { useApp } from '../services/provider';
import { Banner, BigButton, Screen } from '../ui/components';
import { theme } from '../ui/theme';

export default function HomeScreen() {
  const { repo } = useApp();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const reload = useCallback(() => {
    let active = true;
    void repo.listSessions().then((rows) => {
      if (active) setSessions(rows);
    });
    return () => {
      active = false;
    };
  }, [repo]);

  useFocusEffect(reload);

  async function startCapture() {
    const record = createEmptySession({
      id: createId(),
      title: 'Bench note',
      now: new Date().toISOString(),
    });
    await repo.saveSession(record);
    router.push(`/capture/${record.id}`);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>On this device only</Text>
        <Text style={styles.title}>Core Capture</Text>
        <Text style={styles.lead}>
          Dictate an experiment at the bench. You stay the author: suggestions wait until you accept them, and every line keeps its source utterance.
        </Text>
        <BigButton label="New capture" onPress={() => void startCapture()} />
        <View style={styles.row}>
          <View style={styles.half}>
            <BigButton label="Vocabulary" color={theme.ink} onPress={() => router.push('/vocabulary')} />
          </View>
          <View style={styles.half}>
            <BigButton label="Speech model" color={theme.ink} onPress={() => router.push('/model')} />
          </View>
        </View>
        <Text style={styles.section}>Sessions</Text>
        {sessions.length === 0 ? <Banner text="No sessions yet. Start a capture when you are at the bench." /> : null}
        {sessions.map((session) => (
          <Pressable
            key={session.id}
            accessibilityRole="button"
            onPress={() => router.push(`/capture/${session.id}`)}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>{session.title}</Text>
            <Text style={styles.cardMeta}>
              {session.status === 'signed' ? 'Signed' : 'Draft'} · {session.utteranceCount} notes · {session.updatedAt}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  kicker: { color: theme.green, fontSize: 16, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: theme.ink, fontSize: 40, fontWeight: '800' },
  lead: { color: theme.ink, fontSize: 18, lineHeight: 26 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  section: { fontSize: 22, fontWeight: '800', color: theme.ink, marginTop: 8 },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 2, borderColor: theme.line, minHeight: 72 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: theme.ink },
  cardMeta: { fontSize: 15, color: theme.muted, marginTop: 4 },
});
