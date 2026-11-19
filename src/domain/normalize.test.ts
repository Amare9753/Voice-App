import { describe, expect, it } from 'vitest';
import { suggestNormalization } from './normalize';
import { vocabularyFromSeed } from './vocabulary';

const vocab = vocabularyFromSeed();

describe('suggestNormalization', () => {
  it('converts spoken volumes, temperatures, and concentrations', () => {
    expect(suggestNormalization('five microliters')?.text).toBe('5 µL');
    expect(suggestNormalization('five micro liters')?.text).toBe('5 µL');
    expect(suggestNormalization('5 ul of buffer')?.text).toBe('5 µL of buffer');
    expect(suggestNormalization('degrees C')?.text).toBe('°C');
    expect(suggestNormalization('twenty five degrees celsius')?.text).toBe('25 °C');
    expect(suggestNormalization('point five milliliters')?.text).toBe('0.5 mL');
    expect(suggestNormalization('two hundred microliters')?.text).toBe('200 µL');
    expect(suggestNormalization('ten millimolar')?.text).toBe('10 mM');
    expect(suggestNormalization('thirty seven degrees C for five minutes')?.text).toBe('37 °C for 5 min');
  });

  it('normalizes pH, dilutions, and half quantities', () => {
    expect(suggestNormalization('p h seven point four')?.text).toBe('pH 7.4');
    expect(suggestNormalization('ph 7.4')?.text).toBe('pH 7.4');
    expect(suggestNormalization('half a milliliter')?.text).toBe('0.5 mL');
    expect(suggestNormalization('two and a half hours')?.text).toBe('2.5 h');
    expect(suggestNormalization('one to ten dilution')?.text).toBe('1:10 dilution');
  });

  it('leaves ordinary prose and already canonical text unchanged', () => {
    expect(suggestNormalization('one of the bands is bright')).toBeNull();
    expect(suggestNormalization('5 µL at 25 °C')).toBeNull();
    expect(suggestNormalization('pH 7.4')).toBeNull();
  });

  it('suggests lab vocabulary without touching the surrounding words', () => {
    const suggestion = suggestNormalization('added etoh and dmso to the tube', vocab);
    expect(suggestion?.text).toBe('added ethanol and DMSO to the tube');
    expect(suggestion?.edits.map((edit) => edit.reason)).toEqual(['vocabulary:chemical', 'vocabulary:chemical']);
  });

  it('keeps original offsets so each edit traces to the utterance', () => {
    const suggestion = suggestNormalization('transfer five microliters', vocab);
    expect(suggestion?.edits[0]).toMatchObject({
      original: 'five microliters',
      replacement: '5 µL',
      reason: 'unit',
    });
    expect(suggestion?.edits[0].start).toBe('transfer '.length);
  });
});
