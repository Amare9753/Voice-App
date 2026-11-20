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
      <header className="mast">
        <span className="mark" aria-hidden="true" />
        <div>
          <p className="kicker">On this phone</p>
          <h1>Core Capture</h1>
        </div>
      </header>
      <p className="lead">Dictate a bench note. You stay the author: suggestions wait until you accept them, and every line keeps its source utterance.</p>
      <button type="button" onClick={() => void start()}>New capture</button>
      <div className="row">
        <button type="button" className="ghost" onClick={() => go({ name: 'vocabulary' })}>Vocabulary</button>
        <button type="button" className="ghost" onClick={() => go({ name: 'model' })}>Speech model</button>
      </div>
      <h2>Sessions</h2>
      {sessions.length === 0 ? <p className="banner info">No sessions yet. Start a capture when you are at the bench.</p> : null}
      {sessions.map((session) => (
        <button key={session.id} type="button" className="card" onClick={() => go({ name: 'capture', id: session.id })}>
          <strong>{session.title}</strong>
          <span className="meta">{session.status === 'signed' ? 'Signed' : 'Draft'} · {session.utteranceCount} notes</span>
        </button>
      ))}
      <p className="version">0.2.0 · stays on this phone</p>
    </main>
  );
}
