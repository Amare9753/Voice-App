import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { SECTION_LABELS, SECTIONS } from '../domain/types';
import type { SessionRecord } from '../domain/types';
import { formatDuration } from '../domain/duration';
import { assertSigned } from './gate';
import type { ExportOptions } from './eln';

export async function renderDocx(record: SessionRecord, options: ExportOptions): Promise<Uint8Array> {
  assertSigned(record);
  const children: Paragraph[] = [
    new Paragraph({ text: record.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({ text: `Signed by ${record.signedBy} at ${record.signedAt}`, italics: true }),
      ],
    }),
    new Paragraph({ text: record.signOffStatement ?? '' }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'The body is the researcher\'s text. Unaccepted suggestions stay in the provenance line.',
          italics: true,
          size: 18,
        }),
      ],
    }),
  ];

  for (const section of SECTIONS) {
    const entries = record.utterances.filter((utterance) => utterance.section === section).sort((a, b) => a.order - b.order);
    if (entries.length === 0) continue;
    children.push(new Paragraph({ text: SECTION_LABELS[section], heading: HeadingLevel.HEADING_1 }));
    entries.forEach((entry, index) => {
      children.push(new Paragraph({ text: `${index + 1}. ${entry.startedAt}`, heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: entry.authoredText }));
      const audio = options.includeAudio && entry.audioUri ? ` Audio file audio/${entry.id}.wav.` : '';
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Source utterance ${entry.id}. Section ${entry.sectionSource}. Heard: ${entry.rawText}.${audio}`,
              italics: true,
              size: 18,
            }),
          ],
        }),
      );
    });
  }

  if (record.timers.length > 0) {
    children.push(new Paragraph({ text: 'Timers', heading: HeadingLevel.HEADING_1 }));
    for (const timer of record.timers) {
      children.push(
        new Paragraph({
          text: `${timer.label}: ${formatDuration(timer.durationMs)}, ${timer.status}, source ${timer.source}, command ${timer.commandId ?? 'none'}`,
        }),
      );
    }
  }

  if (record.photos.length > 0) {
    children.push(new Paragraph({ text: 'Photos', heading: HeadingLevel.HEADING_1 }));
    for (const photo of record.photos) {
      children.push(new Paragraph({ text: `${photo.capturedAt} ${photo.caption}` }));
      for (const suggestion of photo.suggestions.filter((item) => item.decision === 'accepted')) {
        children.push(new Paragraph({ text: `Accepted ${suggestion.kind} ${suggestion.value}. Evidence: ${suggestion.evidence}` }));
      }
    }
  }

  const document = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}
