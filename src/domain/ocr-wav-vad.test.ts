import { describe, expect, it } from 'vitest';
import { parseLabelSuggestions } from './ocrParse';
import { decodeWav, encodeWav, resamplePcm16, toWhisperWav } from './wav';
import { INITIAL_VAD, nextVad, rmsPcm16 } from './vad';
import { confidenceFromSegment, mapWhisperResult, whisperTimeToMs } from '../services/speech/mapResult';
import { buildAsrPrompt, vocabularyFromSeed } from './vocabulary';
import { assertUserInitiatedNetwork } from './networkPolicy';

describe('label OCR suggestions', () => {
  it('suggests lot and catalog numbers without treating them as accepted', () => {
    const suggestions = parseLabelSuggestions('Reagent label\nLot No: AB-12345\nCat. No. Q9981\nLot AB-12345');
    expect(suggestions).toEqual([
      { kind: 'lot', value: 'AB-12345', evidence: 'Lot No: AB-12345' },
      { kind: 'catalog', value: 'Q9981', evidence: 'Cat. No. Q9981' },
    ]);
  });
});

describe('wav and voice activity', () => {
  it('round-trips 16 kHz PCM and resamples to the whisper rate', () => {
    const pcm = new Int16Array([0, 16000, -16000, 8000]);
    const wav = encodeWav(new Uint8Array(pcm.buffer), 8_000, 1, 16);
    const decoded = decodeWav(wav);
    expect(decoded.sampleRate).toBe(8_000);
    expect(Array.from(new Int16Array(decoded.pcm.buffer))).toEqual([0, 16000, -16000, 8000]);
    const whisper = toWhisperWav(wav);
    const ready = decodeWav(whisper);
    expect(ready.sampleRate).toBe(16_000);
    expect(ready.channels).toBe(1);
    expect(ready.pcm.byteLength).toBeGreaterThan(pcm.byteLength);
    expect(resamplePcm16(decoded.pcm, 16_000, 16_000)).toBe(decoded.pcm);
  });

  it('ends a speech region after sustained silence', () => {
    const loud = new Int16Array(160);
    loud.fill(10_000);
    const quiet = new Int16Array(160);
    expect(rmsPcm16(new Uint8Array(loud.buffer))).toBeGreaterThan(0.2);
    let state = INITIAL_VAD;
    let ended = false;
    for (let frame = 0; frame < 5; frame += 1) {
      const step = nextVad(state, rmsPcm16(new Uint8Array(loud.buffer)), 100);
      state = step.state;
    }
    expect(state.inSpeech).toBe(true);
    for (let frame = 0; frame < 9; frame += 1) {
      const step = nextVad(state, rmsPcm16(new Uint8Array(quiet.buffer)), 100);
      state = step.state;
      ended = ended || step.speechEnded;
    }
    expect(ended).toBe(true);
    expect(state.inSpeech).toBe(false);
  });
});

describe('speech mapping and prompt', () => {
  it('converts whisper centisecond timestamps and keeps reported confidence', () => {
    expect(whisperTimeToMs(320)).toBe(3200);
    expect(confidenceFromSegment({ text: 'gel', t0: 0, t1: 10, avg_logprob: Math.log(0.5) })).toBeCloseTo(0.5);
    const mapped = mapWhisperResult({
      result: ' two bands ',
      segments: [{ text: ' two bands ', t0: 10, t1: 40, probability: 0.42 }],
    });
    expect(mapped.segments[0]).toMatchObject({ text: 'two bands', startMs: 100, endMs: 400, confidence: 0.42 });
  });

  it('builds a bounded on-device prompt from the researcher vocabulary', () => {
    const prompt = buildAsrPrompt(vocabularyFromSeed(), 120);
    expect(prompt.startsWith('Lab notebook dictation.')).toBe(true);
    expect(prompt.length).toBeLessThanOrEqual(120);
    expect(prompt).toContain('ethanol');
  });

  it('refuses background network use', () => {
    expect(() => assertUserInitiatedNetwork('download-speech-model', false)).toThrow(/network/i);
    expect(() => assertUserInitiatedNetwork('download-speech-model', true)).not.toThrow();
  });
});
