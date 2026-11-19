import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { vocabularyFromSeed } from '@core/domain/vocabulary';
import { NotebookDb } from '@core/storage/idb';

const NotebookContext = createContext<NotebookDb | null>(null);

export function useNotebook(): NotebookDb {
  const db = useContext(NotebookContext);
  if (!db) throw new Error('The notebook is not open yet.');
  return db;
}

export function NotebookProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<NotebookDb | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const notebook = new NotebookDb();
    void notebook.open()
      .then(() => notebook.seedVocabulary(vocabularyFromSeed()))
      .then(() => setDb(notebook))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not open the notebook.'));
  }, []);

  if (error) return <main className="screen"><p className="banner warn">{error}</p></main>;
  if (!db) return <main className="screen"><p>Opening the notebook in this browser…</p></main>;
  return <NotebookContext.Provider value={db}>{children}</NotebookContext.Provider>;
}
