import type {
  CommandLog,
  OcrSuggestion,
  Photo,
  SectionId,
  SectionLockSource,
  SessionRecord,
  TimerEvent,
  Utterance,
} from './types';
import { SIGN_OFF_STATEMENT } from './types';

export class SignedRecordError extends Error {
  constructor() {
    super('This record is signed. Reopen it before changing it.');
  }
}

export class SignOffError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function createEmptySession(input: { id: string; title: string; now: string }): SessionRecord {
  const title = input.title.trim() || 'Untitled experiment';
  return {
    id: input.id,
    title,
    createdAt: input.now,
    updatedAt: input.now,
    status: 'draft',
    signedAt: null,
    signedBy: null,
    signOffStatement: null,
    activeSection: null,
    sectionLockSource: null,
    recordingMode: 'push-to-talk',
    utterances: [],
    photos: [],
    timers: [],
    commands: [],
  };
}

export function touch(record: SessionRecord, now: string): SessionRecord {
  return { ...record, updatedAt: now };
}

function ensureDraft(record: SessionRecord): void {
  if (record.status === 'signed') throw new SignedRecordError();
}

export function renameSession(record: SessionRecord, title: string, now: string): SessionRecord {
  ensureDraft(record);
  return touch({ ...record, title: title.trim() || record.title }, now);
}

export function setRecordingMode(record: SessionRecord, mode: SessionRecord['recordingMode'], now: string): SessionRecord {
  ensureDraft(record);
  return touch({ ...record, recordingMode: mode }, now);
}

export function setSectionLock(
  record: SessionRecord,
  section: SectionId | null,
  source: SectionLockSource | null,
  now: string,
): SessionRecord {
  ensureDraft(record);
  return touch(
    {
      ...record,
      activeSection: section,
      sectionLockSource: section === null ? null : source,
    },
    now,
  );
}

export function addUtterance(record: SessionRecord, utterance: Utterance, now: string): SessionRecord {
  ensureDraft(record);
  return touch({ ...record, utterances: [...record.utterances, utterance] }, now);
}

export function addCommand(record: SessionRecord, command: CommandLog, now: string): SessionRecord {
  ensureDraft(record);
  return touch({ ...record, commands: [...record.commands, command] }, now);
}

export function acceptNormalization(record: SessionRecord, utteranceId: string, now: string): SessionRecord {
  ensureDraft(record);
  return mapUtterance(record, utteranceId, now, (utterance) => {
    if (!utterance.normalization) return utterance;
    return {
      ...utterance,
      authoredText: utterance.normalization.text,
      normalizationDecision: 'accepted',
    };
  });
}

export function rejectNormalization(record: SessionRecord, utteranceId: string, now: string): SessionRecord {
  ensureDraft(record);
  return mapUtterance(record, utteranceId, now, (utterance) => ({
    ...utterance,
    authoredText: utterance.rawText,
    normalizationDecision: utterance.normalization ? 'rejected' : 'none',
  }));
}

export function editUtteranceText(record: SessionRecord, utteranceId: string, text: string, now: string): SessionRecord {
  ensureDraft(record);
  return mapUtterance(record, utteranceId, now, (utterance) => ({
    ...utterance,
    authoredText: text,
    normalizationDecision:
      utterance.normalization && text === utterance.normalization.text
        ? 'accepted'
        : utterance.normalization && text !== utterance.rawText
          ? 'edited'
          : utterance.normalization
            ? utterance.normalizationDecision === 'accepted'
              ? 'edited'
              : 'rejected'
            : 'none',
    transcriptionStatus: text.trim() ? utterance.transcriptionStatus : utterance.transcriptionStatus,
  }));
}

export function retagUtterance(
  record: SessionRecord,
  utteranceId: string,
  section: SectionId,
  now: string,
): SessionRecord {
  ensureDraft(record);
  return mapUtterance(record, utteranceId, now, (utterance) => ({
    ...utterance,
    section,
    sectionSource: 'user',
    sectionConfirmed: true,
  }));
}

export function confirmSection(record: SessionRecord, utteranceId: string, now: string): SessionRecord {
  ensureDraft(record);
  return mapUtterance(record, utteranceId, now, (utterance) => ({
    ...utterance,
    sectionConfirmed: true,
    sectionSource: utterance.sectionSource === 'auto' ? 'user' : utterance.sectionSource,
  }));
}

export function moveUtterance(
  record: SessionRecord,
  utteranceId: string,
  direction: -1 | 1,
  scope: 'section' | 'all',
  now: string,
): SessionRecord {
  ensureDraft(record);
  const ordered = [...record.utterances].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((utterance) => utterance.id === utteranceId);
  if (index < 0) return record;
  const current = ordered[index];
  const candidates = ordered
    .map((utterance, utteranceIndex) => ({ utterance, utteranceIndex }))
    .filter((item) => scope === 'all' || item.utterance.section === current.section);
  const localIndex = candidates.findIndex((item) => item.utterance.id === utteranceId);
  const neighbor = candidates[localIndex + direction];
  if (!neighbor) return record;
  const swapped = ordered.map((utterance) => {
    if (utterance.id === current.id) return { ...utterance, order: neighbor.utterance.order };
    if (utterance.id === neighbor.utterance.id) return { ...utterance, order: current.order };
    return utterance;
  });
  return touch({ ...record, utterances: swapped.sort((a, b) => a.order - b.order) }, now);
}

export function deleteUtterance(record: SessionRecord, utteranceId: string, now: string): SessionRecord {
  ensureDraft(record);
  const utterances = record.utterances
    .filter((utterance) => utterance.id !== utteranceId)
    .sort((a, b) => a.order - b.order)
    .map((utterance, index) => ({ ...utterance, order: index }));
  return touch({ ...record, utterances }, now);
}

