import { useEffect, useRef, useState } from 'react';
import { INITIAL_VAD, nextVad, rmsPcm16 } from '@core/domain/vad';
import { encodeWav, floatToPcm16, resampleFloat32 } from '@core/domain/wav';
import { createId } from '@core/domain/ids';
import { applyTranscript } from '@core/domain/interpret';
import { addPhoto, addTimer, attachOcr, reconcileTimers, renameSession, setRecordingMode, setSectionLock, settleLatestTimer } from '@core/domain/session';
import { remainingMs } from '@core/domain/duration';
import { parseLabelSuggestions } from '@core/domain/ocrParse';
import { buildAsrPrompt } from '@core/domain/vocabulary';
import { SECTIONS, SECTION_LABELS, type SectionId, type SessionRecord, type VocabularyEntry } from '@core/domain/types';
import { sectionColors } from '@core/ui/theme';
import { transcribeClip } from '@core/services/capture/transcribeClip';
import { BenchRecorder } from '../audio/recorder';
import { useNotebook } from '../notebook';
import { recognizeImage } from '../ocr/ocrWeb';
import { go } from '../route';
import { transcribeSamples } from '../speech/whisperWeb';
import { clearAllTimerHandles, notifyTimer, requestTimerPermission, scheduleTimer } from '../timers';

