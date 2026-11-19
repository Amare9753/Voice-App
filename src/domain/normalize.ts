import { formatNumber, NUMBER_WORD, parseNumberExpression, takeNumberEndingAt, takeNumberStartingAt } from './numbers';
import type { NormalizationEdit, NormalizationSuggestion, VocabularyEntry } from './types';

interface Span {
  start: number;
  end: number;
  replacement: string;
  reason: string;
  priority: number;
}

const UNIT_SOURCE = [
  'micro\\s*lit(?:er|re)s?',
  'milli\\s*lit(?:er|re)s?',
  'micro\\s*grams?',
  'milli\\s*grams?',
  'nano\\s*grams?',
  'kilo\\s*grams?',
  'micro\\s*molars?',
  'milli\\s*molars?',
  'nano\\s*molars?',
  'micro\\s*moles?',
  'milli\\s*moles?',
  'nano\\s*moles?',
  'lit(?:er|re)s?',
  'grams?',
  'molars?',
  'moles?',
  'per\\s*cent',
  'percent',
  'minutes?',
  'mins?',
  'seconds?',
  'secs?',
  'hours?',
  'hrs?',
  'µl',
  'μl',
  'µg',
  'μg',
  'ul',
  'ml',
  'ug',
  'mg',
  'ng',
  'kg',
  'rpm',
  'g',
  'l',
].join('|');

const UNIT_SYMBOLS: Record<string, string> = {
  microliter: 'µL',
  microliters: 'µL',
  microlitre: 'µL',
  microlitres: 'µL',
  µl: 'µL',
  μl: 'µL',
  ul: 'µL',
  milliliter: 'mL',
  milliliters: 'mL',
  millilitre: 'mL',
  millilitres: 'mL',
  ml: 'mL',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
  l: 'L',
  microgram: 'µg',
  micrograms: 'µg',
  µg: 'µg',
  μg: 'µg',
  ug: 'µg',
  milligram: 'mg',
  milligrams: 'mg',
  mg: 'mg',
  nanogram: 'ng',
  nanograms: 'ng',
  ng: 'ng',
  kilogram: 'kg',
  kilograms: 'kg',
  kg: 'kg',
  gram: 'g',
  grams: 'g',
  g: 'g',
  micromolar: 'µM',
  micromolars: 'µM',
  millimolar: 'mM',
  millimolars: 'mM',
  nanomolar: 'nM',
  nanomolars: 'nM',
  molar: 'M',
  molars: 'M',
  micromole: 'µmol',
  micromoles: 'µmol',
  millimole: 'mmol',
  millimoles: 'mmol',
  nanomole: 'nmol',
  nanomoles: 'nmol',
  mole: 'mol',
  moles: 'mol',
  percent: '%',
  minute: 'min',
  minutes: 'min',
  min: 'min',
  mins: 'min',
  second: 's',
  seconds: 's',
  sec: 's',
  secs: 's',
  hour: 'h',
  hours: 'h',
  hr: 'h',
  hrs: 'h',
  rpm: 'rpm',
};

export function suggestNormalization(
  text: string,
  vocabulary: VocabularyEntry[] = [],
): NormalizationSuggestion | null {
  const spans = resolveSpans([
    ...findDegrees(text),
    ...findPh(text),
    ...findUnits(text),
    ...findDilutions(text),
    ...findVocabulary(text, vocabulary),
  ]);
  if (spans.length === 0) return null;
  let suggested = '';
  let cursor = 0;
  const edits: NormalizationEdit[] = [];
  for (const span of spans) {
    suggested += text.slice(cursor, span.start);
    suggested += span.replacement;
    edits.push({
      start: span.start,
      end: span.end,
      original: text.slice(span.start, span.end),
      replacement: span.replacement,
      reason: span.reason,
    });
    cursor = span.end;
  }
  suggested += text.slice(cursor);
  return { text: suggested, edits };
}

export function canonicalUnit(raw: string): string | null {
  const key = raw.toLowerCase().replace(/\s+/g, '');
  return UNIT_SYMBOLS[key] ?? null;
}