export function addPhoto(record: SessionRecord, photo: Photo, now: string): SessionRecord {
  ensureDraft(record);
  return touch({ ...record, photos: [...record.photos, photo] }, now);
}

export function attachOcr(
  record: SessionRecord,
  photoId: string,
  input: { text: string; engine: string; suggestions: OcrSuggestion[] },
  now: string,
): SessionRecord {
  ensureDraft(record);
  return touch(
    {
      ...record,
      photos: record.photos.map((photo) =>
        photo.id === photoId
          ? { ...photo, ocrText: input.text, ocrEngine: input.engine, suggestions: input.suggestions }
          : photo,
      ),
    },
    now,
  );
}

export function decideOcrSuggestion(
  record: SessionRecord,
  photoId: string,
  suggestionId: string,
  decision: 'accepted' | 'rejected',
  now: string,
): SessionRecord {
  ensureDraft(record);
  return touch(
    {
      ...record,
      photos: record.photos.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              suggestions: photo.suggestions.map((suggestion) =>
                suggestion.id === suggestionId ? { ...suggestion, decision } : suggestion,
              ),
            }
          : photo,
      ),
    },
    now,
  );
}

export function editPhotoCaption(record: SessionRecord, photoId: string, caption: string, now: string): SessionRecord {
  ensureDraft(record);
  return touch(
    {
      ...record,
      photos: record.photos.map((photo) => (photo.id === photoId ? { ...photo, caption } : photo)),
    },
    now,
  );
}

export function addTimer(record: SessionRecord, timer: TimerEvent, now: string): SessionRecord {
  ensureDraft(record);
  return touch({ ...record, timers: [...record.timers, timer] }, now);
}

export function settleLatestTimer(
  record: SessionRecord,
  status: 'completed' | 'cancelled',
  now: string,
): SessionRecord {
  ensureDraft(record);
  const running = [...record.timers].reverse().find((timer) => timer.status === 'running');
  if (!running) return record;
  return touch(
    {
      ...record,
      timers: record.timers.map((timer) =>
        timer.id === running.id ? { ...timer, status, endedAt: now } : timer,
      ),
    },
    now,
  );
}

export function reconcileTimers(record: SessionRecord, now: string): SessionRecord {
  const nowMs = Date.parse(now);
  let changed = false;
  const timers = record.timers.map((timer) => {
    if (timer.status !== 'running') return timer;
    const started = Date.parse(timer.startedAt);
    if (!Number.isFinite(started) || !Number.isFinite(nowMs)) return timer;
    if (started + timer.durationMs > nowMs) return timer;
    changed = true;
    return {
      ...timer,
      status: 'completed' as const,
      endedAt: new Date(started + timer.durationMs).toISOString(),
    };
  });
  if (!changed) return record;
  return { ...record, timers, updatedAt: record.status === 'signed' ? record.updatedAt : now };
}

export function signOff(
  record: SessionRecord,
  input: { name: string; now: string; statement?: string },
): SessionRecord {
  if (record.status === 'signed') return record;
  const name = input.name.trim();
  if (!name) throw new SignOffError('Enter your name to sign the record.');
  const blockers = signOffBlockers(record);
  if (blockers.length > 0) throw new SignOffError(blockers[0]);
  return {
    ...record,
    status: 'signed',
    signedAt: input.now,
    signedBy: name,
    signOffStatement: input.statement?.trim() || SIGN_OFF_STATEMENT,
    updatedAt: input.now,
  };
}

export function reopenSession(record: SessionRecord, now: string): SessionRecord {
  if (record.status === 'draft') return record;
  return {
    ...record,
    status: 'draft',
    signedAt: null,
    signedBy: null,
    signOffStatement: null,
    updatedAt: now,
  };
}

export function signOffBlockers(record: SessionRecord): string[] {
  const blockers: string[] = [];
  if (record.utterances.length === 0 && record.photos.length === 0) {
    blockers.push('Add a note or a photo before signing.');
  }
  record.utterances.forEach((utterance, index) => {
    if (!utterance.authoredText.trim()) {
      blockers.push(`Note ${index + 1} is empty. Type what you said, or delete it.`);
    }
  });
  return blockers;
}

export function signOffWarnings(record: SessionRecord): string[] {
  const warnings: string[] = [];
  const unconfirmed = record.utterances.filter((utterance) => !utterance.sectionConfirmed).length;
  if (unconfirmed > 0) {
    warnings.push(`${unconfirmed} section tag${unconfirmed === 1 ? ' is' : 's are'} still a suggestion.`);
  }
  const pending = record.utterances.filter((utterance) => utterance.normalizationDecision === 'pending').length;
  if (pending > 0) {
    warnings.push(`${pending} wording suggestion${pending === 1 ? ' is' : 's are'} still pending and will not be applied.`);
  }
  const labels = record.photos.flatMap((photo) => photo.suggestions).filter((item) => item.decision === 'pending').length;
  if (labels > 0) {
    warnings.push(`${labels} label suggestion${labels === 1 ? ' is' : 's are'} still pending.`);
  }
  return warnings;
}

function mapUtterance(
  record: SessionRecord,
  utteranceId: string,
  now: string,
  update: (utterance: Utterance) => Utterance,
): SessionRecord {
  return touch(
    {
      ...record,
      utterances: record.utterances.map((utterance) => (utterance.id === utteranceId ? update(utterance) : utterance)),
    },
    now,
  );
}
