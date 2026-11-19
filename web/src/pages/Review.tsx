import { useEffect, useState } from 'react';
import { decodeWav } from '@core/domain/wav';
import { createId } from '@core/domain/ids';
import { buildAsrPrompt } from '@core/domain/vocabulary';
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
} from '@core/domain/session';
import { SECTIONS, SECTION_LABELS, isLowConfidence, type SectionId, type SessionRecord, type Utterance } from '@core/domain/types';
import { sectionColors } from '@core/ui/theme';
import { transcribeClip } from '@core/services/capture/transcribeClip';
import type { ExportFormat } from '@core/export/bundle';
import { audioIdFromUri, photoIdFromUri } from '@core/storage/idb';
import { useNotebook } from '../notebook';
import { go } from '../route';
import { shareSession } from '../share';
import { transcribeSamples } from '../speech/whisperWeb';

export function Review({ id }: { id: string }) {
  const db = useNotebook();
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await db.getSession(id);
      const saved = await db.getSetting('researcherName');
      if (!active || !loaded) return;
      setRecord(loaded);
      if (saved) setName(saved);
    })();
    return () => {
      active = false;
    };
  }, [db, id]);

  async function commit(next: SessionRecord) {
    setRecord(next);
    await db.saveSession(next);
  }

  async function play(utterance: Utterance) {
    const audioId = audioIdFromUri(utterance.audioUri);
    if (!audioId) return;
    const bytes = await db.getBlob('audio', audioId);
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'audio/wav' }));
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    if (utterance.audioStartMs) audio.currentTime = utterance.audioStartMs / 1000;
    await audio.play();
    if (utterance.audioStartMs != null && utterance.audioEndMs != null && utterance.audioEndMs > utterance.audioStartMs) {
      window.setTimeout(() => audio.pause(), utterance.audioEndMs - utterance.audioStartMs + 80);
    }
  }

  async function retry(utterance: Utterance) {
    if (!record || !utterance.audioUri) return;
    const audioId = audioIdFromUri(utterance.audioUri);
    if (!audioId) return;
    setBusy(true);
    try {
      const bytes = await db.getBlob('audio', audioId);
      if (!bytes) throw new Error('The audio clip is no longer in this browser.');
      const decoded = decodeWav(bytes);
      const view = new Int16Array(decoded.pcm.buffer, decoded.pcm.byteOffset, Math.floor(decoded.pcm.byteLength / 2));
      const floats = new Float32Array(view.length);
      for (let index = 0; index < view.length; index += 1) floats[index] = (view[index] ?? 0) / 32768;
      const vocab = await db.listVocabulary();
      const prompt = buildAsrPrompt(vocab);
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
        engine: { transcribeWav: () => transcribeSamples(floats, prompt) },
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
      await db.setSetting('researcherName', name.trim());
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
      await shareSession(db, record, format, includeAudio);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!record) return <main className="screen"><p>Opening review…</p></main>;
  const blockers = signOffBlockers(record);
  const warnings = signOffWarnings(record);

  return (
    <main className="screen">
      <div className="row">
        <button type="button" className="ink" onClick={() => go({ name: 'capture', id: record.id })}>Back to capture</button>
        <button type="button" className="ink" onClick={() => go({ name: 'home' })}>Sessions</button>
      </div>
      <h1>{record.title}</h1>
      <p>Transcript and structured draft. Edits are yours. Suggestions stay pending until you accept them.</p>
      {message ? <p className="banner warn">{message}</p> : null}
      {record.status === 'signed' ? (
        <>
          <p className="banner info">Signed by {record.signedBy} at {record.signedAt}</p>
          <label className="switch">Include raw audio<input type="checkbox" checked={includeAudio} onChange={(event) => setIncludeAudio(event.target.checked)} /></label>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void exportAs('pdf')}>PDF</button>
            <button type="button" disabled={busy} onClick={() => void exportAs('markdown')}>Markdown</button>
          </div>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void exportAs('docx')}>DOCX</button>
            <button type="button" disabled={busy} onClick={() => void exportAs('json')}>ELN JSON</button>
          </div>
          <button type="button" className="danger" onClick={() => void commit(reopenSession(record, new Date().toISOString()))}>Reopen draft</button>
        </>
      ) : (
        <>
          {blockers.map((item) => <p key={item} className="banner warn">{item}</p>)}
          {warnings.map((item) => <p key={item} className="banner low">{item}</p>)}
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span>I am the author of this record and I reviewed the transcript, section tags, and suggestions.</span>
          </label>
          <button type="button" disabled={!agreed || !name.trim()} onClick={() => void sign()}>Sign record</button>
        </>
      )}

      <h2>Transcript</h2>
      {record.utterances.length === 0 ? <p className="banner info">No utterances yet.</p> : null}
      {[...record.utterances].sort((a, b) => a.order - b.order).map((utterance) => (
        <article key={utterance.id} className={isLowConfidence(utterance.confidence) ? 'card low' : 'card'}>
          <p className="meta">{utterance.startedAt} · {SECTION_LABELS[utterance.section]} · {utterance.sectionSource}{utterance.confidence === null ? '' : ` · ${utterance.confidence.toFixed(2)}`}</p>
          {isLowConfidence(utterance.confidence) ? <strong>Low confidence. Check this against what you said.</strong> : null}
          <p>Heard: {utterance.rawText || '(no transcript)'}</p>
          <textarea disabled={record.status === 'signed'} value={utterance.authoredText} onChange={(event) => setRecord({ ...record, utterances: record.utterances.map((item) => item.id === utterance.id ? { ...item, authoredText: event.target.value } : item) })} onBlur={(event) => {
            if (record.status === 'draft') void commit(editUtteranceText(record, utterance.id, event.target.value, new Date().toISOString()));
          }} />
          {utterance.normalization && utterance.normalizationDecision === 'pending' ? (
            <>
              <p>Suggestion: {utterance.normalization.text}</p>
              <div className="row">
                <button type="button" disabled={record.status === 'signed'} onClick={() => void commit(acceptNormalization(record, utterance.id, new Date().toISOString()))}>Accept</button>
                <button type="button" className="ink" disabled={record.status === 'signed'} onClick={() => void commit(rejectNormalization(record, utterance.id, new Date().toISOString()))}>Reject</button>
              </div>
            </>
          ) : null}
          {!utterance.sectionConfirmed ? <button type="button" disabled={record.status === 'signed'} onClick={() => void commit(confirmSection(record, utterance.id, new Date().toISOString()))}>Confirm section</button> : null}
          <div className="tags">
            {SECTIONS.map((section) => (
              <button key={section} type="button" className={utterance.section === section ? 'on' : ''} style={{ background: utterance.section === section ? sectionColors[section as SectionId] : undefined }} disabled={record.status === 'signed'} onClick={() => void commit(retagUtterance(record, utterance.id, section, new Date().toISOString()))}>{SECTION_LABELS[section]}</button>
            ))}
          </div>
          <div className="row">
            <button type="button" className="ink" disabled={record.status === 'signed'} onClick={() => void commit(moveUtterance(record, utterance.id, -1, 'section', new Date().toISOString()))}>Up</button>
            <button type="button" className="ink" disabled={record.status === 'signed'} onClick={() => void commit(moveUtterance(record, utterance.id, 1, 'section', new Date().toISOString()))}>Down</button>
          </div>
          <div className="row">
            <button type="button" disabled={!utterance.audioUri} onClick={() => void play(utterance)}>Replay</button>
            <button type="button" className="danger" disabled={record.status === 'signed'} onClick={() => void commit(deleteUtterance(record, utterance.id, new Date().toISOString()))}>Delete</button>
          </div>
          {utterance.transcriptionStatus === 'failed' && utterance.audioUri ? (
            <button type="button" disabled={busy || record.status === 'signed'} onClick={() => void retry(utterance)}>Transcribe saved audio</button>
          ) : null}
        </article>
      ))}

      <h2>Structured draft</h2>
      {SECTIONS.map((section) => {
        const entries = record.utterances.filter((item) => item.section === section).sort((a, b) => a.order - b.order);
        if (entries.length === 0) return null;
        return (
          <section key={section}>
            <h2 style={{ color: sectionColors[section] }}>{SECTION_LABELS[section]}</h2>
            {entries.map((entry) => <p key={entry.id} className="card">{entry.authoredText || '(empty)'}</p>)}
          </section>
        );
      })}

      <h2>Photos</h2>
      {record.photos.map((photo) => (
        <PhotoCard key={photo.id} record={record} photoId={photo.id} onCommit={commit} setRecord={setRecord} />
      ))}

      <h2>Timers and commands</h2>
      {record.timers.map((timer) => <p key={timer.id} className="card">{timer.label} · {timer.status} · {timer.source} · {timer.startedAt}</p>)}
      {record.commands.map((command) => <p key={command.id} className="meta">{command.occurredAt} {command.kind}: {command.rawText}</p>)}
    </main>
  );
}

