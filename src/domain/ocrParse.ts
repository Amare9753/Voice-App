import type { OcrSuggestionKind } from './types';

export interface ParsedLabelSuggestion {
  kind: OcrSuggestionKind;
  value: string;
  evidence: string;
}

const LOT_PATTERN =
  /\b(?:lot(?:\s*(?:no\.?|number|#))?|l\/n|batch(?:\s*(?:no\.?|number|#))?)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-]{2,})\b/gi;

const CATALOG_PATTERN =
  /\b(?:cat(?:alog(?:ue)?)?\.?(?:\s*(?:no\.?|number|#))?|catalogue|sku|ref(?:erence)?|product(?:\s*(?:no\.?|number|#))?|item(?:\s*(?:no\.?|number|#))?)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-]{2,})\b/gi;

export function parseLabelSuggestions(ocrText: string): ParsedLabelSuggestion[] {
  const found: ParsedLabelSuggestion[] = [];
  const seen = new Set<string>();
  collect(ocrText, LOT_PATTERN, 'lot', found, seen);
  collect(ocrText, CATALOG_PATTERN, 'catalog', found, seen);
  return found;
}

function collect(
  text: string,
  pattern: RegExp,
  kind: OcrSuggestionKind,
  found: ParsedLabelSuggestion[],
  seen: Set<string>,
): void {
  for (const match of text.matchAll(pattern)) {
    const value = match[1]?.toUpperCase();
    if (!value || !/[0-9]/.test(value)) continue;
    const key = `${kind}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ kind, value, evidence: match[0].trim() });
  }
}
