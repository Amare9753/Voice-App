import type { SectionId } from './types';

const KEYWORDS: Record<Exclude<SectionId, 'note'>, string[]> = {
  deviation: [
    'deviation',
    'unexpected',
    'unexpectedly',
    'instead',
    'failed',
    'failure',
    'error',
    'spilled',
    'spill',
    'wrong',
    'contaminated',
    'contamination',
    'anomaly',
    'anomalous',
    'accident',
  ],
  result: [
    'result',
    'results',
    'yield',
    'measured',
    'readout',
    'od600',
    'quantified',
    'quantification',
    'absorbance',
    'concentration was',
  ],
  observation: [
    'observed',
    'observation',
    'noticed',
    'notice',
    'saw',
    'appears',
    'appeared',
    'looks',
    'looked',
    'cloudy',
    'pellet',
    'band',
    'bands',
    'colony',
    'colonies',
    'turbid',
    'turbidity',
    'precipitate',
    'colour',
    'color',
  ],
  material: [
    'added',
    'reagent',
    'buffer',
    'stock',
    'catalog',
    'catalogue',
    'lot',
    'pipette',
    'pipetted',
    'aliquot',
    'supplier',
    'solution',
    'powder',
  ],
  procedure: [
    'incubate',
    'incubated',
    'incubation',
    'centrifuge',
    'centrifuged',
    'wash',
    'washed',
    'vortex',
    'vortexed',
    'resuspend',
    'resuspended',
    'transferred',
    'transfer',
    'spin',
    'spun',
    'protocol',
    'heated',
    'heat',
    'mixed',
    'mix',
    'step',
  ],
};

const TIE_BREAK: SectionId[] = ['deviation', 'result', 'observation', 'material', 'procedure', 'note'];

export interface Classification {
  section: SectionId;
  confidence: number;
  keywords: string[];
}

export function classifySection(text: string): Classification {
  const scores = new Map<SectionId, { score: number; keywords: string[] }>();
  for (const section of Object.keys(KEYWORDS) as Array<Exclude<SectionId, 'note'>>) {
    const hits: string[] = [];
    let score = 0;
    for (const keyword of KEYWORDS[section]) {
      const count = countKeyword(text, keyword);
      if (count > 0) {
        score += count;
        hits.push(keyword);
      }
    }
    scores.set(section, { score, keywords: hits });
  }
  scores.set('note', { score: 0, keywords: [] });

  let best: SectionId = 'note';
  let bestScore = 0;
  for (const section of TIE_BREAK) {
    const score = scores.get(section)?.score ?? 0;
    if (score > bestScore) {
      best = section;
      bestScore = score;
    }
  }
  const keywords = scores.get(best)?.keywords ?? [];
  const confidence = bestScore === 0 ? 0 : Math.min(0.95, 0.5 + 0.15 * bestScore);
  return { section: best, confidence, keywords };
}

function countKeyword(text: string, keyword: string): number {
  const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b`, 'gi');
  return text.match(pattern)?.length ?? 0;
}
