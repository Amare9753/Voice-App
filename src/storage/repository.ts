import type { VocabularyEntry } from '../domain/types';
import type {
  CommandLog,
  OcrSuggestion,
  Photo,
  SectionId,
  SectionLockSource,
  SessionRecord,
  SessionSummary,
  SuggestionDecision,
  TimerEvent,
  Utterance,
} from '../domain/types';
import { SCHEMA, type SqlDb, type SqlValue } from './sql';

interface SessionRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: 'draft' | 'signed';
  signed_at: string | null;
  signed_by: string | null;
  sign_off_statement: string | null;
  active_section: string | null;
  section_lock_source: string | null;
  recording_mode: SessionRecord['recordingMode'];
}

interface UtteranceRow {
  id: string;
  session_id: string;
  raw_text: string;
  authored_text: string;
  normalization_json: string | null;
  normalization_decision: SuggestionDecision;
  section: SectionId;
  section_source: Utterance['sectionSource'];
  section_confirmed: number;
  auto_section: SectionId | null;
  auto_keywords_json: string;
  started_at: string;
  ended_at: string;
  confidence: number | null;
  audio_uri: string | null;
  audio_start_ms: number | null;
  audio_end_ms: number | null;
  source_photo_id: string | null;
  transcription_status: Utterance['transcriptionStatus'];
  created_by: Utterance['createdBy'];
  sort_order: number;
}

interface PhotoRow {
  id: string;
  session_id: string;
  uri: string;
  captured_at: string;
  caption: string;
  ocr_text: string | null;
  ocr_engine: string | null;
  sort_order: number;
}

interface SuggestionRow {
  id: string;
  photo_id: string;
  kind: OcrSuggestion['kind'];
  value: string;
  evidence: string;
  decision: SuggestionDecision;
}

interface TimerRow {
  id: string;
  session_id: string;
  label: string;
  duration_ms: number;
  started_at: string;
  ended_at: string | null;
  status: TimerEvent['status'];
  source: TimerEvent['source'];
  command_id: string | null;
  notification_id: string | null;
}

interface CommandRow {
  id: string;
  session_id: string;
  raw_text: string;
  kind: CommandLog['kind'];
  payload_json: string;
  occurred_at: string;
}

export class SessionRepository {
  constructor(private readonly db: SqlDb) {}

