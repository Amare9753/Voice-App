import { ELN_ROLES, SECTION_LABELS, SECTIONS } from '../domain/types';
import type { SessionRecord } from '../domain/types';
import { assertSigned } from './gate';

export interface ExportOptions {
  includeAudio: boolean;
}

export interface ElnDocument {
  schema: 'core-capture.eln.v1';
  schemaVersion: '1.0.0';
  generator: 'Core Capture';
  experiment: {
    id: string;
    title: string;
    startedAt: string;
    updatedAt: string;
    status: 'signed';
    signOff: { signedBy: string; signedAt: string; statement: string | null };
  };
  sections: Array<{
    id: string;
    elnRole: string;
    title: string;
    entries: ElnEntry[];
  }>;
  photos: ElnPhoto[];
  timers: ElnTimer[];
  commands: ElnCommand[];
  provenance: ElnProvenance[];
  attachments: ElnAttachment[];
}

export interface ElnEntry {
  id: string;
  text: string;
  rawText: string;
  normalizationApplied: boolean;
  suggestedText: string | null;
  normalizationDecision: string;
  sectionSource: string;
  sectionConfirmed: boolean;
  confidence: number | null;
  startedAt: string;
  endedAt: string;
  order: number;
  source: {
    utteranceId: string;
    photoId: string | null;
    audio: { fileName: string; startMs: number | null; endMs: number | null } | null;
  };
}

export interface ElnPhoto {
  id: string;
  capturedAt: string;
  caption: string;
  fileName: string;
  ocrEngine: string | null;
  acceptedLabels: Array<{ kind: string; value: string; evidence: string }>;
  pendingSuggestionsOmitted: number;
}

export interface ElnTimer {
  id: string;
  label: string;
  durationMs: number;
  startedAt: string;
  endedAt: string | null;
  status: string;
  source: string;
  commandId: string | null;
}

export interface ElnCommand {
  id: string;
  rawText: string;
  kind: string;
  occurredAt: string;
  payload: Record<string, string | number | boolean | null>;
}

export interface ElnProvenance {
  entryId: string;
  section: string;
  utteranceId: string;
  rawText: string;
  authoredText: string;
  startedAt: string;
}

export interface ElnAttachment {
  role: 'audio' | 'photo';
  fileName: string;
  sourceId: string;
}

export function toElnDocument(record: SessionRecord, options: ExportOptions): ElnDocument {
  assertSigned(record);
  const attachments: ElnAttachment[] = [];
  const sections = SECTIONS.map((section) => ({
    id: section,
    elnRole: ELN_ROLES[section],
    title: SECTION_LABELS[section],
    entries: record.utterances
      .filter((utterance) => utterance.section === section)
      .sort((a, b) => a.order - b.order)
      .map((utterance) => {
        const audioName = options.includeAudio && utterance.audioUri ? `audio/${utterance.id}.wav` : null;
        if (audioName) attachments.push({ role: 'audio', fileName: audioName, sourceId: utterance.id });
        return {
          id: utterance.id,
          text: utterance.authoredText,
          rawText: utterance.rawText,
          normalizationApplied: utterance.normalizationDecision === 'accepted',
          suggestedText: utterance.normalization?.text ?? null,
          normalizationDecision: utterance.normalizationDecision,
          sectionSource: utterance.sectionSource,
          sectionConfirmed: utterance.sectionConfirmed,
          confidence: utterance.confidence,
          startedAt: utterance.startedAt,
          endedAt: utterance.endedAt,
          order: utterance.order,
          source: {
            utteranceId: utterance.id,
            photoId: utterance.sourcePhotoId,
            audio: audioName
              ? { fileName: audioName, startMs: utterance.audioStartMs, endMs: utterance.audioEndMs }
              : null,
          },
        };
      }),
  }));

  const photos = record.photos
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((photo) => {
      const fileName = `photos/${photo.id}${extensionFor(photo.uri)}`;
      attachments.push({ role: 'photo', fileName, sourceId: photo.id });
      const accepted = photo.suggestions.filter((suggestion) => suggestion.decision === 'accepted');
      return {
        id: photo.id,
        capturedAt: photo.capturedAt,
        caption: photo.caption,
        fileName,
        ocrEngine: photo.ocrEngine,
        acceptedLabels: accepted.map((suggestion) => ({
          kind: suggestion.kind,
          value: suggestion.value,
          evidence: suggestion.evidence,
        })),
        pendingSuggestionsOmitted: photo.suggestions.filter((suggestion) => suggestion.decision === 'pending').length,
      };
    });

  return {
    schema: 'core-capture.eln.v1',
    schemaVersion: '1.0.0',
    generator: 'Core Capture',
    experiment: {
      id: record.id,
      title: record.title,
      startedAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: 'signed',
      signOff: {
        signedBy: record.signedBy ?? '',
        signedAt: record.signedAt ?? '',
        statement: record.signOffStatement,
      },
    },
    sections,
    photos,
    timers: record.timers.map((timer) => ({
      id: timer.id,
      label: timer.label,
      durationMs: timer.durationMs,
      startedAt: timer.startedAt,
      endedAt: timer.endedAt,
      status: timer.status,
      source: timer.source,
      commandId: timer.commandId,
    })),
    commands: record.commands.map((command) => ({
      id: command.id,
      rawText: command.rawText,
      kind: command.kind,
      occurredAt: command.occurredAt,
      payload: command.payload,
    })),
    provenance: record.utterances.map((utterance) => ({
      entryId: utterance.id,
      section: utterance.section,
      utteranceId: utterance.id,
      rawText: utterance.rawText,
      authoredText: utterance.authoredText,
      startedAt: utterance.startedAt,
    })),
    attachments,
  };
}

export function renderElnJson(record: SessionRecord, options: ExportOptions): string {
  return `${JSON.stringify(toElnDocument(record, options), null, 2)}\n`;
}

function extensionFor(uri: string): string {
  const match = uri.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if (!match) return '.jpg';
  return `.${match[1]}`;
}
