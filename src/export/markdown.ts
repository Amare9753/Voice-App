import { SECTION_LABELS, SECTIONS } from '../domain/types';
import type { SessionRecord } from '../domain/types';
import { formatDuration } from '../domain/duration';
import { assertSigned } from './gate';
import type { ExportOptions } from './eln';

export function renderMarkdown(record: SessionRecord, options: ExportOptions): string {
  assertSigned(record);
  const lines: string[] = [
    `# ${record.title}`,
    '',
    `- Started: ${record.createdAt}`,
    `- Signed by: ${record.signedBy} at ${record.signedAt}`,
    `- Statement: ${record.signOffStatement ?? ''}`,
    '',
    'The text below is the researcher\'s text. Wording suggestions that were not accepted are recorded only as provenance.',
    '',
  ];

  for (const section of SECTIONS) {
    const entries = record.utterances.filter((utterance) => utterance.section === section).sort((a, b) => a.order - b.order);
    if (entries.length === 0) continue;
    lines.push(`## ${SECTION_LABELS[section]}`, '');
    entries.forEach((entry, index) => {
      lines.push(`### ${index + 1}. ${entry.startedAt}`, '', entry.authoredText, '');
      const provenance = [
        `Source utterance \`${entry.id}\`.`,
        `Section tag: ${entry.sectionSource}${entry.sectionConfirmed ? ', confirmed' : ', unconfirmed suggestion'}.`,
        entry.confidence === null ? 'Confidence: not reported.' : `Confidence: ${entry.confidence.toFixed(2)}.`,
      ];
      if (entry.authoredText !== entry.rawText) provenance.push(`Heard: ${entry.rawText}`);
      if (entry.normalization && entry.normalizationDecision !== 'accepted') {
        provenance.push(`Suggestion not applied (${entry.normalizationDecision}): ${entry.normalization.text}`);
      }
      if (options.includeAudio && entry.audioUri) {
        provenance.push(`Audio: audio/${entry.id}.wav (${entry.audioStartMs ?? 0}–${entry.audioEndMs ?? 'end'} ms).`);
      }
      lines.push(`> ${provenance.join(' ')}`, '');
    });
  }

  if (record.timers.length > 0) {
    lines.push('## Timers', '');
    for (const timer of record.timers) {
      lines.push(
        `- ${timer.label} (${formatDuration(timer.durationMs)}), ${timer.status}, source ${timer.source}, started ${timer.startedAt}${timer.commandId ? `, command ${timer.commandId}` : ''}`,
      );
    }
    lines.push('');
  }

  if (record.photos.length > 0) {
    lines.push('## Photos', '');
    for (const photo of record.photos) {
      lines.push(`### ${photo.capturedAt}`, '', photo.caption || 'Untitled photo', '');
      const accepted = photo.suggestions.filter((suggestion) => suggestion.decision === 'accepted');
      if (accepted.length === 0) lines.push('No accepted label suggestions.', '');
      for (const suggestion of accepted) {
        lines.push(`- Accepted ${suggestion.kind}: ${suggestion.value} (evidence: ${suggestion.evidence})`);
      }
      const pending = photo.suggestions.filter((suggestion) => suggestion.decision === 'pending').length;
      if (pending > 0) lines.push('', `${pending} pending suggestion(s) omitted.`);
      lines.push('');
    }
  }

  if (record.commands.length > 0) {
    lines.push('## Voice commands', '');
    for (const command of record.commands) {
      lines.push(`- ${command.occurredAt} ${command.kind}: ${command.rawText}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