function PhotoCard({
  record,
  photoId,
  onCommit,
  setRecord,
}: {
  record: SessionRecord;
  photoId: string;
  onCommit: (next: SessionRecord) => Promise<void>;
  setRecord: (next: SessionRecord) => void;
}) {
  const db = useNotebook();
  const photo = record.photos.find((item) => item.id === photoId);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const storedId = photo ? (photoIdFromUri(photo.uri) ?? photo.id) : photoId;
    let active = true;
    let current: string | null = null;
    void db.getBlob('photo', storedId).then((bytes) => {
      if (!bytes || !active) return;
      current = URL.createObjectURL(new Blob([bytes.slice()]));
      setUrl(current);
    });
    return () => {
      active = false;
      if (current) URL.revokeObjectURL(current);
    };
  }, [db, photo, photoId]);
  if (!photo) return null;
  return (
    <article className="card">
      {url ? <img className="photo" src={url} alt={photo.caption || 'Bench photo'} /> : null}
      <p className="meta">{photo.capturedAt}</p>
      <input type="text" disabled={record.status === 'signed'} value={photo.caption} placeholder="Caption" onChange={(event) => setRecord({ ...record, photos: record.photos.map((item) => item.id === photo.id ? { ...item, caption: event.target.value } : item) })} onBlur={(event) => {
        if (record.status === 'draft') void onCommit(editPhotoCaption(record, photo.id, event.target.value, new Date().toISOString()));
      }} />
      {photo.suggestions.map((suggestion) => (
        <div key={suggestion.id}>
          <p>{suggestion.kind} {suggestion.value} · {suggestion.decision} · “{suggestion.evidence}”</p>
          {suggestion.decision === 'pending' && record.status === 'draft' ? (
            <div className="row">
              <button type="button" onClick={() => void onCommit(decideOcrSuggestion(record, photo.id, suggestion.id, 'accepted', new Date().toISOString()))}>Accept</button>
              <button type="button" className="ink" onClick={() => void onCommit(decideOcrSuggestion(record, photo.id, suggestion.id, 'rejected', new Date().toISOString()))}>Reject</button>
            </div>
          ) : null}
        </div>
      ))}
    </article>
  );
}
