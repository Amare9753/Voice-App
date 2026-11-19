const SMALL: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

export const NUMBER_WORD =
  'zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|a|an|half|point';

const NUMBER_EXPR = `(?:\\d+(?:\\.\\d+)?|(?:${NUMBER_WORD})(?:\\s+(?:${NUMBER_WORD})){0,7})`;

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0)) return '0';
  return String(rounded);
}

export function parseNumberExpression(expr: string): number | null {
  const tokens = expr.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length === 1 && /^\d+(?:\.\d+)?$/.test(tokens[0])) return Number(tokens[0]);
  if (tokens.length === 1 && tokens[0] === 'half') return 0.5;
  if (tokens.length === 2 && tokens[0] === 'half' && (tokens[1] === 'a' || tokens[1] === 'an')) return 0.5;
  if (tokens.length === 2 && tokens[0] === 'a' && tokens[1] === 'half') return 0.5;

  const joined = tokens.join(' ');
  const half = joined.match(/^(.*?)(?:\s+and)?\s+a\s+half$/);
  if (half) {
    const baseExpr = half[1].trim();
    if (!baseExpr) return 0.5;
    const base = parseNumberExpression(baseExpr);
    if (base === null) return null;
    return base + 0.5;
  }

  if (tokens.includes('point')) {
    const pointAt = tokens.indexOf('point');
    if (tokens.indexOf('point', pointAt + 1) !== -1) return null;
    const intTokens = tokens.slice(0, pointAt).filter((token) => token !== 'and');
    const fracTokens = tokens.slice(pointAt + 1);
    if (fracTokens.length === 0 || !fracTokens.every(isSingleDigit)) return null;
    const intVal = intTokens.length === 0 ? 0 : parseIntegerTokens(intTokens);
    if (intVal === null || !Number.isInteger(intVal)) return null;
    return Number(`${intVal}.${fracTokens.map(digitOf).join('')}`);
  }

  return parseIntegerTokens(tokens.filter((token) => token !== 'and'));
}

export interface NumberMatch {
  start: number;
  end: number;
  value: number;
}

export function takeNumberEndingAt(text: string, end: number): NumberMatch | null {
  const trimmedEnd = trimIndexLeft(text, end);
  const windowStart = Math.max(0, trimmedEnd - 80);
  const window = text.slice(windowStart, trimmedEnd);
  const match = window.match(new RegExp(`(?:${NUMBER_EXPR})$`, 'i'));
  if (!match || match.index === undefined) return null;
  let expr = match[0];
  let start = windowStart + match.index;
  while (expr) {
    const value = parseNumberExpression(expr);
    if (value !== null) return { start, end: start + expr.length, value };
    const next = expr.replace(/^\s*\S+\s*/, '');
    if (!next || next === expr) break;
    start += expr.length - next.length;
    expr = next;
  }
  return null;
}

export function takeNumberStartingAt(text: string, index: number): NumberMatch | null {
  const slice = text.slice(index);
  const match = slice.match(new RegExp(`^(?:${NUMBER_EXPR})`, 'i'));
  if (!match) return null;
  let expr = match[0];
  while (expr) {
    const value = parseNumberExpression(expr);
    if (value !== null) return { start: index, end: index + expr.length, value };
    const next = expr.replace(/\s+\S+\s*$/, '').trim();
    if (!next || next === expr) break;
    expr = next;
  }
  return null;
}

function parseIntegerTokens(tokens: string[]): number | null {
  if (tokens.length === 0) return null;
  if (tokens.length === 1 && /^\d+(?:\.\d+)?$/.test(tokens[0])) return Number(tokens[0]);
  let total = 0;
  let current = 0;
  let seen = false;
  for (const token of tokens) {
    if (token in SMALL) {
      if (current >= 20 && current % 10 === 0) current += SMALL[token];
      else if (current === 0) current = SMALL[token];
      else return null;
      seen = true;
      continue;
    }
    if (token in TENS) {
      if (current !== 0) return null;
      current = TENS[token];
      seen = true;
      continue;
    }
    if (token === 'hundred') {
      current = (current || 1) * 100;
      seen = true;
      continue;
    }
    if (token === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
      continue;
    }
    if (token === 'a' || token === 'an') {
      if (current !== 0) return null;
      current = 1;
      seen = true;
      continue;
    }
    return null;
  }
  if (!seen) return null;
  return total + current;
}

function isSingleDigit(token: string): boolean {
  if (/^\d$/.test(token)) return true;
  return token in SMALL && SMALL[token] <= 9;
}

function digitOf(token: string): string {
  if (/^\d$/.test(token)) return token;
  return String(SMALL[token]);
}

function trimIndexLeft(text: string, end: number): number {
  let index = end;
  while (index > 0 && /\s/.test(text[index - 1] ?? '')) index -= 1;
  return index;
}
