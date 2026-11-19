export const SECTIONS = [
  'observation',
  'deviation',
  'material',
  'result',
  'procedure',
  'note',
] as const;

export type SectionId = (typeof SECTIONS)[number];

export type SectionSource = 'voice' | 'button' | 'auto' | 'user';

export type SectionLockSource = 'voice' | 'button';

export type SuggestionDecision = 'none' | 'pending' | 'accepted' | 'rejected' | 'edited';

export type RecordingMode = 'push-to-talk' | 'continuous';

export type CreatedBy = 'speech' | 'typed';

export type TranscriptionStatus = 'done' | 'failed' | 'typed';

export interface NormalizationEdit {
  start: number;
  end: number;
  original: string;
  replacement: string;
  reason: string;
}

export interface NormalizationSuggestion {
  text: string;
  edits: NormalizationEdit[];
}

export interface Utterance {
  id: string;
  sessionId: string;
  rawText: string;
  authoredText: string;
  normalization: NormalizationSuggestion | null;
  normalizationDecision: SuggestionDecision;
  section: SectionId;
  sectionSource: SectionSource;
  sectionConfirmed: boolean;
  autoSection: SectionId | null;
  autoKeywords: string[];
  startedAt: string;
  endedAt: string;
  confidence: number | null;
  audioUri: string | null;
  audioStartMs: number | null;
  audioEndMs: number | null;
  sourcePhotoId: string | null;
  transcriptionStatus: TranscriptionStatus;
  createdBy: CreatedBy;
  order: number;
}

export type OcrSuggestionKind = 'lot' | 'catalog';

export interface OcrSuggestion {
  id: string;
  kind: OcrSuggestionKind;
  value: string;
  evidence: string;
  decision: SuggestionDecision;
}

export interface Photo {
  id: string;
  sessionId: string;
  uri: string;
  capturedAt: string;
  caption: string;
  ocrText: string | null;
  ocrEngine: string | null;
  suggestions: OcrSuggestion[];
  order: number;
}

export type TimerStatus = 'running' | 'completed' | 'cancelled';

export type TimerSource = 'button' | 'voice';

export interface TimerEvent {
  id: string;
  sessionId: string;
  label: string;
  durationMs: number;
  startedAt: string;
  endedAt: string | null;
  status: TimerStatus;
  source: TimerSource;
  commandId: string | null;
  notificationId: string | null;
}

export type CommandKind = 'set-section' | 'start-timer' | 'stop-timer' | 'cancel-timer' | 'take-photo';

export interface CommandLog {
  id: string;
  sessionId: string;
  rawText: string;
  kind: CommandKind;
  payload: Record<string, string | number | boolean | null>;
  occurredAt: string;
}

export type VocabularyKind = 'term' | 'chemical' | 'unit' | 'alias';

export interface VocabularyEntry {
  id: string;
  spoken: string;
  canonical: string;
  kind: VocabularyKind;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'signed';
  signedAt: string | null;
  signedBy: string | null;
  signOffStatement: string | null;
  activeSection: SectionId | null;
  sectionLockSource: SectionLockSource | null;
  recordingMode: RecordingMode;
}

export interface SessionRecord extends Session {
  utterances: Utterance[];
  photos: Photo[];
  timers: TimerEvent[];
  commands: CommandLog[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'signed';
  utteranceCount: number;
}

export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export const SIGN_OFF_STATEMENT =
  'I am the author of this record. I reviewed the transcript, section tags, and suggestions. Export uses my text. Suggestions I did not accept are not part of the record.';

export const SECTION_LABELS: Record<SectionId, string> = {
  observation: 'Observation',
  deviation: 'Deviation',
  material: 'Material',
  result: 'Result',
  procedure: 'Procedure',
  note: 'Note',
};

export const ELN_ROLES: Record<SectionId, string> = {
  procedure: 'methods',
  material: 'materials',
  observation: 'observations',
  result: 'results',
  deviation: 'deviations',
  note: 'notes',
};

export function isLowConfidence(confidence: number | null): boolean {
  return confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD;
}
