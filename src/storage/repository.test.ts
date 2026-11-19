import { describe, expect, it } from 'vitest';
import { sequentialIds } from '../domain/ids';
import { applyTranscript } from '../domain/interpret';
import { addPhoto, signOff } from '../domain/session';
import { createEmptySession } from '../domain/session';
import { vocabularyFromSeed } from '../domain/vocabulary';
import { openMemoryDb } from './nodeSqlite';
import { SessionRepository } from './repository';

describe('sqlite repository', () => {
  it('round-trips a signed session, vocabulary, and settings', async () => {
    const db = openMemoryDb();
    const repo = new SessionRepository(db);
    await repo.init();
    await repo.seedVocabulary(vocabularyFromSeed());
    await repo.seedVocabulary([{ id: 'other', spoken: 'should-not', canonical: 'Appear', kind: 'term' }]);
    const vocab = await repo.listVocabulary();
    expect(vocab.some((entry) => entry.canonical === 'DMSO')).toBe(true);
    expect(vocab.some((entry) => entry.spoken === 'should-not')).toBe(false);

    let record = createEmptySession({ id: 's1', title: 'Bench session', now: '2026-04-02T12:00:00.000Z' });
    record = applyTranscript(record, {
      rawText: 'incubated five minutes',
      vocabulary: vocab,
      startedAt: '2026-04-02T12:00:00.000Z',
      endedAt: '2026-04-02T12:00:04.000Z',
      confidence: 0.7,
      audioUri: 'file:///a.wav',
      audioStartMs: 0,
      audioEndMs: 4000,
      createdBy: 'speech',
    }, sequentialIds('db')).record;
    record = addPhoto(record, {
      id: 'p1',
      sessionId: record.id,
      uri: 'file:///p.jpg',
      capturedAt: '2026-04-02T12:01:00.000Z',
      caption: 'plate',
      ocrText: 'Lot ZZ9',
      ocrEngine: 'mlkit',
      order: 0,
      suggestions: [{ id: 'o1', kind: 'lot', value: 'ZZ9', evidence: 'Lot ZZ9', decision: 'accepted' }],
    }, '2026-04-02T12:01:00.000Z');
    record = signOff(record, { name: 'N. Baird', now: '2026-04-02T12:05:00.000Z' });
    await repo.saveSession(record);
    await repo.setSetting('researcherName', 'N. Baird');

    const loaded = await repo.getSession('s1');
    expect(loaded).toEqual(record);
    const summaries = await repo.listSessions();
    expect(summaries[0]).toMatchObject({ id: 's1', status: 'signed', utteranceCount: 1 });
    expect(await repo.getSetting('researcherName')).toBe('N. Baird');

    await repo.deleteSession('s1');
    expect(await repo.getSession('s1')).toBeNull();
    expect(await repo.listSessions()).toEqual([]);
  });
});
