import { classifySection } from './classify';
import { parseCommand } from './commands';
import { suggestNormalization } from './normalize';
import { addCommand, addTimer, addUtterance, setSectionLock, settleLatestTimer } from './session';
import type {
  CommandKind,
  CommandLog,
  SectionId,
  SessionRecord,
  TranscriptionStatus,
  Utterance,
  VocabularyEntry,
} from './types';
import type { IdSource } from './ids';

export interface TranscriptInput {
  rawText: string;
  vocabulary: VocabularyEntry[];
  startedAt: string;
  endedAt: string;
  confidence: number | null;
  audioUri: string | null;
  audioStartMs: number | null;
  audioEndMs: number | null;
  createdBy: Utterance['createdBy'];
  transcriptionStatus?: TranscriptionStatus;
}

export interface AppliedTranscript {
  record: SessionRecord;
  photoRequested: boolean;
}

export function applyTranscript(record: SessionRecord, input: TranscriptInput, ids: IdSource): AppliedTranscript {
  const command = parseCommand(input.rawText);
  const occurredAt = input.endedAt;
  if (command.type === 'set-section') {
    const withCommand = addCommand(record, commandLog(record, ids, input.rawText, 'set-section', {
      section: command.section,
    }, occurredAt), occurredAt);
    return {
      record: setSectionLock(withCommand, command.section, 'voice', occurredAt),
      photoRequested: false,
    };
  }
  if (command.type === 'start-timer') {
    const commandId = ids.next();
    const withCommand = addCommand(record, {
      id: commandId,
      sessionId: record.id,
      rawText: input.rawText,
      kind: 'start-timer',
      payload: { durationMs: command.durationMs, label: command.label },
      occurredAt,
    }, occurredAt);
    return {
      record: addTimer(withCommand, {
        id: ids.next(),
        sessionId: record.id,
        label: command.label,
        durationMs: command.durationMs,
        startedAt: occurredAt,
        endedAt: null,
        status: 'running',
        source: 'voice',
        commandId,
        notificationId: null,
      }, occurredAt),
      photoRequested: false,
    };
  }
  if (command.type === 'stop-timer' || command.type === 'cancel-timer') {
    const kind: CommandKind = command.type;
    const withCommand = addCommand(record, commandLog(record, ids, input.rawText, kind, {}, occurredAt), occurredAt);
    return {
      record: settleLatestTimer(withCommand, command.type === 'stop-timer' ? 'completed' : 'cancelled', occurredAt),
      photoRequested: false,
    };
  }
  if (command.type === 'take-photo') {
    return {
      record: addCommand(record, commandLog(record, ids, input.rawText, 'take-photo', {}, occurredAt), occurredAt),
      photoRequested: true,
    };
  }

  const utterance = buildUtterance(record, input, command.voiceSection, ids.next());
  let next = addUtterance(record, utterance, input.endedAt);
  if (command.voiceSection) next = setSectionLock(next, command.voiceSection, 'voice', input.endedAt);
  return { record: next, photoRequested: false };
}

export function buildUtterance(
  record: SessionRecord,
  input: TranscriptInput,
  voiceSection: SectionId | null,
  id: string,
): Utterance {
  const normalization = input.rawText.trim() ? suggestNormalization(input.rawText, input.vocabulary) : null;
  const classification = classifySection(input.rawText);
  let section: SectionId = classification.section;
  let sectionSource: Utterance['sectionSource'] = 'auto';
  let sectionConfirmed = classification.section === 'note';
  if (voiceSection) {
    section = voiceSection;
    sectionSource = 'voice';
    sectionConfirmed = true;
  } else if (record.activeSection && record.sectionLockSource) {
    section = record.activeSection;
    sectionSource = record.sectionLockSource;
    sectionConfirmed = true;
  }
  const order = record.utterances.reduce((max, utterance) => Math.max(max, utterance.order), -1) + 1;
  return {
    id,
    sessionId: record.id,
    rawText: input.rawText,
    authoredText: input.rawText,
    normalization,
    normalizationDecision: normalization ? 'pending' : 'none',
    section,
    sectionSource,
    sectionConfirmed,
    autoSection: classification.section,
    autoKeywords: classification.keywords,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    confidence: input.confidence,
    audioUri: input.audioUri,
    audioStartMs: input.audioStartMs,
    audioEndMs: input.audioEndMs,
    sourcePhotoId: null,
    transcriptionStatus: input.transcriptionStatus ?? (input.createdBy === 'typed' ? 'typed' : 'done'),
    createdBy: input.createdBy,
    order,
  };
}

function commandLog(
  record: SessionRecord,
  ids: IdSource,
  rawText: string,
  kind: CommandKind,
  payload: CommandLog['payload'],
  occurredAt: string,
): CommandLog {
  return {
    id: ids.next(),
    sessionId: record.id,
    rawText,
    kind,
    payload,
    occurredAt,
  };
}
