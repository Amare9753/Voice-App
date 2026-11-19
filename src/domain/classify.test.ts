import { describe, expect, it } from 'vitest';
import { classifySection } from './classify';

describe('classifySection', () => {
  it('tags bench language by keyword and falls back to note', () => {
    expect(classifySection('the pellet looks cloudy').section).toBe('observation');
    expect(classifySection('unexpected spill on the bench').section).toBe('deviation');
    expect(classifySection('added stock buffer from the aliquot').section).toBe('material');
    expect(classifySection('the yield was measured by absorbance').section).toBe('result');
    expect(classifySection('incubate then centrifuge the tube').section).toBe('procedure');
    expect(classifySection('hello there').section).toBe('note');
  });

  it('uses the stronger keyword score, with deviations winning an equal score', () => {
    const stronger = classifySection('observed an unexpected error');
    expect(stronger.section).toBe('deviation');
    expect(stronger.keywords).toEqual(expect.arrayContaining(['unexpected', 'error']));
    const tied = classifySection('unexpected pellet');
    expect(tied.section).toBe('deviation');
    expect(tied.confidence).toBeGreaterThan(0.5);
  });
});
