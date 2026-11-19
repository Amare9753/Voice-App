import { describe, expect, it } from 'vitest';
import { sequentialIds } from './ids';
import { applyTranscript } from './interpret';
import { suggestNormalization } from './normalize';
import {
  acceptNormalization,
  deleteUtterance,
  editUtteranceText,
  moveUtterance,
  rejectNormalization,
  reopenSession,
  retagUtterance,
  signOff,
  SignOffError,
  SignedRecordError,
} from './session';
import { createEmptySession } from './session';
import { vocabularyFromSeed } from './vocabulary';
import { transcribeClip } from '../services/capture/transcribeClip';
import { isLowConfidence } from './types';

const NOW = '2026-04-02T15:00:00.000Z';
const vocab = vocabularyFromSeed();

function draft() {
  return createEmptySession({ id: 'session-1', title: 'Lysis trial', now: NOW });
}

describe('session authorship', () => {
  it('keeps the raw utterance until the researcher accepts a suggestion', () => {
    const heard = applyTranscript(draft(), {
      rawText: 'added five microliters of dmso',
      vocabulary: vocab,
      startedAt: NOW,
      endedAt: NOW,
      confidence: 0.62,
      audioUri: 'file:///clip.wav',
      audioStartMs: 0,
      audioEndMs: 1800,
      createdBy: 'speech',
    }, sequentialIds('u'));
    const utterance = heard.record.utterances[0];
    expect(utterance.authoredText).toBe('added five microliters of dmso');
    expect(utterance.rawText).toBe(utterance.authoredText);
    expect(utterance.normalization?.text).toBe('added 5 µL of DMSO');
    expect(utterance.normalizationDecision).toBe('pending');
    expect(isLowConfidence(utterance.confidence)).toBe(true);

    const accepted = acceptNormalization(heard.record, utterance.id, NOW);
    expect(accepted.utterances[0].authoredText).toBe('added 5 µL of DMSO');
    expect(accepted.utterances[0].rawText).toBe('added five microliters of dmso');
    expect(accepted.utterances[0].normalizationDecision).toBe('accepted');

    const rejected = rejectNormalization(heard.record, utterance.id, NOW);
    expect(rejected.utterances[0].authoredText).toBe('added five microliters of dmso');
    expect(rejected.utterances[0].normalizationDecision).toBe('rejected');
  });

  it('traces a voice section and a timer back to the source utterance', () => {
    const ids = sequentialIds('item');
    let record = draft();
    const section = applyTranscript(record, base('section material'), ids);
    record = section.record;
    expect(record.activeSection).toBe('material');
    expect(record.commands[0].rawText).toBe('section material');

    const note = applyTranscript(record, base('the stock was cloudy'), ids);
    record = note.record;
    expect(record.utterances[0].section).toBe('material');
    expect(record.utterances[0].sectionSource).toBe('voice');
    expect(record.utterances[0].sectionConfirmed).toBe(true);

    const timer = applyTranscript(record, base('start timer 5 minutes'), ids);
    record = timer.record;
    expect(record.timers[0]).toMatchObject({
      durationMs: 300_000,
      source: 'voice',
      status: 'running',
    });
    expect(record.timers[0].commandId).toBe(record.commands.at(-1)?.id);
  });

  it('auto-classifies only as an overridable suggestion', () => {
    const heard = applyTranscript(draft(), base('the pellet looks cloudy'), sequentialIds('u'));
    const utterance = heard.record.utterances[0];
    expect(utterance.section).toBe('observation');
    expect(utterance.sectionSource).toBe('auto');
    expect(utterance.sectionConfirmed).toBe(false);
    const retagged = retagUtterance(heard.record, utterance.id, 'result', NOW);
    expect(retagged.utterances[0]).toMatchObject({ section: 'result', sectionSource: 'user', sectionConfirmed: true });
  });

  it('reorders, edits, and refuses silent changes after sign-off', () => {
    let record = applyTranscript(draft(), base('first note about the gel'), sequentialIds('a')).record;
    record = applyTranscript(record, base('second note about the tube'), sequentialIds('b')).record;
    record = moveUtterance(record, record.utterances[0].id, 1, 'all', NOW);
    expect(record.utterances.map((item) => item.rawText)).toEqual([
      'second note about the tube',
      'first note about the gel',
    ]);
    record = editUtteranceText(record, record.utterances[1].id, 'first note, edited', NOW);
    expect(record.utterances[1].authoredText).toBe('first note, edited');
    expect(record.utterances[1].rawText).toBe('first note about the gel');
    record = signOff(record, { name: 'A. Rivera', now: NOW });
    expect(() => editUtteranceText(record, record.utterances[0].id, 'changed', NOW)).toThrow(SignedRecordError);
    expect(() => deleteUtterance(record, record.utterances[0].id, NOW)).toThrow(SignedRecordError);
    const reopened = reopenSession(record, NOW);
    expect(reopened.status).toBe('draft');
    expect(reopened.signedBy).toBeNull();
  });

  it('blocks sign-off of an empty note and of a session with nothing in it', () => {
    expect(() => signOff(draft(), { name: 'A. Rivera', now: NOW })).toThrow(SignOffError);
    const failed = applyTranscript(draft(), { ...base(''), transcriptionStatus: 'failed' }, sequentialIds('f'));
    expect(() => signOff(failed.record, { name: 'A. Rivera', now: NOW })).toThrow(/empty/i);
  });

  it('does not invent a normalization when nothing scientific changed', () => {
    expect(suggestNormalization('the tube is on the rack')).toBeNull();
  });
});

describe('transcribeClip', () => {
  it('splits a whisper result into timestamped utterances that share one audio file', async () => {
    const result = await transcribeClip({
      record: draft(),
      wavBytes: new Uint8Array([0, 0]),
      vocabulary: vocab,
      startedAt: NOW,
      endedAt: '2026-04-02T15:00:10.000Z',
      audioUri: 'file:///session.wav',
      prompt: 'prompt',
      ids: sequentialIds('seg'),
      engine: {
        async transcribeWav() {
          return {
            engine: 'fake',
            text: 'observation: two bands start timer 5 minutes',
            segments: [
              { text: 'observation: two bands', startMs: 0, endMs: 2000, confidence: 0.9 },
              { text: 'start timer 5 minutes', startMs: 2000, endMs: 4000, confidence: 0.4 },
            ],
          };
        },
      },
    });
    expect(result.record.utterances).toHaveLength(1);
    expect(result.record.utterances[0]).toMatchObject({
      section: 'observation',
      sectionSource: 'voice',
      audioUri: 'file:///session.wav',
      audioStartMs: 0,
      confidence: 0.9,
      rawText: 'observation: two bands',
    });
    expect(result.record.timers[0].durationMs).toBe(300_000);
    expect(result.record.commands[0].rawText).toBe('start timer 5 minutes');
  });
});

function base(rawText: string) {
  return {
    rawText,
    vocabulary: vocab,
    startedAt: NOW,
    endedAt: NOW,
    confidence: 0.9 as number | null,
    audioUri: null,
    audioStartMs: null,
    audioEndMs: null,
    createdBy: 'speech' as const,
  };
}
