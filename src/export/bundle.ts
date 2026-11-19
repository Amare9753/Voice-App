import JSZip from 'jszip';

export interface ZipFile {
  name: string;
  data: Uint8Array | string;
}

export async function buildExportZip(files: ZipFile[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, file.data);
  return zip.generateAsync({ type: 'uint8array' });
}

export function fileSlug(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'core-capture';
}

export type ExportFormat = 'pdf' | 'markdown' | 'docx' | 'json';

export function exportFileName(title: string, format: ExportFormat): string {
  const slug = fileSlug(title);
  const extension = format === 'markdown' ? 'md' : format === 'json' ? 'json' : format;
  return `${slug}.${extension}`;
}

export function exportMimeType(format: ExportFormat): string {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'markdown':
      return 'text/markdown';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'json':
      return 'application/json';
  }
}