  async init(): Promise<void> {
    await this.db.exec(SCHEMA);
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.db.all<SessionSummary>(
      `SELECT s.id, s.title, s.created_at AS createdAt, s.updated_at AS updatedAt, s.status,
              (SELECT COUNT(*) FROM utterances u WHERE u.session_id = s.id) AS utteranceCount
       FROM sessions s
       ORDER BY s.updated_at DESC`,
    );
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const row = await this.db.get<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
    if (!row) return null;
    const utterances = await this.db.all<UtteranceRow>(
      'SELECT * FROM utterances WHERE session_id = ? ORDER BY sort_order ASC',
      [id],
    );
    const photos = await this.db.all<PhotoRow>(
      'SELECT * FROM photos WHERE session_id = ? ORDER BY sort_order ASC',
      [id],
    );
    const suggestions = photos.length
      ? await this.db.all<SuggestionRow>(
          `SELECT * FROM ocr_suggestions WHERE photo_id IN (${photos.map(() => '?').join(',')})`,
          photos.map((photo) => photo.id),
        )
      : [];
    const timers = await this.db.all<TimerRow>('SELECT * FROM timers WHERE session_id = ? ORDER BY started_at ASC', [id]);
    const commands = await this.db.all<CommandRow>(
      'SELECT * FROM commands WHERE session_id = ? ORDER BY occurred_at ASC',
      [id],
    );
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
      signedAt: row.signed_at,
      signedBy: row.signed_by,
      signOffStatement: row.sign_off_statement,
      activeSection: (row.active_section as SectionId | null) ?? null,
      sectionLockSource: (row.section_lock_source as SectionLockSource | null) ?? null,
      recordingMode: row.recording_mode,
      utterances: utterances.map(mapUtterance),
      photos: photos.map((photo) => mapPhoto(photo, suggestions.filter((item) => item.photo_id === photo.id))),
      timers: timers.map(mapTimer),
      commands: commands.map(mapCommand),
    };
  }

  async saveSession(record: SessionRecord): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run(
        `INSERT INTO sessions (
           id, title, created_at, updated_at, status, signed_at, signed_by, sign_off_statement,
           active_section, section_lock_source, recording_mode
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           updated_at = excluded.updated_at,
           status = excluded.status,
           signed_at = excluded.signed_at,
           signed_by = excluded.signed_by,
           sign_off_statement = excluded.sign_off_statement,
           active_section = excluded.active_section,
           section_lock_source = excluded.section_lock_source,
           recording_mode = excluded.recording_mode`,
        [
          record.id,
          record.title,
          record.createdAt,
          record.updatedAt,
          record.status,
          record.signedAt,
          record.signedBy,
          record.signOffStatement,
          record.activeSection,
          record.sectionLockSource,
          record.recordingMode,
        ],
      );
      await this.db.run('DELETE FROM commands WHERE session_id = ?', [record.id]);
      await this.db.run('DELETE FROM timers WHERE session_id = ?', [record.id]);
      await this.db.run('DELETE FROM utterances WHERE session_id = ?', [record.id]);
      const photoIds = await this.db.all<{ id: string }>('SELECT id FROM photos WHERE session_id = ?', [record.id]);
      for (const photo of photoIds) await this.db.run('DELETE FROM ocr_suggestions WHERE photo_id = ?', [photo.id]);
      await this.db.run('DELETE FROM photos WHERE session_id = ?', [record.id]);

      for (const utterance of record.utterances) {
        await this.db.run(
          `INSERT INTO utterances (
             id, session_id, raw_text, authored_text, normalization_json, normalization_decision,
             section, section_source, section_confirmed, auto_section, auto_keywords_json,
             started_at, ended_at, confidence, audio_uri, audio_start_ms, audio_end_ms,
             source_photo_id, transcription_status, created_by, sort_order
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            utterance.id,
            record.id,
            utterance.rawText,
            utterance.authoredText,
            utterance.normalization ? JSON.stringify(utterance.normalization) : null,
            utterance.normalizationDecision,
            utterance.section,
            utterance.sectionSource,
            utterance.sectionConfirmed ? 1 : 0,
            utterance.autoSection,
            JSON.stringify(utterance.autoKeywords),
            utterance.startedAt,
            utterance.endedAt,
            utterance.confidence,
            utterance.audioUri,
            utterance.audioStartMs,
            utterance.audioEndMs,
            utterance.sourcePhotoId,
            utterance.transcriptionStatus,
            utterance.createdBy,
            utterance.order,
          ],
        );
      }
      for (const photo of record.photos) {
        await this.db.run(
          `INSERT INTO photos (id, session_id, uri, captured_at, caption, ocr_text, ocr_engine, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [photo.id, record.id, photo.uri, photo.capturedAt, photo.caption, photo.ocrText, photo.ocrEngine, photo.order],
        );
        for (const suggestion of photo.suggestions) {
          await this.db.run(
            `INSERT INTO ocr_suggestions (id, photo_id, kind, value, evidence, decision) VALUES (?, ?, ?, ?, ?, ?)`,
            [suggestion.id, photo.id, suggestion.kind, suggestion.value, suggestion.evidence, suggestion.decision],
          );
        }
      }
      for (const timer of record.timers) {
        await this.db.run(
          `INSERT INTO timers (
             id, session_id, label, duration_ms, started_at, ended_at, status, source, command_id, notification_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            timer.id,
            record.id,
            timer.label,
            timer.durationMs,
            timer.startedAt,
            timer.endedAt,
            timer.status,
            timer.source,
            timer.commandId,
            timer.notificationId,
          ],
        );
      }
      for (const command of record.commands) {
        await this.db.run(
          `INSERT INTO commands (id, session_id, raw_text, kind, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [command.id, record.id, command.rawText, command.kind, JSON.stringify(command.payload), command.occurredAt],
        );
      }
    });
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.transaction(async () => {
      const photoIds = await this.db.all<{ id: string }>('SELECT id FROM photos WHERE session_id = ?', [id]);
      for (const photo of photoIds) await this.db.run('DELETE FROM ocr_suggestions WHERE photo_id = ?', [photo.id]);
      await this.db.run('DELETE FROM photos WHERE session_id = ?', [id]);
      await this.db.run('DELETE FROM utterances WHERE session_id = ?', [id]);
      await this.db.run('DELETE FROM timers WHERE session_id = ?', [id]);
      await this.db.run('DELETE FROM commands WHERE session_id = ?', [id]);
      await this.db.run('DELETE FROM sessions WHERE id = ?', [id]);
    });
  }

  async listVocabulary(): Promise<VocabularyEntry[]> {
    const rows = await this.db.all<VocabularyEntry>('SELECT id, spoken, canonical, kind FROM vocabulary ORDER BY spoken ASC');
    return rows;
  }

  async replaceVocabulary(entries: VocabularyEntry[]): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM vocabulary');
      for (const entry of entries) {
        await this.db.run('INSERT INTO vocabulary (id, spoken, canonical, kind) VALUES (?, ?, ?, ?)', [
          entry.id,
          entry.spoken,
          entry.canonical,
          entry.kind,
        ]);
      }
    });
  }

  async seedVocabulary(entries: VocabularyEntry[]): Promise<void> {
    const existing = await this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM vocabulary');
    if ((existing?.count ?? 0) > 0) return;
    await this.replaceVocabulary(entries);
  }

  async getSetting(key: string): Promise<string | null> {
    const row = await this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }
}

