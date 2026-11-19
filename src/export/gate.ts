import type { SessionRecord } from '../domain/types';

export class ExportBlockedError extends Error {
  constructor() {
    super('Sign the record before export. Core Capture will not export an unsigned notebook.');
  }
}

export function assertSigned(record: SessionRecord): void {
  if (record.status !== 'signed' || !record.signedBy || !record.signedAt) {
    throw new ExportBlockedError();
  }
}
