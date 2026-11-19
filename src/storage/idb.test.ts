import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { sequentialIds } from '../domain/ids';
import { applyTranscript } from '../domain/interpret';
import { createEmptySession, signOff } from '../domain/session';
import { vocabularyFromSeed } from '../domain/vocabulary';
import { NotebookDb } from './idb';

describe('indexeddb notebook', () => {
  it('keeps a signed session, audio bytes, and vocabulary on device', async () => {
    const db = new NotebookDb(`core-capture-test-${crypto.randomUUID()}`);
    await db.open();
    await db.seedVocabulary(vocabularyFromSeed());
    await db.seedVocabulary([{ id: 'skip', spoken: 'nope', canonical: 'Nope', kind: 'term' }]);
    const vocab = await db.listVocabulary();
    expect(vocab.some((entry) => entry.canonical === 'DMSO')).toBe(true);
    expect(vocab.some((entry) => entry.spoken === 'nope')).toBe(false);

    let record = createEmptySession({ id: 'web-1', title: 'Bench web', now: '2026-04-02T12:00:00.000Z' });
    record = applyTranscript(record, {
      rawText: 'incubated five minutes',
      vocabulary: vocab,
      startedAt: '2026-04-02T12:00:00.000Z',
      endedAt: '2026-04-02T12:00:03.000Z',
      confidence: null,
      audioUri: 'idb:audio:utt',
      audioStartMs: 0,
      audioEndMs: 3000,
      createdBy: 'speech',
    }, sequentialIds('web')).record;
    record = signOff(record, { name: 'A. Rivera', now: '2026-04-02T12:05:00.000Z' });
    await db.saveSession(record);
    await db.putBlob('audio', 'utt', new Uint8Array([1, 2, 3, 4]));
    await db.setSetting('whisperReady', '1');

    const reopened = new NotebookDb(dbName(db));
    await reopened.open();
    expect(await reopened.getSession('web-1')).toEqual(record);
    expect(Array.from((await reopened.getBlob('audio', 'utt')) ?? [])).toEqual([1, 2, 3, 4]);
    expect(await reopened.getSetting('whisperReady')).toBe('1');
    expect((await reopened.listSessions())[0]).toMatchObject({ id: 'web-1', status: 'signed', utteranceCount: 1 });

    await reopened.deleteSession('web-1');
    expect(await reopened.getSession('web-1')).toBeNull();
    expect(await reopened.getBlob('audio', 'utt')).toBeNull();
  });
});

function dbName(db: NotebookDb): string {
  return (db as unknown as { name: string }).name;
}
