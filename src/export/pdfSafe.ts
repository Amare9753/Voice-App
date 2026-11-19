const REPLACEMENTS: Record<string, string> = {
  β: 'beta',
  α: 'alpha',
  γ: 'gamma',
  Δ: 'delta',
  δ: 'delta',
  μ: 'µ',
  '–': '-',
  '—': '-',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '×': 'x',
  '−': '-',
};

export function toPdfSafeText(text: string): string {
  let out = '';
  for (const char of text) {
    if (REPLACEMENTS[char]) {
      out += REPLACEMENTS[char];
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    const printableAscii = code >= 32 && code <= 126;
    const latin1 = code >= 160 && code <= 255;
    const whitespace = code === 9 || code === 10 || code === 13;
    out += printableAscii || latin1 || whitespace ? char : '?';
  }
  return out;
}
