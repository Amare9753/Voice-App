import type { SessionRecord, SessionSummary, VocabularyEntry } from '../domain/types';

const DB_NAME = 'core-capture';
const DB_VERSION = 1;

export type BlobKind = 'audio' | 'photo';

interface NotebookStores {
  sessions: SessionRecord;
  vocabulary: VocabularyEntry[];
  settings: string;
  blobs: Uint8Array;
}

export class NotebookDb {
  private database: IDBDatabase | null = null;

  constructor(private readonly name = DB_NAME) {}

  async open(): Promise<void> {
    if (this.database) return;
    this.database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('vocabulary')) db.createObjectStore('vocabulary');
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async listSessions(): Promise<SessionSummary[]> {
    const records = await this.getAll<SessionRecord>('sessions');
    return records
      .map((record) => ({
        id: record.id,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        status: record.status,
        utteranceCount: record.utterances.length,
      }))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return (await this.get<SessionRecord>('sessions', id)) ?? null;
  }

  async saveSession(record: SessionRecord): Promise<void> {
    const tx = this.db().transaction('sessions', 'readwrite');
    await finish(tx, () => {
      tx.objectStore('sessions').put(record);
    });
  }

  async deleteSession(id: string): Promise<void> {
    const record = await this.getSession(id);
    await this.delete('sessions', id);
    if (!record) return;
    for (const utterance of record.utterances) {
      const audioId = audioIdFromUri(utterance.audioUri);
      if (audioId) await this.deleteBlob('audio', audioId);
    }
    for (const photo of record.photos) {
      const photoId = photoIdFromUri(photo.uri) ?? photo.id;
      await this.deleteBlob('photo', photoId);
    }
  }

  async listVocabulary(): Promise<VocabularyEntry[]> {
    return (await this.get<VocabularyEntry[]>('vocabulary', 'all')) ?? [];
  }

  async saveVocabulary(entries: VocabularyEntry[]): Promise<void> {
    await this.put('vocabulary', entries, 'all');
  }

  async seedVocabulary(entries: VocabularyEntry[]): Promise<void> {
    const existing = await this.listVocabulary();
    if (existing.length > 0) return;
    await this.saveVocabulary(entries);
  }

  async getSetting(key: string): Promise<string | null> {
    return (await this.get<string>('settings', key)) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.put('settings', value, key);
  }

  async putBlob(kind: BlobKind, id: string, bytes: Uint8Array): Promise<void> {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await this.put('blobs', copy, blobKey(kind, id));
  }

  async getBlob(kind: BlobKind, id: string): Promise<Uint8Array | null> {
    const value = await this.get<unknown>('blobs', blobKey(kind, id));
    if (value == null) return null;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return null;
  }

  private async deleteBlob(kind: BlobKind, id: string): Promise<void> {
    await this.delete('blobs', blobKey(kind, id));
  }

  private async getAll<T>(store: keyof NotebookStores): Promise<T[]> {
    const tx = this.db().transaction(store, 'readonly');
    return request(tx.objectStore(store).getAll()) as Promise<T[]>;
  }

  private async get<T>(store: keyof NotebookStores, key: string): Promise<T | undefined> {
    const tx = this.db().transaction(store, 'readonly');
    const value = await request(tx.objectStore(store).get(key));
    return value as T | undefined;
  }

  private async put(store: keyof NotebookStores, value: unknown, key?: string): Promise<void> {
    const tx = this.db().transaction(store, 'readwrite');
    await finish(tx, () => {
      if (key === undefined) tx.objectStore(store).put(value);
      else tx.objectStore(store).put(value, key);
    });
  }

  private async delete(store: keyof NotebookStores, key: string): Promise<void> {
    const tx = this.db().transaction(store, 'readwrite');
    await finish(tx, () => {
      tx.objectStore(store).delete(key);
    });
  }

  private db(): IDBDatabase {
    if (!this.database) throw new Error('The notebook database is not open.');
    return this.database;
  }
}

export function blobKey(kind: BlobKind, id: string): string {
  return `${kind}:${id}`;
}

export function audioIdFromUri(uri: string | null): string | null {
  return idFromUri(uri, 'idb:audio:');
}

export function photoIdFromUri(uri: string | null): string | null {
  return idFromUri(uri, 'idb:photo:');
}

function idFromUri(uri: string | null, prefix: string): string | null {
  if (!uri?.startsWith(prefix)) return null;
  return uri.slice(prefix.length);
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finish(tx: IDBTransaction, work: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    work();
  });
}
