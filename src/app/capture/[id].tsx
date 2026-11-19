import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SECTIONS, SECTION_LABELS, type SectionId, type SessionRecord, type VocabularyEntry } from '../../domain/types';
import { buildAsrPrompt } from '../../domain/vocabulary';
import { createId } from '../../domain/ids';
import { applyTranscript } from '../../domain/interpret';
import { addPhoto, addTimer, attachOcr, renameSession, setRecordingMode, setSectionLock, settleLatestTimer } from '../../domain/session';
import { remainingMs } from '../../domain/duration';
import { parseLabelSuggestions } from '../../domain/ocrParse';
import { INITIAL_VAD, nextVad, rmsPcm16 } from '../../domain/vad';
import { toWhisperWav } from '../../domain/wav';
import { useBenchRecorder } from '../../services/audio/useBenchRecorder';
import { transcribeClip } from '../../services/capture/transcribeClip';
import { armNewTimers, cancelTimerNotification, scheduleTimerDone } from '../../services/notify/timerNotifications';
import { recognizeLabel } from '../../services/ocr/recognizeLabel';
import { useApp } from '../../services/provider';
import { transcribeWithWhisper } from '../../services/speech/whisperEngine';
import { Banner, BigButton, Screen } from '../../ui/components';
import { sectionColors, theme } from '../../ui/theme';

