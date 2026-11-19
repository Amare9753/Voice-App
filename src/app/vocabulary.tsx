import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createId } from '../domain/ids';
import type { VocabularyEntry, VocabularyKind } from '../domain/types';
import { addVocabularyEntry, removeVocabularyEntry } from '../domain/vocabulary';
import { useApp } from '../services/provider';
import { BigButton, Screen } from '../ui/components';
import { theme } from '../ui/theme';

const KINDS: VocabularyKind[] = ['chemical', 'term', 'unit', 'alias'];

export default function VocabularyScreen() {
  const { repo } = useApp();
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [spoken, setSpoken] = useState('');
  const [canonical, setCanonical] = useState('');
  const [kind, setKind] = useState<VocabularyKind>('term');

  useEffect(() => {
    void repo.listVocabulary().then(setEntries);
  }, [repo]);

  async function save(next: VocabularyEntry[]) {
    setEntries(next);
    await repo.replaceVocabulary(next);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <BigButton label="Back" color={theme.ink} onPress={() => router.back()} />
        <Text style={styles.title}>Lab vocabulary</Text>
        <Text style={styles.lead}>
          These words bias on-device recognition and suggest spellings after transcription. Nothing here changes a record until you accept it on the review screen.
        </Text>
        <TextInput style={styles.input} value={spoken} onChangeText={setSpoken} placeholder="Spoken form, e.g. etoh" placeholderTextColor={theme.muted} />
        <TextInput style={styles.input} value={canonical} onChangeText={setCanonical} placeholder="Canonical form, e.g. ethanol" placeholderTextColor={theme.muted} />
        <View style={styles.kinds}>
          {KINDS.map((item) => (
            <Pressable key={item} onPress={() => setKind(item)} style={[styles.kind, kind === item && styles.kindOn]}>
              <Text style={[styles.kindText, kind === item && styles.kindTextOn]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <BigButton
          label="Add term"
          disabled={!spoken.trim() || !canonical.trim()}
          onPress={() => {
            const next = addVocabularyEntry(entries, {
              id: createId(),
              spoken: spoken.trim(),
              canonical: canonical.trim(),
              kind,
            });
            setSpoken('');
            setCanonical('');
            void save(next);
          }}
        />
        {entries.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <Text style={styles.term}>
              {entry.spoken} → {entry.canonical}
            </Text>
            <Text style={styles.meta}>{entry.kind}</Text>
            <BigButton label="Remove" color={theme.danger} onPress={() => void save(removeVocabularyEntry(entries, entry.id))} />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  title: { fontSize: 32, fontWeight: '800', color: theme.ink },
  lead: { fontSize: 18, lineHeight: 26, color: theme.ink },
  input: {
    minHeight: 64,
    borderWidth: 2,
    borderColor: theme.line,
    borderRadius: 14,
    backgroundColor: theme.card,
    paddingHorizontal: 14,
    fontSize: 20,
    color: theme.ink,
  },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderColor: theme.line, justifyContent: 'center' },
  kindOn: { backgroundColor: theme.ink, borderColor: theme.ink },
  kindText: { fontSize: 16, fontWeight: '700', color: theme.ink },
  kindTextOn: { color: '#fff' },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 14, gap: 8, borderWidth: 2, borderColor: theme.line },
  term: { fontSize: 18, fontWeight: '700', color: theme.ink },
  meta: { color: theme.muted, fontSize: 15 },
});
