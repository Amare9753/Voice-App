import { parseDurationPrefix, formatDuration } from './duration';
import type { SectionId } from './types';
import { SECTIONS } from './types';

const SECTION_PATTERN = SECTIONS.join('|');

export type ParsedCommand =
  | { type: 'set-section'; section: SectionId }
  | { type: 'content'; voiceSection: SectionId | null }
  | { type: 'start-timer'; durationMs: number; label: string }
  | { type: 'stop-timer' }
  | { type: 'cancel-timer' }
  | { type: 'take-photo' };

export function parseCommand(raw: string): ParsedCommand {
  const cleaned = raw.trim().replace(/[.!?]+$/g, '').trim();
  const folded = cleaned.replace(/\s+/g, ' ');

  const timer = folded.match(/^(?:please\s+)?(?:start\s+)?timer(?:\s+for)?\s+(.+)$/i);
  if (timer) {
    const duration = parseDurationPrefix(timer[1]);
    if (duration) {
      return {
        type: 'start-timer',
        durationMs: duration.ms,
        label: duration.rest || formatDuration(duration.ms),
      };
    }
  }

  if (/^(?:please\s+)?(?:stop|end)\s+timer$/i.test(folded)) return { type: 'stop-timer' };
  if (/^(?:please\s+)?cancel\s+timer$/i.test(folded)) return { type: 'cancel-timer' };
  if (/^(?:please\s+)?(?:take|snap|capture)\s+(?:a\s+)?(?:photo|picture|image)$/i.test(folded)) {
    return { type: 'take-photo' };
  }

  const sectionOnly = folded.match(
    new RegExp(
      `^(?:please\\s+)?(?:(?:new|next)\\s+)?(?:(?:section|tag|mark|label)(?:\\s+as)?|switch\\s+to(?:\\s+section)?)\\s+(${SECTION_PATTERN})$`,
      'i',
    ),
  );
  if (sectionOnly) return { type: 'set-section', section: normalizeSection(sectionOnly[1]) };

  const bareSection = folded.match(new RegExp(`^(${SECTION_PATTERN})$`, 'i'));
  if (bareSection) return { type: 'set-section', section: normalizeSection(bareSection[1]) };

  const sectionContent = folded.match(
    new RegExp(`^(?:section\\s+)?(${SECTION_PATTERN})\\s*[:\\-—]\\s+(.+)$`, 'i'),
  );
  if (sectionContent && sectionContent[2].trim()) {
    return { type: 'content', voiceSection: normalizeSection(sectionContent[1]) };
  }

  const tagged = folded.match(
    new RegExp(`^(?:tag|mark|label)\\s+as\\s+(${SECTION_PATTERN})\\s+(.+)$`, 'i'),
  );
  if (tagged) return { type: 'content', voiceSection: normalizeSection(tagged[1]) };

  return { type: 'content', voiceSection: null };
}

function normalizeSection(value: string): SectionId {
  return value.toLowerCase() as SectionId;
}
