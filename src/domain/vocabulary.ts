import type { VocabularyEntry, VocabularyKind } from './types';

export interface VocabularySeed {
  spoken: string;
  canonical: string;
  kind: VocabularyKind;
}

export const DEFAULT_VOCABULARY: VocabularySeed[] = [
  { spoken: 'etoh', canonical: 'ethanol', kind: 'chemical' },
  { spoken: 'dmso', canonical: 'DMSO', kind: 'chemical' },
  { spoken: 'edta', canonical: 'EDTA', kind: 'chemical' },
  { spoken: 'pbs', canonical: 'PBS', kind: 'term' },
  { spoken: 'sds page', canonical: 'SDS-PAGE', kind: 'term' },
  { spoken: 'taq', canonical: 'Taq polymerase', kind: 'term' },
  { spoken: 'taq polymerase', canonical: 'Taq polymerase', kind: 'term' },
  { spoken: 'dnase', canonical: 'DNase', kind: 'term' },
  { spoken: 'rnase', canonical: 'RNase', kind: 'term' },
  { spoken: 'dntp', canonical: 'dNTP', kind: 'term' },
  { spoken: 'dntps', canonical: 'dNTPs', kind: 'term' },
  { spoken: 'tris', canonical: 'Tris', kind: 'chemical' },
  { spoken: 'hepes', canonical: 'HEPES', kind: 'chemical' },
  { spoken: 'iptg', canonical: 'IPTG', kind: 'chemical' },
  { spoken: 'x gal', canonical: 'X-gal', kind: 'chemical' },
  { spoken: 'beta mercaptoethanol', canonical: 'β-mercaptoethanol', kind: 'chemical' },
  { spoken: 'od600', canonical: 'OD600', kind: 'term' },
  { spoken: 'o d 600', canonical: 'OD600', kind: 'term' },
  { spoken: 'nanodrop', canonical: 'NanoDrop', kind: 'term' },
  { spoken: 'qpcr', canonical: 'qPCR', kind: 'term' },
  { spoken: 'rt pcr', canonical: 'RT-PCR', kind: 'term' },
  { spoken: 'sds', canonical: 'SDS', kind: 'chemical' },
  { spoken: 'bsa', canonical: 'BSA', kind: 'chemical' },
  { spoken: 'dtt', canonical: 'DTT', kind: 'chemical' },
  { spoken: 'tween 20', canonical: 'Tween-20', kind: 'chemical' },
  { spoken: 'trizol', canonical: 'TRIzol', kind: 'chemical' },
  { spoken: 'neb', canonical: 'NEB', kind: 'term' },
  { spoken: 'gibco', canonical: 'Gibco', kind: 'term' },
];

export function vocabularyFromSeed(seed: VocabularySeed[] = DEFAULT_VOCABULARY): VocabularyEntry[] {
  return seed.map((entry) => ({
    id: `vocab-${entry.spoken.replace(/[^a-z0-9]+/gi, '-')}`,
    spoken: entry.spoken,
    canonical: entry.canonical,
    kind: entry.kind,
  }));
}

export function buildAsrPrompt(entries: VocabularyEntry[], limit = 800): string {
  const prefix = 'Lab notebook dictation. Expected terms: ';
  const seen = new Set<string>();
  let body = '';
  for (const entry of entries) {
    const term = entry.canonical.trim();
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    const next = body ? `${body}, ${term}` : term;
    if ((prefix + next).length > limit) break;
    body = next;
  }
  return prefix + body;
}

export function addVocabularyEntry(entries: VocabularyEntry[], entry: VocabularyEntry): VocabularyEntry[] {
  const spoken = entry.spoken.trim().toLowerCase();
  const without = entries.filter((item) => item.spoken.trim().toLowerCase() !== spoken && item.id !== entry.id);
  return [...without, { ...entry, spoken: entry.spoken.trim(), canonical: entry.canonical.trim() }];
}

export function removeVocabularyEntry(entries: VocabularyEntry[], id: string): VocabularyEntry[] {
  return entries.filter((entry) => entry.id !== id);
}
