import { useEffect, useState } from 'react';
import { createId } from '@core/domain/ids';
import type { VocabularyEntry, VocabularyKind } from '@core/domain/types';
import { addVocabularyEntry, removeVocabularyEntry } from '@core/domain/vocabulary';
import { useNotebook } from '../notebook';
import { go } from '../route';

const KINDS: VocabularyKind[] = ['chemical', 'term', 'unit', 'alias'];

export function VocabularyPage() {
  const db = useNotebook();
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [spoken, setSpoken] = useState('');
  const [canonical, setCanonical] = useState('');
  const [kind, setKind] = useState<VocabularyKind>('term');

  useEffect(() => {
    void db.listVocabulary().then(setEntries);
  }, [db]);

  async function save(next: VocabularyEntry[]) {
    setEntries(next);
    await db.saveVocabulary(next);
  }

  return (
    <main className="screen">
      <button type="button" className="ink" onClick={() => go({ name: 'home' })}>Sessions</button>
      <h1>Lab vocabulary</h1>
      <p>These words are offered to on-device speech as a prompt when the model accepts one, and they suggest spellings after transcription. A record does not change until you accept a suggestion.</p>
      <input type="text" value={spoken} onChange={(event) => setSpoken(event.target.value)} placeholder="Spoken form, e.g. etoh" />
      <input type="text" value={canonical} onChange={(event) => setCanonical(event.target.value)} placeholder="Canonical form, e.g. ethanol" />
      <div className="tags">
        {KINDS.map((item) => (
          <button key={item} type="button" className={item === kind ? 'on' : ''} onClick={() => setKind(item)}>{item}</button>
        ))}
      </div>
      <button type="button" disabled={!spoken.trim() || !canonical.trim()} onClick={() => {
        const next = addVocabularyEntry(entries, { id: createId(), spoken: spoken.trim(), canonical: canonical.trim(), kind });
        setSpoken('');
        setCanonical('');
        void save(next);
      }}>Add term</button>
      {entries.map((entry) => (
        <article key={entry.id} className="card">
          <strong>{entry.spoken} → {entry.canonical}</strong>
          <span className="meta">{entry.kind}</span>
          <button type="button" className="danger" onClick={() => void save(removeVocabularyEntry(entries, entry.id))}>Remove</button>
        </article>
      ))}
    </main>
  );
}