export function Capture({ id }: { id: string }) {
  const db = useNotebook();
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [status, setStatus] = useState('Ready');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [clock, setClock] = useState(() => new Date().toISOString());
  const recordRef = useRef<SessionRecord | null>(null);
  const vocabRef = useRef<VocabularyEntry[]>([]);
  const listeningRef = useRef(false);
  const modeRef = useRef<'push-to-talk' | 'continuous'>('push-to-talk');
  const vadRef = useRef(INITIAL_VAD);
  const recorderRef = useRef(new BenchRecorder());
  const splitLock = useRef(false);
  const starting = useRef<Promise<void> | null>(null);
  const pressStarted = useRef(0);
  const wasListening = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());

  function remember(next: SessionRecord) {
    recordRef.current = next;
    modeRef.current = next.recordingMode;
    setRecord(next);
    armTimers(next);
  }

  async function persist(next: SessionRecord) {
    remember(next);
    await db.saveSession(next);
  }

  function armTimers(next: SessionRecord) {
    clearAllTimerHandles();
    for (const timer of next.timers) {
      if (timer.status !== 'running') continue;
      scheduleTimer(timer, () => {
        const current = recordRef.current;
        if (!current) return;
        const now = new Date().toISOString();
        const updated = reconcileTimers(current, now);
        void persist(updated);
        const finished = updated.timers.find((item) => item.id === timer.id);
        setStatus(`Timer finished: ${finished?.label ?? timer.label}`);
        void notifyTimer(finished?.label ?? timer.label);
      });
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await db.getSession(id);
      const vocab = await db.listVocabulary();
      if (!active || !loaded) return;
      vocabRef.current = vocab;
      const reconciled = reconcileTimers(loaded, new Date().toISOString());
      if (reconciled !== loaded) await db.saveSession(reconciled);
      remember(reconciled);
      const finished = reconciled.timers.filter((timer) => loaded.timers.some((before) => before.id === timer.id && before.status === 'running' && timer.status === 'completed'));
      if (finished.length) setStatus(`Timer finished while the app was away: ${finished.map((timer) => timer.label).join(', ')}`);
    })();
    const ticker = window.setInterval(() => setClock(new Date().toISOString()), 1000);
    return () => {
      active = false;
      window.clearInterval(ticker);
      clearAllTimerHandles();
      void recorderRef.current.stop();
    };
    // remember is stable enough for this screen's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id]);

  async function transcribeTaken(samples: Float32Array, sampleRate: number, startedAt: string, endedAt: string) {
    const current = recordRef.current;
    if (!current || samples.length < sampleRate * 0.25) {
      setStatus('That clip was too short.');
      return;
    }
    const audio = resampleFloat32(samples, sampleRate, 16_000);
    const clipId = createId();
    await db.putBlob('audio', clipId, encodeWav(floatToPcm16(audio), 16_000));
    const prompt = buildAsrPrompt(vocabRef.current);
    const ready = (await db.getSetting('whisperReady')) === '1';
    setBusy(true);
    setStatus(ready ? 'Transcribing in this browser' : 'Audio saved. Download the speech model to transcribe it.');
    const result = await transcribeClip({
      record: current,
      wavBytes: new Uint8Array(),
      vocabulary: vocabRef.current,
      startedAt,
      endedAt,
      audioUri: `idb:audio:${clipId}`,
      prompt,
      ids: { next: createId },
      engine: {
        transcribeWav: () => {
          if (!ready) throw new Error('Download the speech model first. The audio is saved on this phone.');
          return transcribeSamples(audio, prompt);
        },
      },
    });
    await persist(result.record);
    setStatus(result.notice ?? 'Saved on this phone');
    setBusy(false);
  }

  function enqueueClip(samples: Float32Array, sampleRate: number, startedAt: string, endedAt: string) {
    queue.current = queue.current.then(() => transcribeTaken(samples, sampleRate, startedAt, endedAt)).catch((error: unknown) => {
      setBusy(false);
      setStatus(error instanceof Error ? error.message : 'Could not save that clip.');
    });
  }

  async function finishClip() {
    if (splitLock.current) return;
    if (starting.current) await starting.current;
    splitLock.current = true;
    const keep = modeRef.current === 'continuous' && listeningRef.current;
    try {
      const taken = recorderRef.current.takeSamples();
      const endedAt = new Date().toISOString();
      const startedAt = new Date(Date.now() - Math.round((taken.samples.length / taken.sampleRate) * 1000)).toISOString();
      if (taken.samples.length > 0) enqueueClip(taken.samples, taken.sampleRate, startedAt, endedAt);
    } finally {
      splitLock.current = false;
      if (!keep) {
        listeningRef.current = false;
        setListening(false);
        await recorderRef.current.stop();
      }
    }
  }

  function onFrame(frame: Float32Array, sampleRate: number) {
    if (modeRef.current !== 'continuous' || !listeningRef.current) return;
    const pcm = floatToPcm16(frame);
    const step = nextVad(vadRef.current, rmsPcm16(pcm), (frame.length / sampleRate) * 1000);
    vadRef.current = step.state;
    if (step.speechEnded) void finishClip();
  }

  async function begin() {
    if (!recordRef.current || recordRef.current.status === 'signed') return;
    try {
      listeningRef.current = true;
      setListening(true);
      vadRef.current = INITIAL_VAD;
      setStatus(modeRef.current === 'continuous' ? 'Listening' : 'Recording');
      const pending = recorderRef.current.start(onFrame);
      starting.current = pending;
      await pending;
      starting.current = null;
    } catch (error) {
      listeningRef.current = false;
      setListening(false);
      setStatus(error instanceof Error ? error.message : 'Microphone unavailable.');
    }
  }

  async function toggleContinuous() {
    if (listeningRef.current) {
      listeningRef.current = false;
      setListening(false);
      await finishClip();
      setStatus('Ready');
      return;
    }
    await begin();
  }

  function onPointerDown() {
    if (modeRef.current !== 'push-to-talk') return;
    pressStarted.current = Date.now();
    wasListening.current = listeningRef.current;
    if (!listeningRef.current) void begin();
  }

  function onPointerUp() {
    if (modeRef.current !== 'push-to-talk') return;
    const held = Date.now() - pressStarted.current > 280;
    if (held || wasListening.current) void finishClip();
  }

  async function chooseSection(section: SectionId | null) {
    const current = recordRef.current;
    if (!current || current.status === 'signed') return;
    const now = new Date().toISOString();
    await persist(setSectionLock(current, section, section ? 'button' : null, now));
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
    await persist(applied.record);
    setTyped('');
  }

  async function startButtonTimer(minutes: number) {
    const current = recordRef.current;
    if (!current || current.status === 'signed') return;
    await requestTimerPermission();
    const now = new Date().toISOString();
    await persist(addTimer(current, {
      id: createId(),
      sessionId: current.id,
      label: `${minutes} min`,
      durationMs: minutes * 60_000,
      startedAt: now,
      endedAt: null,
      status: 'running',
      source: 'button',
      commandId: null,
      notificationId: null,
    }, now));
  }

  async function onPhoto(file: File | undefined) {
    const current = recordRef.current;
    if (!current || !file || current.status === 'signed') return;
    const photoId = createId();
    const bytes = new Uint8Array(await file.arrayBuffer());
    await db.putBlob('photo', photoId, bytes);
    const now = new Date().toISOString();
    let next = addPhoto(current, {
      id: photoId,
      sessionId: current.id,
      uri: `idb:photo:${photoId}`,
      capturedAt: now,
      caption: '',
      ocrText: null,
      ocrEngine: null,
      suggestions: [],
      order: current.photos.length,
    }, now);
    await persist(next);
    try {
      const ocr = await recognizeImage(new Blob([bytes], { type: file.type || 'image/jpeg' }));
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
      setStatus(error instanceof Error ? error.message : 'Photo saved. In-browser OCR failed.');
    }
  }

  if (!record) return <main className="screen"><p>Opening session…</p></main>;
  const signed = record.status === 'signed';
  const running = record.timers.filter((timer) => timer.status === 'running');

  return (
    <main className="screen">
      <div className="row">
        <button type="button" className="ink" onClick={() => go({ name: 'home' })}>Sessions</button>
        <button type="button" onClick={() => go({ name: 'review', id: record.id })}>Review</button>
      </div>
      <input type="text" value={record.title} disabled={signed} onChange={(event) => remember({ ...record, title: event.target.value })} onBlur={(event) => {
        const current = recordRef.current;
        if (!current || current.status === 'signed') return;
        void persist(renameSession(current, event.target.value, new Date().toISOString()));
      }} />
      <p className={`banner ${busy ? 'warn' : 'info'}`}>{status}</p>
      {signed ? <p className="banner warn">This record is signed. Reopen it from Review before adding notes.</p> : null}
      <div className="row">
        <button type="button" className={record.recordingMode === 'push-to-talk' ? '' : 'ink'} disabled={signed} onClick={() => void persist(setRecordingMode(record, 'push-to-talk', new Date().toISOString()))}>Push to talk</button>
        <button type="button" className={record.recordingMode === 'continuous' ? '' : 'ink'} disabled={signed} onClick={() => void persist(setRecordingMode(record, 'continuous', new Date().toISOString()))}>Continuous</button>
      </div>
      <p className="kicker">Section</p>
      <div className="grid">
        <button type="button" className={record.activeSection ? 'ink' : ''} disabled={signed} onClick={() => void chooseSection(null)}>Auto</button>
        {SECTIONS.map((section) => (
          <button key={section} type="button" disabled={signed} style={{ background: record.activeSection === section ? sectionColors[section] : '#1c1917' }} onClick={() => void chooseSection(section)}>{SECTION_LABELS[section]}</button>
        ))}
      </div>
      {record.recordingMode === 'continuous' ? (
        <button type="button" className="record" disabled={signed || busy} onClick={() => void toggleContinuous()}>{listening ? 'Stop listening' : 'Start listening'}</button>
      ) : (
        <button type="button" className="record" disabled={signed || busy} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {listening ? 'Tap to stop' : 'Tap to talk'}
        </button>
      )}
      <div className="row">
        <label className="button file">Photo<input type="file" accept="image/*" capture="environment" disabled={signed} onChange={(event) => void onPhoto(event.target.files?.[0])} /></label>
        <button type="button" className="warn" disabled={signed} onClick={() => void startButtonTimer(5)}>5 min timer</button>
      </div>
      <div className="row">
        <button type="button" className="warn" disabled={signed} onClick={() => void startButtonTimer(1)}>1 min</button>
        <button type="button" className="warn" disabled={signed} onClick={() => void startButtonTimer(10)}>10 min</button>
      </div>
      {running.map((timer) => (
        <article key={timer.id} className="card">
          <strong>{timer.label}: {Math.ceil(remainingMs(timer.startedAt, timer.durationMs, clock) / 1000)}s left</strong>
          <button type="button" className="danger" onClick={() => {
            clearAllTimerHandles();
            void persist(settleLatestTimer(record, 'cancelled', new Date().toISOString()));
          }}>Cancel timer</button>
        </article>
      ))}
      <p className="kicker">Type instead</p>
      <textarea value={typed} disabled={signed} onChange={(event) => setTyped(event.target.value)} placeholder="Or type a note, or a command such as start timer 5 minutes" />
      <button type="button" disabled={signed || !typed.trim()} onClick={() => void submitTyped()}>Add typed note</button>
      <p className="kicker">Latest</p>
      {record.utterances.slice(-3).reverse().map((utterance) => (
        <p key={utterance.id} className="card">{SECTION_LABELS[utterance.section]}: {utterance.authoredText || 'Transcription needs your text'}</p>
      ))}
    </main>
  );
}
