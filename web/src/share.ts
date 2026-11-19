import { audioIdFromUri, photoIdFromUri, type NotebookDb } from '@core/storage/idb';
import type { SessionRecord } from '@core/domain/types';
import { buildExportZip, exportFileName, exportMimeType, fileSlug, type ExportFormat } from '@core/export/bundle';
import { renderDocx } from '@core/export/docx';
import { renderElnJson } from '@core/export/eln';
import { renderMarkdown } from '@core/export/markdown';
import { renderPdf } from '@core/export/pdf';

export async function shareSession(
  db: NotebookDb,
  record: SessionRecord,
  format: ExportFormat,
  includeAudio: boolean,
): Promise<void> {
  const bytes = await renderFormat(record, format, includeAudio);
  const filename = exportFileName(record.title, format);
  if (!includeAudio) {
    await shareOrDownload(filename, bytes, exportMimeType(format));
    return;
  }
  const files: { name: string; data: Uint8Array | string }[] = [{ name: filename, data: bytes }];
  const seenAudio = new Set<string>();
  for (const utterance of record.utterances) {
    const audioId = audioIdFromUri(utterance.audioUri);
    if (!audioId || seenAudio.has(audioId)) continue;
    const audio = await db.getBlob('audio', audioId);
    if (!audio) continue;
    seenAudio.add(audioId);
    files.push({ name: `audio/${audioId}.wav`, data: audio });
  }
  for (const photo of record.photos) {
    const photoId = photoIdFromUri(photo.uri) ?? photo.id;
    const image = await db.getBlob('photo', photoId);
    if (!image) continue;
    files.push({ name: `photos/${photo.id}.jpg`, data: image });
  }
  const zip = await buildExportZip(files);
  await shareOrDownload(`${fileSlug(record.title)}-with-audio.zip`, zip, 'application/zip');
}

async function renderFormat(record: SessionRecord, format: ExportFormat, includeAudio: boolean): Promise<Uint8Array> {
  const options = { includeAudio };
  if (format === 'pdf') return renderPdf(record, options);
  if (format === 'docx') return renderDocx(record, options);
  const text = format === 'markdown' ? renderMarkdown(record, options) : renderElnJson(record, options);
  return new TextEncoder().encode(text);
}

async function shareOrDownload(name: string, bytes: Uint8Array, mime: string): Promise<void> {
  const file = new File([bytes.slice()], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name });
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