function mapUtterance(row: UtteranceRow): Utterance {
  return {
    id: row.id,
    sessionId: row.session_id,
    rawText: row.raw_text,
    authoredText: row.authored_text,
    normalization: row.normalization_json ? JSON.parse(row.normalization_json) : null,
    normalizationDecision: row.normalization_decision,
    section: row.section,
    sectionSource: row.section_source,
    sectionConfirmed: Boolean(row.section_confirmed),
    autoSection: row.auto_section,
    autoKeywords: JSON.parse(row.auto_keywords_json),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    confidence: row.confidence,
    audioUri: row.audio_uri,
    audioStartMs: row.audio_start_ms,
    audioEndMs: row.audio_end_ms,
    sourcePhotoId: row.source_photo_id,
    transcriptionStatus: row.transcription_status,
    createdBy: row.created_by,
    order: row.sort_order,
  };
}

function mapPhoto(row: PhotoRow, suggestions: SuggestionRow[]): Photo {
  return {
    id: row.id,
    sessionId: row.session_id,
    uri: row.uri,
    capturedAt: row.captured_at,
    caption: row.caption,
    ocrText: row.ocr_text,
    ocrEngine: row.ocr_engine,
    order: row.sort_order,
    suggestions: suggestions.map((suggestion) => ({
      id: suggestion.id,
      kind: suggestion.kind,
      value: suggestion.value,
      evidence: suggestion.evidence,
      decision: suggestion.decision,
    })),
  };
}

function mapTimer(row: TimerRow): TimerEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    label: row.label,
    durationMs: row.duration_ms,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    source: row.source,
    commandId: row.command_id,
    notificationId: row.notification_id,
  };
}

function mapCommand(row: CommandRow): CommandLog {
  return {
    id: row.id,
    sessionId: row.session_id,
    rawText: row.raw_text,
    kind: row.kind,
    payload: JSON.parse(row.payload_json),
    occurredAt: row.occurred_at,
  };
}

export type { SqlValue };