function findDegrees(text: string): Span[] {
  const spans: Span[] = [];
  const pattern = /\b(?:degrees?|deg\.?)\s+(celsius|centigrade|fahrenheit|c|f)\b/gi;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const scale = match[1].toLowerCase();
    const symbol = scale.startsWith('f') ? '°F' : '°C';
    const headStart = match.index;
    const headEnd = headStart + match[0].length;
    const number = takeNumberEndingAt(text, headStart);
    const adjacent = number !== null && /^\s*$/.test(text.slice(number.end, headStart));
    const start = adjacent && number ? number.start : headStart;
    const replacement = adjacent && number ? `${formatNumber(number.value)} ${symbol}` : symbol;
    pushIfChanged(spans, text, start, headEnd, replacement, 'temperature', 5);
  }
  return spans;
}

function findPh(text: string): Span[] {
  const spans: Span[] = [];
  const pattern = /\bp\s*\.?\s*h\b(?:\s+(?:of|is|was|at|equals))?/gi;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    let cursor = match.index + match[0].length;
    while (cursor < text.length && /\s/.test(text[cursor] ?? '')) cursor += 1;
    const number = takeNumberStartingAt(text, cursor);
    if (!number) continue;
    pushIfChanged(spans, text, match.index, number.end, `pH ${formatNumber(number.value)}`, 'ph', 5);
  }
  return spans;
}

function findUnits(text: string): Span[] {
  const spans: Span[] = [];
  const pattern = new RegExp(UNIT_SOURCE, 'gi');
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const raw = match[0];
    const symbol = canonicalUnit(raw);
    if (!symbol) continue;
    if (!hasUnitBoundary(text, match.index, raw.length)) continue;
    const number = takeNumberEndingAt(text, match.index);
    if (!number || !/^\s*$/.test(text.slice(number.end, match.index))) continue;
    const replacement = symbol === '%' ? `${formatNumber(number.value)}%` : `${formatNumber(number.value)} ${symbol}`;
    pushIfChanged(spans, text, number.start, match.index + raw.length, replacement, 'unit', 4);
  }
  return spans;
}

function findDilutions(text: string): Span[] {
  const spans: Span[] = [];
  const pattern = new RegExp(
    `\\b(${NUMBER_WORD}|\\d+(?:\\.\\d+)?)(?:\\s+(?:${NUMBER_WORD})){0,6}\\s+(?:to|in)\\s+(?:${NUMBER_WORD}|\\d+(?:\\.\\d+)?)(?:\\s+(?:${NUMBER_WORD})){0,6}(?=\\s+dilution\\b)`,
    'gi',
  );
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const parts = match[0].split(/\s+(?:to|in)\s+/i);
    if (parts.length !== 2) continue;
    const left = parseNumberExpression(parts[0]);
    const right = parseNumberExpression(parts[1]);
    if (left === null || right === null) continue;
    pushIfChanged(
      spans,
      text,
      match.index,
      match.index + match[0].length,
      `${formatNumber(left)}:${formatNumber(right)}`,
      'dilution',
      4,
    );
  }
  return spans;
}

function findVocabulary(text: string, vocabulary: VocabularyEntry[]): Span[] {
  const spans: Span[] = [];
  const sorted = [...vocabulary].sort((a, b) => b.spoken.trim().length - a.spoken.trim().length);
  for (const entry of sorted) {
    const spoken = entry.spoken.trim();
    const canonical = entry.canonical.trim();
    if (!spoken || !canonical) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(spoken).replace(/\\ /g, '\\s+')}\\b`, 'gi');
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      if (match[0] === canonical) continue;
      pushIfChanged(spans, text, match.index, match.index + match[0].length, canonical, `vocabulary:${entry.kind}`, 2);
    }
  }
  return spans;
}

function pushIfChanged(
  spans: Span[],
  text: string,
  start: number,
  end: number,
  replacement: string,
  reason: string,
  priority: number,
): void {
  if (start < 0 || end <= start || end > text.length) return;
  if (text.slice(start, end) === replacement) return;
  spans.push({ start, end, replacement, reason, priority });
}

function resolveSpans(spans: Span[]): Span[] {
  const ordered = [...spans].sort(
    (a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const chosen: Span[] = [];
  for (const span of ordered) {
    if (chosen.some((kept) => span.start < kept.end && span.end > kept.start)) continue;
    chosen.push(span);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

function hasUnitBoundary(text: string, index: number, length: number): boolean {
  const prev = index > 0 ? text[index - 1] : '';
  const next = text[index + length] ?? '';
  if (prev && /[A-Za-zµμ]/.test(prev)) return false;
  if (next && /[A-Za-zµμ]/.test(next)) return false;
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
