import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SessionRecord } from '../../domain/types';
import { buildExportZip, exportFileName, exportMimeType, fileSlug, type ExportFormat } from '../../export/bundle';
import { renderDocx } from '../../export/docx';
import { renderElnJson } from '../../export/eln';
import { renderMarkdown } from '../../export/markdown';
import { renderPdf } from '../../export/pdf';

export async function shareSession(record: SessionRecord, format: ExportFormat, includeAudio: boolean): Promise<void> {
  const data = await renderFormat(record, format, includeAudio);
  const directory = new Directory(Paths.cache, 'exports');
  if (!directory.exists) directory.create();
  if (!includeAudio) {
    await writeAndShare(directory, exportFileName(record.title, format), data, exportMimeType(format));
    return;
  }
  const files: { name: string; data: Uint8Array | string }[] = [
    { name: exportFileName(record.title, format), data },
  ];
  for (const utterance of record.utterances) {
    if (!utterance.audioUri) continue;
    const audio = new File(utterance.audioUri);
    if (!audio.exists) continue;
    files.push({ name: `audio/${utterance.id}.wav`, data: await audio.bytes() });
  }
  for (const photo of record.photos) {
    const image = new File(photo.uri);
    if (!image.exists) continue;
    const extension = image.uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    files.push({ name: `photos/${photo.id}.${extension}`, data: await image.bytes() });
  }
  const zip = await buildExportZip(files);
  await writeAndShare(directory, `${fileSlug(record.title)}-with-audio.zip`, zip, 'application/zip');
}

async function renderFormat(record: SessionRecord, format: ExportFormat, includeAudio: boolean): Promise<Uint8Array> {
  const options = { includeAudio };
  if (format === 'pdf') return renderPdf(record, options);
  if (format === 'docx') return renderDocx(record, options);
  const text = format === 'markdown' ? renderMarkdown(record, options) : renderElnJson(record, options);
  return new TextEncoder().encode(text);
}

async function writeAndShare(directory: Directory, name: string, data: Uint8Array, mimeType: string): Promise<void> {
  const file = new File(directory, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(data);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('The system share sheet is not available.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}
