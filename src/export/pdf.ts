import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SECTION_LABELS, SECTIONS } from '../domain/types';
import type { SessionRecord } from '../domain/types';
import { formatDuration } from '../domain/duration';
import { assertSigned } from './gate';
import type { ExportOptions } from './eln';
import { toPdfSafeText } from './pdfSafe';

export async function renderPdf(record: SessionRecord, options: ExportOptions): Promise<Uint8Array> {
  assertSigned(record);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const bodySize = 11;
  const lineHeight = 15;
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let pageNumber = 1;

  const draw = (text: string, size: number, weight: 'regular' | 'bold' = 'regular') => {
    const face = weight === 'bold' ? bold : font;
    const safe = toPdfSafeText(text);
    const words = safe.split(/\s+/).filter((word, index, all) => word.length > 0 || all.length === 1);
    const lines = wrap(words.length ? words : [''], face, size, pageWidth - margin * 2);
    for (const line of lines) {
      if (y < margin + lineHeight) {
        stampFooter(page, font, pageNumber, pageWidth, margin);
        pageNumber += 1;
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, size, font: face, color: rgb(0.1, 0.1, 0.1) });
      y -= lineHeight;
    }
  };

  draw(record.title, 18, 'bold');
  y -= 4;
  draw(`Signed by ${record.signedBy} at ${record.signedAt}`, 10);
  draw(record.signOffStatement ?? '', 10);
  y -= 6;
  draw('Researcher text only. Unaccepted suggestions are not written as fact.', 10);
  y -= 8;

  for (const section of SECTIONS) {
    const entries = record.utterances.filter((utterance) => utterance.section === section).sort((a, b) => a.order - b.order);
    if (entries.length === 0) continue;
    draw(SECTION_LABELS[section], 14, 'bold');
    entries.forEach((entry, index) => {
      draw(`${index + 1}. ${entry.startedAt}`, 10, 'bold');
      draw(entry.authoredText, bodySize);
      const audio = options.includeAudio && entry.audioUri ? ` Audio audio/${entry.id}.wav.` : '';
      draw(
        `Source ${entry.id}. Tag ${entry.sectionSource}. Heard: ${entry.rawText}.${audio}`,
        9,
      );
      y -= 4;
    });
    y -= 6;
  }

  if (record.timers.length > 0) {
    draw('Timers', 14, 'bold');
    for (const timer of record.timers) {
      draw(`${timer.label}: ${formatDuration(timer.durationMs)}, ${timer.status}, ${timer.source}, command ${timer.commandId ?? 'none'}`, 11);
    }
  }

  if (record.photos.length > 0) {
    y -= 6;
    draw('Photos', 14, 'bold');
    for (const photo of record.photos) {
      draw(`${photo.capturedAt} ${photo.caption}`, 11);
      for (const suggestion of photo.suggestions.filter((item) => item.decision === 'accepted')) {
        draw(`Accepted ${suggestion.kind} ${suggestion.value} from "${suggestion.evidence}"`, 10);
      }
    }
  }

  stampFooter(page, font, pageNumber, pageWidth, margin);
  return doc.save();
}

function wrap(words: string[], font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function stampFooter(
  page: { drawText: (text: string, args: object) => void },
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  pageNumber: number,
  pageWidth: number,
  margin: number,
): void {
  const label = `Core Capture local record  ${pageNumber}`;
  page.drawText(label, {
    x: pageWidth - margin - font.widthOfTextAtSize(label, 9),
    y: 28,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
}