export default function CaptureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo } = useApp();
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [vocab, setVocab] = useState<VocabularyEntry[]>([]);
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [clock, setClock] = useState(() => new Date().toISOString());
  const [permission, requestPermission] = useCameraPermissions();
  const recordRef = useRef<SessionRecord | null>(null);
  const vocabRef = useRef<VocabularyEntry[]>([]);
  const listeningRef = useRef(false);
  const modeRef = useRef<'push-to-talk' | 'continuous'>('push-to-talk');
  const vadRef = useRef(INITIAL_VAD);
  const splitLock = useRef(false);
  const pressStarted = useRef(0);
  const wasListening = useRef(false);
  const cameraRef = useRef<CameraView>(null);

  const remember = useCallback((next: SessionRecord) => {
    recordRef.current = next;
    modeRef.current = next.recordingMode;
    setRecord(next);
  }, []);

  const load = useCallback(() => {
    let active = true;
    void (async () => {
      const loaded = await repo.getSession(String(id));
      const words = await repo.listVocabulary();
      if (!active || !loaded) return;
      vocabRef.current = words;
      setVocab(words);
      remember(loaded);
    })();
    const ticker = setInterval(() => setClock(new Date().toISOString()), 1000);
    return () => {
      active = false;
      clearInterval(ticker);
    };
  }, [id, remember, repo]);

  useFocusEffect(load);

  const recorder = useBenchRecorder((pcm, sampleRate) => {
    if (modeRef.current !== 'continuous' || !listeningRef.current) return;
    const frameMs = pcm.byteLength / 2 / Math.max(sampleRate, 1) * 1000;
    const step = nextVad(vadRef.current, rmsPcm16(pcm), frameMs);
    vadRef.current = step.state;
    if (step.speechEnded) void finishClip();
  });

  async function persist(next: SessionRecord) {
    remember(next);
    await repo.saveSession(next);
  }

  async function finishClip() {
    if (splitLock.current) return;
    const current = recordRef.current;
    if (!current || current.status === 'signed') return;
    splitLock.current = true;
    const keepListening = modeRef.current === 'continuous' && listeningRef.current;
    try {
      const clip = await recorder.stopClip();
      if (!clip) return;
      setBusy(true);
      setStatus('Transcribing on this device');
      const startedAt = new Date(Date.now() - clip.durationMs).toISOString();
      const endedAt = new Date().toISOString();
      const source = new File(clip.uri);
      const bytes = await source.bytes();
      let whisperPath = clip.uri;
      try {
        const whisperBytes = toWhisperWav(bytes);
        if (whisperBytes !== bytes) {
          const temp = new File(Paths.cache, `whisper-${createId()}.wav`);
          temp.create();
          await temp.write(whisperBytes);
          whisperPath = temp.uri;
        }
      } catch (conversionError) {
        const failed = applyTranscript(current, {
          rawText: '',
          vocabulary: vocabRef.current,
          startedAt,
          endedAt,
          confidence: null,
          audioUri: clip.uri,
          audioStartMs: 0,
          audioEndMs: clip.durationMs,
          createdBy: 'speech',
          transcriptionStatus: 'failed',
        }, { next: createId });
        await persist(failed.record);
        setStatus(conversionError instanceof Error ? conversionError.message : 'Saved the audio. It was not 16-bit PCM.');
        return;
      }
      const prompt = buildAsrPrompt(vocabRef.current);
      const result = await transcribeClip({
        record: current,
        wavBytes: bytes,
        vocabulary: vocabRef.current,
        startedAt,
        endedAt,
        audioUri: clip.uri,
        prompt,
        ids: { next: createId },
        engine: { transcribeWav: () => transcribeWithWhisper(whisperPath, prompt) },
      });
      const armed = await armNewTimers(current, result.record);
      await persist(armed);
      if (result.photoRequested) setCameraOpen(true);
      setStatus(result.notice ?? (keepListening ? 'Listening' : 'Saved on this device'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save that clip.');
    } finally {
      setBusy(false);
      splitLock.current = false;
      if (keepListening && listeningRef.current) {
        vadRef.current = INITIAL_VAD;
        try {
          await recorder.startClip();
        } catch (error) {
          listeningRef.current = false;
          setListening(false);
          setStatus(error instanceof Error ? error.message : 'Microphone stopped.');
        }
      }
    }
  }

  async function begin() {
    const current = recordRef.current;
    if (!current || current.status === 'signed') return;
    try {
      listeningRef.current = true;
      setListening(true);
      vadRef.current = INITIAL_VAD;
      setStatus(modeRef.current === 'continuous' ? 'Listening' : 'Recording');
      await recorder.startClip();
    } catch (error) {
      listeningRef.current = false;
      setListening(false);
      setStatus(error instanceof Error ? error.message : 'Microphone unavailable.');
    }
  }

  async function endPushToTalk() {
    listeningRef.current = false;
    setListening(false);
    await finishClip();
    await recorder.stopStream();
  }

  async function toggleContinuous() {
    if (listeningRef.current) {
      listeningRef.current = false;
      setListening(false);
      await finishClip();
      await recorder.stopStream();
      setStatus('Ready');
      return;
    }
    await begin();
  }

  function onPressIn() {
    if (modeRef.current !== 'push-to-talk') return;
    pressStarted.current = Date.now();
    wasListening.current = listeningRef.current;
    if (!listeningRef.current) void begin();
  }

  function onPressOut() {
    if (modeRef.current !== 'push-to-talk') return;
    const held = Date.now() - pressStarted.current > 280;
    if (held || wasListening.current) void endPushToTalk();
  }

  async function chooseSection(section: SectionId | null) {
    const current = recordRef.current;
    if (!current || current.status === 'signed') return;
    const now = new Date().toISOString();
    const next = setSectionLock(current, section, section ? 'button' : null, now);
    await persist(next);
    if (listeningRef.current) await finishClip();
  }

  async function submitTyped() {
    const current = recordRef.current;
    const text = typed.trim();
    if (!current || !text || current.status === 'signed') return;
    const now = new Date().toISOString();
    const applied = applyTranscript(current, {
      rawText: text,
      vocabulary: vocabRef.current,
      startedAt: now,
      endedAt: now,
      confidence: null,
      audioUri: null,
      audioStartMs: null,
      audioEndMs: null,
      createdBy: 'typed',
    }, { next: createId });
    const armed = await armNewTimers(current, applied.record);
    await persist(armed);
    setTyped('');
    if (applied.photoRequested) setCameraOpen(true);
  }

  async function startButtonTimer(minutes: number) {
    const current = recordRef.current;
    if (!current || current.status === 'signed') return;
    const now = new Date().toISOString();
    const durationMs = minutes * 60_000;
    const notificationId = await scheduleTimerDone(`${minutes} min`, durationMs);
    const next = addTimer(current, {
      id: createId(),
      sessionId: current.id,
      label: `${minutes} min`,
      durationMs,
      startedAt: now,
      endedAt: null,
      status: 'running',
      source: 'button',
      commandId: null,
      notificationId,
    }, now);
    await persist(next);
  }

  async function cancelTimer() {
    const current = recordRef.current;
    if (!current) return;
    const running = [...current.timers].reverse().find((timer) => timer.status === 'running');
    if (running) await cancelTimerNotification(running.notificationId);
    const now = new Date().toISOString();
    await persist(settleLatestTimer(current, 'cancelled', now));
  }

  async function takePhoto() {
    const current = recordRef.current;
    if (!current || !cameraRef.current || !cameraReady) return;
    const picture = await cameraRef.current.takePictureAsync({ quality: 0.6 });
    if (!picture?.uri) return;
    const photoId = createId();
    const directory = new Directory(Paths.document, 'photos');
    if (!directory.exists) directory.create();
    const dest = new File(directory, `${photoId}.jpg`);
    await new File(picture.uri).copy(dest);
    const now = new Date().toISOString();
    let next = addPhoto(current, {
      id: photoId,
      sessionId: current.id,
      uri: dest.uri,
      capturedAt: now,
      caption: '',
      ocrText: null,
      ocrEngine: null,
      suggestions: [],
      order: current.photos.length,
    }, now);
    await persist(next);
    setCameraOpen(false);
    try {
      const ocr = await recognizeLabel(dest.uri);
      const suggestions = parseLabelSuggestions(ocr.text).map((item) => ({
        id: createId(),
        kind: item.kind,
        value: item.value,
        evidence: item.evidence,
        decision: 'pending' as const,
      }));
      next = attachOcr(recordRef.current ?? next, photoId, { text: ocr.text, engine: ocr.engine, suggestions }, new Date().toISOString());
      await persist(next);
      setStatus(suggestions.length ? 'Label numbers are suggestions. Accept them on review.' : 'Photo saved. No lot or catalog number suggested.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Photo saved. On-device OCR is unavailable.');
    }
  }

  if (!record) {
    return (
      <Screen>
        <View style={styles.pad}>
          <Text style={styles.title}>Opening session…</Text>
        </View>
      </Screen>
    );
  }

  const signed = record.status === 'signed';
  const running = record.timers.filter((timer) => timer.status === 'running');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.topRow}>
          <View style={styles.half}>
            <BigButton label="Sessions" color={theme.ink} onPress={() => router.back()} />
          </View>
          <View style={styles.half}>
            <BigButton label="Review" onPress={() => router.push(`/review/${record.id}`)} />
          </View>
        </View>
        <TextInput
          style={styles.titleInput}
          value={record.title}
          editable={!signed}
          onChangeText={(title) => remember({ ...record, title })}
          onEndEditing={(event) => {
            const current = recordRef.current;
            if (!current || current.status === 'signed') return;
            void persist(renameSession(current, event.nativeEvent.text, new Date().toISOString()));
          }}
        />
        <Banner text={status} tone={busy ? 'warn' : 'info'} />
        {signed ? <Banner text="This record is signed. Reopen it from Review before adding notes." tone="warn" /> : null}
        <View style={styles.topRow}>
          <View style={styles.half}>
            <BigButton
              label="Push to talk"
              color={record.recordingMode === 'push-to-talk' ? theme.green : theme.ink}
              disabled={signed}
              onPress={() => void persist(setRecordingMode(record, 'push-to-talk', new Date().toISOString()))}
            />
          </View>
          <View style={styles.half}>
            <BigButton
              label="Continuous"
              color={record.recordingMode === 'continuous' ? theme.green : theme.ink}
              disabled={signed}
              onPress={() => void persist(setRecordingMode(record, 'continuous', new Date().toISOString()))}
            />
          </View>
        </View>
        <Text style={styles.label}>Section</Text>
        <View style={styles.grid}>
          <View style={styles.cell}>
            <BigButton label="Auto" color={record.activeSection ? theme.ink : theme.green} disabled={signed} onPress={() => void chooseSection(null)} />
          </View>
          {SECTIONS.map((section) => (
            <View key={section} style={styles.cell}>
              <BigButton
                label={SECTION_LABELS[section]}
                color={record.activeSection === section ? sectionColors[section] : theme.ink}
                disabled={signed}
                onPress={() => void chooseSection(section)}
              />
            </View>
          ))}
        </View>
        {record.recordingMode === 'continuous' ? (
          <BigButton
            label={listening ? 'Stop listening' : 'Start listening'}
            color={theme.record}
            disabled={signed || busy}
            onPress={() => void toggleContinuous()}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={listening ? 'Stop talking' : 'Tap to talk'}
            disabled={signed || busy}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={[styles.record, (signed || busy) && styles.disabled]}
          >
            <Text style={styles.recordText}>{listening ? 'Tap to stop' : 'Tap to talk'}</Text>
            <Text style={styles.recordHint}>Hold also works with a bare finger</Text>
          </Pressable>
        )}
        <View style={styles.topRow}>
          <View style={styles.half}>
            <BigButton label="Photo" color="#1D4ED8" disabled={signed} onPress={() => setCameraOpen(true)} />
          </View>
          <View style={styles.half}>
            <BigButton label="5 min timer" color="#9A3412" disabled={signed} onPress={() => void startButtonTimer(5)} />
          </View>
        </View>
        <View style={styles.topRow}>
          <View style={styles.half}>
            <BigButton label="1 min" color="#9A3412" disabled={signed} onPress={() => void startButtonTimer(1)} />
          </View>
          <View style={styles.half}>
            <BigButton label="10 min" color="#9A3412" disabled={signed} onPress={() => void startButtonTimer(10)} />
          </View>
        </View>
        {running.map((timer) => (
          <View key={timer.id} style={styles.timer}>
            <Text style={styles.timerText}>
              {timer.label}: {Math.ceil(remainingMs(timer.startedAt, timer.durationMs, clock) / 1000)}s left
            </Text>
            <BigButton label="Cancel timer" color={theme.danger} onPress={() => void cancelTimer()} />
          </View>
        ))}
        <Text style={styles.label}>Type instead</Text>
        <TextInput
          style={styles.typed}
          multiline
          value={typed}
          editable={!signed}
          onChangeText={setTyped}
          placeholder="Or type a note, or say a command such as start timer 5 minutes"
          placeholderTextColor={theme.muted}
        />
        <BigButton label="Add typed note" disabled={signed || !typed.trim()} onPress={() => void submitTyped()} />
        <Text style={styles.label}>Latest</Text>
        {record.utterances.slice(-3).reverse().map((utterance) => (
          <Text key={utterance.id} style={styles.latest}>
            {SECTION_LABELS[utterance.section]}: {utterance.authoredText || 'Transcription needs your text'}
          </Text>
        ))}
        <Text style={styles.meta}>{vocab.length} vocabulary terms bias the next transcription.</Text>
      </ScrollView>
      {cameraOpen ? (
        <View style={styles.cameraLayer}>
          {permission?.granted ? (
            <CameraView ref={cameraRef} style={styles.camera} facing="back" onCameraReady={() => setCameraReady(true)} />
          ) : (
            <View style={styles.camera}>
              <BigButton label="Allow camera" onPress={() => void requestPermission()} />
            </View>
          )}
          <View style={styles.cameraBar}>
            <BigButton label="Close" color={theme.ink} onPress={() => setCameraOpen(false)} />
            <BigButton label="Take photo" color={theme.record} disabled={!cameraReady} onPress={() => void takePhoto()} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 12, paddingBottom: 40 },
  topRow: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: theme.ink },
  titleInput: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.ink,
    borderBottomWidth: 2,
    borderColor: theme.line,
    paddingVertical: 8,
  },
  label: { fontSize: 16, fontWeight: '800', color: theme.muted, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48%' },
  record: {
    minHeight: 132,
    borderRadius: 24,
    backgroundColor: theme.record,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  disabled: { opacity: 0.45 },
  recordText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  recordHint: { color: '#FEE2E2', fontSize: 16, marginTop: 4 },
  timer: { backgroundColor: theme.card, borderRadius: 16, padding: 12, gap: 8, borderWidth: 2, borderColor: theme.line },
  timerText: { fontSize: 20, fontWeight: '700', color: theme.ink },
  typed: {
    minHeight: 96,
    borderWidth: 2,
    borderColor: theme.line,
    borderRadius: 14,
    backgroundColor: theme.card,
    padding: 12,
    fontSize: 18,
    color: theme.ink,
    textAlignVertical: 'top',
  },
  latest: { fontSize: 18, color: theme.ink, backgroundColor: theme.card, padding: 12, borderRadius: 12 },
  meta: { color: theme.muted, fontSize: 15 },
  cameraLayer: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraBar: { padding: 16, gap: 10, backgroundColor: '#111' },
});
