import { createAudioPlayer } from 'expo-audio';
import { File } from 'expo-file-system';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SECTIONS, SECTION_LABELS, isLowConfidence, type SectionId, type SessionRecord, type Utterance } from '../../domain/types';
import { createId } from '../../domain/ids';
import { buildAsrPrompt } from '../../domain/vocabulary';
import {
  acceptNormalization,
  confirmSection,
  decideOcrSuggestion,
  deleteUtterance,
  editPhotoCaption,
  editUtteranceText,
  moveUtterance,
  rejectNormalization,
  reopenSession,
  retagUtterance,
  signOff,
  signOffBlockers,
  signOffWarnings,
} from '../../domain/session';
import { toWhisperWav } from '../../domain/wav';
import { transcribeClip } from '../../services/capture/transcribeClip';
import { shareSession } from '../../services/export/shareExport';
import { useApp } from '../../services/provider';
import { transcribeWithWhisper } from '../../services/speech/whisperEngine';
import { Banner, BigButton, Screen } from '../../ui/components';
import { sectionColors, theme } from '../../ui/theme';
import type { ExportFormat } from '../../export/bundle';

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo } = useApp();
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    let active = true;
    void (async () => {
      const loaded = await repo.getSession(String(id));
      const savedName = await repo.getSetting('researcherName');
      if (!active || !loaded) return;
      setRecord(loaded);
      if (savedName) setName(savedName);
    })();
    return () => {
      active = false;
    };
  }, [id, repo]);

  useFocusEffect(load);

  async function commit(next: SessionRecord) {
    setRecord(next);
    await repo.saveSession(next);
  }

  async function play(utterance: Utterance) {
    if (!utterance.audioUri) return;
    const player = createAudioPlayer(utterance.audioUri);
    if (utterance.audioStartMs) await player.seekTo(utterance.audioStartMs / 1000);
    player.play();
    if (utterance.audioStartMs != null && utterance.audioEndMs != null && utterance.audioEndMs > utterance.audioStartMs) {
      setTimeout(() => player.pause(), utterance.audioEndMs - utterance.audioStartMs + 80);
    }
  }

  async function retry(utterance: Utterance) {
    if (!record || !utterance.audioUri) return;
    setBusy(true);
    try {
      const original = await new File(utterance.audioUri).bytes();
      const bytes = toWhisperWav(original);
      const vocab = await repo.listVocabulary();
      const prompt = buildAsrPrompt(vocab);
      let whisperPath = utterance.audioUri;
      if (bytes !== original) {
        const { Paths } = await import('expo-file-system');
        const temp = new File(Paths.cache, `whisper-${createId()}.wav`);
        temp.create();
        await temp.write(bytes);
        whisperPath = temp.uri;
      }
      const without = deleteUtterance(record, utterance.id, new Date().toISOString());
      const result = await transcribeClip({
        record: without,
        wavBytes: bytes,
        vocabulary: vocab,
        startedAt: utterance.startedAt,
        endedAt: utterance.endedAt,
        audioUri: utterance.audioUri,
        prompt,
        ids: { next: createId },
        engine: { transcribeWav: () => transcribeWithWhisper(whisperPath, prompt) },
      });
      await commit(result.record);
      setMessage(result.notice);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transcription failed.');
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    if (!record) return;
    try {
      const next = signOff(record, { name, now: new Date().toISOString() });
      await repo.setSetting('researcherName', name.trim());
      await commit(next);
      setMessage('Signed. You can export.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not sign.');
    }
  }

  async function exportAs(format: ExportFormat) {
    if (!record) return;
    setBusy(true);
    try {
      await shareSession(record, format, includeAudio);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!record) {
    return (
      <Screen>
        <Text style={styles.title}>Opening review…</Text>
      </Screen>
    );
  }

  const blockers = signOffBlockers(record);
  const warnings = signOffWarnings(record);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.row}>
          <View style={styles.half}>
            <BigButton label="Back to capture" color={theme.ink} onPress={() => router.back()} />
          </View>
          <View style={styles.half}>
            <BigButton label="Sessions" color={theme.ink} onPress={() => router.push('/')} />
          </View>
        </View>
        <Text style={styles.title}>{record.title}</Text>
        <Text style={styles.lead}>Transcript and structured draft. Edits are yours. Suggestions stay pending until you accept them.</Text>
        {message ? <Banner text={message} tone="warn" /> : null}
        {record.status === 'signed' ? (
          <View style={styles.stack}>
            <Banner text={`Signed by ${record.signedBy} at ${record.signedAt}`} />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Include raw audio</Text>
              <Switch value={includeAudio} onValueChange={setIncludeAudio} />
            </View>
            <View style={styles.row}>
              <View style={styles.half}><BigButton label="PDF" disabled={busy} onPress={() => void exportAs('pdf')} /></View>
              <View style={styles.half}><BigButton label="Markdown" disabled={busy} onPress={() => void exportAs('markdown')} /></View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}><BigButton label="DOCX" disabled={busy} onPress={() => void exportAs('docx')} /></View>
              <View style={styles.half}><BigButton label="ELN JSON" disabled={busy} onPress={() => void exportAs('json')} /></View>
            </View>
            <BigButton label="Reopen draft" color={theme.danger} onPress={() => void commit(reopenSession(record, new Date().toISOString()))} />
          </View>
        ) : (
          <View style={styles.stack}>
            {blockers.map((item) => <Banner key={item} text={item} tone="warn" />)}
            {warnings.map((item) => <Banner key={item} text={item} tone="low" />)}
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={theme.muted} />
            <Pressable style={styles.check} onPress={() => setAgreed((value) => !value)}>
              <View style={[styles.box, agreed && styles.boxOn]} />
              <Text style={styles.checkText}>I am the author of this record and I reviewed the transcript, section tags, and suggestions.</Text>
            </Pressable>
            <BigButton label="Sign record" disabled={!agreed || !name.trim()} onPress={() => void sign()} />
          </View>
        )}

        <Text style={styles.heading}>Transcript</Text>
        {record.utterances.length === 0 ? <Banner text="No utterances yet." /> : null}
        {[...record.utterances].sort((a, b) => a.order - b.order).map((utterance) => (
          <View key={utterance.id} style={[styles.card, isLowConfidence(utterance.confidence) && styles.low]}>
            <Text style={styles.meta}>
              {utterance.startedAt} · {SECTION_LABELS[utterance.section]} · {utterance.sectionSource}
              {utterance.confidence === null ? '' : ` · ${utterance.confidence.toFixed(2)}`}
            </Text>
            {isLowConfidence(utterance.confidence) ? <Text style={styles.lowText}>Low confidence. Check this against what you said.</Text> : null}
            <Text style={styles.heard}>Heard: {utterance.rawText || '(no transcript)'}</Text>
            <TextInput
              style={styles.edit}
              multiline
              editable={record.status === 'draft'}
              value={utterance.authoredText}
              onChangeText={(text) => setRecord({ ...record, utterances: record.utterances.map((item) => item.id === utterance.id ? { ...item, authoredText: text } : item) })}
              onEndEditing={(event) => {
                if (record.status === 'draft') void commit(editUtteranceText(record, utterance.id, event.nativeEvent.text, new Date().toISOString()));
              }}
            />
            {utterance.normalization && utterance.normalizationDecision === 'pending' ? (
              <View style={styles.stack}>
                <Text style={styles.suggestion}>Suggestion: {utterance.normalization.text}</Text>
                <View style={styles.row}>
                  <View style={styles.half}>
                    <BigButton label="Accept" disabled={record.status === 'signed'} onPress={() => void commit(acceptNormalization(record, utterance.id, new Date().toISOString()))} />
                  </View>
                  <View style={styles.half}>
                    <BigButton label="Reject" color={theme.ink} disabled={record.status === 'signed'} onPress={() => void commit(rejectNormalization(record, utterance.id, new Date().toISOString()))} />
                  </View>
                </View>
              </View>
            ) : null}
            {!utterance.sectionConfirmed ? (
              <BigButton label="Confirm section" color="#155E75" disabled={record.status === 'signed'} onPress={() => void commit(confirmSection(record, utterance.id, new Date().toISOString()))} />
            ) : null}
            <View style={styles.tags}>
              {SECTIONS.map((section) => (
                <Pressable
                  key={section}
                  disabled={record.status === 'signed'}
                  onPress={() => void commit(retagUtterance(record, utterance.id, section as SectionId, new Date().toISOString()))}
                  style={[styles.tag, { backgroundColor: utterance.section === section ? sectionColors[section] : '#E7E5E4' }]}
                >
                  <Text style={[styles.tagText, utterance.section === section && styles.tagTextOn]}>{SECTION_LABELS[section]}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <View style={styles.half}><BigButton label="Up" color={theme.ink} disabled={record.status === 'signed'} onPress={() => void commit(moveUtterance(record, utterance.id, -1, 'section', new Date().toISOString()))} /></View>
              <View style={styles.half}><BigButton label="Down" color={theme.ink} disabled={record.status === 'signed'} onPress={() => void commit(moveUtterance(record, utterance.id, 1, 'section', new Date().toISOString()))} /></View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}><BigButton label="Replay" color="#1D4ED8" disabled={!utterance.audioUri} onPress={() => void play(utterance)} /></View>
              <View style={styles.half}><BigButton label="Delete" color={theme.danger} disabled={record.status === 'signed'} onPress={() => void commit(deleteUtterance(record, utterance.id, new Date().toISOString()))} /></View>
            </View>
            {utterance.transcriptionStatus === 'failed' && utterance.audioUri ? (
              <BigButton label="Transcribe saved audio" disabled={busy || record.status === 'signed'} onPress={() => void retry(utterance)} />
            ) : null}
          </View>
        ))}

        <Text style={styles.heading}>Structured draft</Text>
        {SECTIONS.map((section) => {
          const entries = record.utterances.filter((item) => item.section === section).sort((a, b) => a.order - b.order);
          if (entries.length === 0) return null;
          return (
            <View key={section} style={styles.stack}>
              <Text style={[styles.sectionTitle, { color: sectionColors[section] }]}>{SECTION_LABELS[section]}</Text>
              {entries.map((entry) => (
                <Text key={entry.id} style={styles.draft}>{entry.authoredText || '(empty)'}</Text>
              ))}
            </View>
          );
        })}

        <Text style={styles.heading}>Photos</Text>
        {record.photos.map((photo) => (
          <View key={photo.id} style={styles.card}>
            <Text style={styles.meta}>{photo.capturedAt}</Text>
            <TextInput
              style={styles.edit}
              editable={record.status === 'draft'}
              value={photo.caption}
              placeholder="Caption"
              placeholderTextColor={theme.muted}
              onChangeText={(caption) => setRecord({ ...record, photos: record.photos.map((item) => item.id === photo.id ? { ...item, caption } : item) })}
              onEndEditing={(event) => {
                if (record.status === 'draft') void commit(editPhotoCaption(record, photo.id, event.nativeEvent.text, new Date().toISOString()));
              }}
            />
            {photo.suggestions.map((suggestion) => (
              <View key={suggestion.id} style={styles.stack}>
                <Text style={styles.suggestion}>
                  {suggestion.kind} {suggestion.value} · {suggestion.decision} · “{suggestion.evidence}”
                </Text>
                {suggestion.decision === 'pending' && record.status === 'draft' ? (
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <BigButton label="Accept" onPress={() => void commit(decideOcrSuggestion(record, photo.id, suggestion.id, 'accepted', new Date().toISOString()))} />
                    </View>
                    <View style={styles.half}>
                      <BigButton label="Reject" color={theme.ink} onPress={() => void commit(decideOcrSuggestion(record, photo.id, suggestion.id, 'rejected', new Date().toISOString()))} />
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
            {photo.ocrEngine === 'unavailable' ? <Text style={styles.meta}>On-device OCR was not available for this photo.</Text> : null}
          </View>
        ))}

        <Text style={styles.heading}>Timers and commands</Text>
        {record.timers.map((timer) => (
          <Text key={timer.id} style={styles.draft}>
            {timer.label} · {timer.status} · {timer.source} · {timer.startedAt}
          </Text>
        ))}
        {record.commands.map((command) => (
          <Text key={command.id} style={styles.meta}>
            {command.occurredAt} {command.kind}: {command.rawText}
          </Text>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 12, paddingBottom: 48 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  stack: { gap: 10 },
  title: { fontSize: 30, fontWeight: '800', color: theme.ink },
  lead: { fontSize: 17, lineHeight: 24, color: theme.ink },
  heading: { fontSize: 22, fontWeight: '800', color: theme.ink, marginTop: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '800' },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 12, gap: 8, borderWidth: 2, borderColor: theme.line },
  low: { backgroundColor: theme.low, borderColor: '#F59E0B' },
  lowText: { color: theme.lowInk, fontWeight: '700', fontSize: 16 },
  meta: { color: theme.muted, fontSize: 14 },
  heard: { fontSize: 16, color: theme.ink },
  edit: {
    minHeight: 64,
    borderWidth: 2,
    borderColor: theme.line,
    borderRadius: 12,
    padding: 10,
    fontSize: 18,
    color: theme.ink,
    backgroundColor: '#fff',
  },
  suggestion: { fontSize: 16, color: theme.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { minHeight: 44, borderRadius: 12, paddingHorizontal: 10, justifyContent: 'center' },
  tagText: { fontWeight: '700', color: theme.ink },
  tagTextOn: { color: '#fff' },
  draft: { fontSize: 18, color: theme.ink, backgroundColor: theme.card, padding: 12, borderRadius: 12 },
  input: {
    minHeight: 64,
    borderWidth: 2,
    borderColor: theme.line,
    borderRadius: 14,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    fontSize: 20,
    color: theme.ink,
  },
  check: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  box: { width: 32, height: 32, borderWidth: 2, borderColor: theme.ink, borderRadius: 8, backgroundColor: '#fff' },
  boxOn: { backgroundColor: theme.green },
  checkText: { flex: 1, fontSize: 16, lineHeight: 22, color: theme.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 18, fontWeight: '700', color: theme.ink },
});
