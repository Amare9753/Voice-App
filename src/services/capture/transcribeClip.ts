import { applyTranscript } from '../../domain/interpret';
import type { IdSource } from '../../domain/ids';
import type { SessionRecord, VocabularyEntry } from '../../domain/types';
import type { SpeechResult } from '../speech/mapResult';

export interface ClipSpeechEngine {
  transcribeWav(wavBytes: Uint8Array, prompt: string): Promise<SpeechResult>;
}

export interface ClipTranscript {
  record: SessionRecord;
  photoRequested: boolean;
  notice: string | null;
  failedUtteranceId: string | null;
}

export async function transcribeClip(input: {
  record: SessionRecord;
  wavBytes: Uint8Array;
  vocabulary: VocabularyEntry[];
  startedAt: string;
  endedAt: string;
  audioUri: string | null;
  prompt: string;
  engine: ClipSpeechEngine;
  ids: IdSource;
}): Promise<ClipTranscript> {
  let speech: SpeechResult;
  try {
    speech = await input.engine.transcribeWav(input.wavBytes, input.prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'On-device transcription failed.';
    const failed = applyTranscript(input.record, {
      rawText: '',
      vocabulary: input.vocabulary,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      confidence: null,
      audioUri: input.audioUri,
      audioStartMs: 0,
      audioEndMs: null,
      createdBy: 'speech',
      transcriptionStatus: 'failed',
    }, input.ids);
    const failedUtterance = failed.record.utterances[failed.record.utterances.length - 1];
    return {
      record: failed.record,
      photoRequested: false,
      notice: message,
      failedUtteranceId: failedUtterance?.id ?? null,
    };
  }

  if (speech.segments.length === 0) {
    return {
      record: input.record,
      photoRequested: false,
      notice: 'No speech detected in that clip.',
      failedUtteranceId: null,
    };
  }

  let record = input.record;
  let photoRequested = false;
  const clipMs = Math.max(0, Date.parse(input.endedAt) - Date.parse(input.startedAt));
  for (const segment of speech.segments) {
    const startedAt = shiftIso(input.startedAt, segment.startMs);
    const endedAt = shiftIso(input.startedAt, segment.endMs || clipMs);
    const applied = applyTranscript(record, {
      rawText: segment.text,
      vocabulary: input.vocabulary,
      startedAt,
      endedAt,
      confidence: segment.confidence,
      audioUri: input.audioUri,
      audioStartMs: segment.startMs,
      audioEndMs: segment.endMs || null,
      createdBy: 'speech',
      transcriptionStatus: 'done',
    }, input.ids);
    record = applied.record;
    photoRequested = photoRequested || applied.photoRequested;
  }
  return { record, photoRequested, notice: null, failedUtteranceId: null };
}

function shiftIso(iso: string, offsetMs: number): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  return new Date(time + offsetMs).toISOString();
}
