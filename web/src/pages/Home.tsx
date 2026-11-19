import { useEffect, useState } from 'react';
import { createId } from '@core/domain/ids';
import { createEmptySession } from '@core/domain/session';
import type { SessionSummary } from '@core/domain/types';
import { useNotebook } from '../notebook';
import { go } from '../route';

export function Home() {
  const db = useNotebook();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    void db.listSessions().then(setSessions);
  }, [db]);

  async function start() {
    const record = createEmptySession({ id: createId(), title: 'Bench note', now: new Date().toISOString() });
    await db.saveSession(record);
    go({ name: 'capture', id: record.id });
  }

  return (
    <main className="screen">
      <p className="kicker">On this phone only</p>
      <h1>Core Capture</h1>
      <p className="lead">Dictate a bench note in Safari. You stay the author: suggestions wait until you accept them, and every line keeps its source utterance.</p>
      <button type="button" onClick={() => void start()}>New capture</button>
      <div className="row">
        <button type="button" className="ink" onClick={() => go({ name: 'vocabulary' })}>Vocabulary</button>
        <button type="button" className="ink" onClick={() => go({ name: 'model' })}>Speech model</button>
      </div>
      <h2>Sessions</h2>
      {sessions.length === 0 ? <p className="banner info">No sessions yet. Start a capture when you are at the bench.</p> : null}
      {sessions.map((session) => (
        <button key={session.id} type="button" className="card" onClick={() => go({ name: 'capture', id: session.id })}>
          <strong>{session.title}</strong>
          <span className="meta">{session.status === 'signed' ? 'Signed' : 'Draft'} · {session.utteranceCount} notes</span>
        </button>
      ))}
    </main>
  );
}
