import { NUMBER_WORD, parseNumberExpression } from './numbers';

const UNIT_MS: Record<string, number> = {
  hour: 3_600_000,
  hours: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  h: 3_600_000,
  minute: 60_000,
  minutes: 60_000,
  min: 60_000,
  mins: 60_000,
  m: 60_000,
  second: 1_000,
  seconds: 1_000,
  sec: 1_000,
  secs: 1_000,
  s: 1_000,
};

export interface DurationPrefix {
  ms: number;
  rest: string;
}

export function parseDurationPrefix(input: string): DurationPrefix | null {
  let remaining = input.trim();
  let total = 0;
  let matched = false;
  const pattern = new RegExp(
    `^(\\d+(?:\\.\\d+)?|(?:${NUMBER_WORD})(?:\\s+(?:${NUMBER_WORD})){0,6})\\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?|min|sec|hr|h|m|s)\\b\\s*`,
    'i',
  );
  while (remaining) {
    const match = remaining.match(pattern);
    if (!match) break;
    const value = parseNumberExpression(match[1]);
    const unit = UNIT_MS[match[2].toLowerCase()];
    if (value === null || value < 0 || !unit) break;
    total += Math.round(value * unit);
    remaining = remaining.slice(match[0].length);
    matched = true;
  }
  if (!matched || total <= 0) return null;
  return { ms: total, rest: remaining.trim() };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0 && seconds === 0) return `${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

export function remainingMs(startedAt: string, durationMs: number, nowIso: string): number {
  const started = Date.parse(startedAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(started) || !Number.isFinite(now)) return durationMs;
  return Math.max(0, durationMs - (now - started));
}
