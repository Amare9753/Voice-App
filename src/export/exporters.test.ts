import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { sequentialIds } from '../domain/ids';
import { applyTranscript } from '../domain/interpret';
import { acceptNormalization, addPhoto, decideOcrSuggestion, signOff } from '../domain/session';
import { createEmptySession } from '../domain/session';
import { vocabularyFromSeed } from '../domain/vocabulary';
import { buildExportZip } from './bundle';
import { renderDocx } from './docx';
import { toElnDocument, renderElnJson } from './eln';
import { ExportBlockedError } from './gate';
import { renderMarkdown } from './markdown';
import { renderPdf } from './pdf';
import { toPdfSafeText } from './pdfSafe';

const NOW = '2026-04-02T15:04:00.000Z';

async function signedRecord() {
  let record = createEmptySession({ id: 'exp-1', title: 'Gel extraction', now: NOW });
  record = applyTranscript(record, {
    rawText: 'observation: five microliters showed two bands',
    vocabulary: vocabularyFromSeed(),
    startedAt: NOW,
    endedAt: NOW,
    confidence: 0.88,
    audioUri: 'file:///audio/exp.wav',
    audioStartMs: 0,
    audioEndMs: 2200,
    createdBy: 'speech',
  }, sequentialIds('utt')).record;
  const utteranceId = record.utterances[0].id;
  record = acceptNormalization(record, utteranceId, NOW);
  record = addPhoto(record, {
    id: 'photo-1',
    sessionId: record.id,
    uri: 'file:///photos/gel.jpg',
    capturedAt: NOW,
    caption: 'Gel, lane 2',
    ocrText: 'Lot AB-12 Cat Q1',
    ocrEngine: 'test',
    order: 0,
    suggestions: [
      { id: 'sug-1', kind: 'lot', value: 'AB-12', evidence: 'Lot AB-12', decision: 'pending' },
      { id: 'sug-2', kind: 'catalog', value: 'Q1', evidence: 'Cat Q1', decision: 'pending' },
    ],
  }, NOW);
  record = decideOcrSuggestion(record, 'photo-1', 'sug-1', 'accepted', NOW);
  return signOff(record, { name: 'A. Rivera', now: NOW });
}

describe('exporters', () => {
  it('refuses to export an unsigned record', async () => {
    const record = createEmptySession({ id: 'exp-1', title: 'Draft', now: NOW });
    expect(() => renderMarkdown(record, { includeAudio: false })).toThrow(ExportBlockedError);
    expect(() => renderElnJson(record, { includeAudio: false })).toThrow(ExportBlockedError);
    await expect(renderPdf(record, { includeAudio: false })).rejects.toBeInstanceOf(ExportBlockedError);
    await expect(renderDocx(record, { includeAudio: false })).rejects.toBeInstanceOf(ExportBlockedError);
  });

  it('writes the accepted researcher text and provenance in all four formats', async () => {
    const record = await signedRecord();
    const json = toElnDocument(record, { includeAudio: true });
    expect(json.schema).toBe('core-capture.eln.v1');
    expect(json.experiment.signOff.signedBy).toBe('A. Rivera');
    const observation = json.sections.find((section) => section.id === 'observation');
    expect(observation?.elnRole).toBe('observations');
    expect(observation?.entries[0].text).toContain('5 µL');
    expect(observation?.entries[0].rawText).toContain('five microliters');
    expect(observation?.entries[0].source.utteranceId).toBe(record.utterances[0].id);
    expect(observation?.entries[0].source.audio?.fileName).toBe(`audio/${record.utterances[0].id}.wav`);
    expect(json.provenance[0].utteranceId).toBe(record.utterances[0].id);
    expect(json.photos[0].acceptedLabels).toEqual([
      { kind: 'lot', value: 'AB-12', evidence: 'Lot AB-12' },
    ]);
    expect(json.photos[0].pendingSuggestionsOmitted).toBe(1);

    const markdown = renderMarkdown(record, { includeAudio: true });
    expect(markdown).toContain('# Gel extraction');
    expect(markdown).toContain('5 µL');
    expect(markdown).toContain(`Source utterance \`${record.utterances[0].id}\``);
    expect(markdown).toContain('Heard: observation: five microliters showed two bands');
    expect(markdown).not.toContain('Cat Q1');

    const pdf = await renderPdf(record, { includeAudio: false });
    expect(pdf[0]).toBe(0x25);
    expect(pdf[1]).toBe(0x50);
    const pdfText = pdfPlainText(pdf);
    expect(pdfText).toContain('Gel extraction');
    expect(pdfText).toContain('A. Rivera');
    expect(pdfText).toContain('5 µL');

    const docx = await renderDocx(record, { includeAudio: true });
    expect(docx[0]).toBe(0x50);
    expect(docx[1]).toBe(0x4b);
    const zip = await JSZip.loadAsync(docx);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    expect(documentXml).toContain('Gel extraction');
    expect(documentXml).toContain('5 µL');
    expect(documentXml).toContain(record.utterances[0].id);
  });

  it('bundles an audio attachment beside the JSON record', async () => {
    const record = await signedRecord();
    const bytes = await buildExportZip([
      { name: 'gel-extraction.json', data: renderElnJson(record, { includeAudio: true }) },
      { name: `audio/${record.utterances[0].id}.wav`, data: new Uint8Array([82, 73, 70, 70]) },
    ]);
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file('gel-extraction.json')).toBeTruthy();
    expect(zip.file(`audio/${record.utterances[0].id}.wav`)).toBeTruthy();
  });
});

function pdfPlainText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const parts: string[] = [];
  let cursor = 0;
  while (cursor < buf.length) {
    const start = buf.indexOf('stream', cursor);
    if (start < 0) break;
    let dataStart = start + 'stream'.length;
    if (buf[dataStart] === 0x0d && buf[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buf[dataStart] === 0x0a || buf[dataStart] === 0x0d) dataStart += 1;
    const end = buf.indexOf('endstream', dataStart);
    if (end < 0) break;
    let dataEnd = end;
    if (buf[dataEnd - 1] === 0x0a) dataEnd -= 1;
    if (buf[dataEnd - 1] === 0x0d) dataEnd -= 1;
    try {
      parts.push(inflateSync(buf.subarray(dataStart, dataEnd)).toString('latin1'));
    } catch {
      parts.push(buf.subarray(dataStart, dataEnd).toString('latin1'));
    }
    cursor = end + 'endstream'.length;
  }
  return parts.join('\n').replace(/<([0-9A-Fa-f\s]+)>/g, (token, hex: string) => {
    const digits = hex.replace(/\s+/g, '');
    if (digits.length < 2 || digits.length % 2 !== 0) return token;
    let decoded = '';
    for (let index = 0; index < digits.length; index += 2) {
      decoded += String.fromCharCode(Number.parseInt(digits.slice(index, index + 2), 16));
    }
    return decoded;
  });
}

describe('pdf text safety', () => {
  it('keeps micro and degree signs in PDF text and spells out greek beta', () => {
    expect(toPdfSafeText('5 µL at 25 °C')).toBe('5 µL at 25 °C');
    expect(toPdfSafeText('β-mercaptoethanol')).toBe('beta-mercaptoethanol');
  });
});
