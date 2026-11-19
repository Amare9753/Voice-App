export interface VadOptions {
  speechRms: number;
  silenceMs: number;
  minSpeechMs: number;
}

export const DEFAULT_VAD: VadOptions = {
  speechRms: 0.015,
  silenceMs: 800,
  minSpeechMs: 250,
};

export interface VadState {
  inSpeech: boolean;
  speechMs: number;
  silenceMs: number;
}

export const INITIAL_VAD: VadState = { inSpeech: false, speechMs: 0, silenceMs: 0 };

export function rmsPcm16(pcm: Uint8Array): number {
  const samples = Math.floor(pcm.byteLength / 2);
  if (samples === 0) return 0;
  const view = new DataView(pcm.buffer, pcm.byteOffset, samples * 2);
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const value = view.getInt16(index * 2, true) / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / samples);
}

export function nextVad(
  state: VadState,
  rms: number,
  frameMs: number,
  options: VadOptions = DEFAULT_VAD,
): { state: VadState; speechEnded: boolean } {
  const speaking = rms >= options.speechRms;
  if (!state.inSpeech) {
    if (!speaking) return { state: { ...state, speechMs: 0 }, speechEnded: false };
    const speechMs = state.speechMs + frameMs;
    if (speechMs >= options.minSpeechMs) {
      return { state: { inSpeech: true, speechMs, silenceMs: 0 }, speechEnded: false };
    }
    return { state: { inSpeech: false, speechMs, silenceMs: 0 }, speechEnded: false };
  }
  if (speaking) {
    return { state: { inSpeech: true, speechMs: state.speechMs + frameMs, silenceMs: 0 }, speechEnded: false };
  }
  const silenceMs = state.silenceMs + frameMs;
  if (silenceMs >= options.silenceMs) {
    return { state: INITIAL_VAD, speechEnded: true };
  }
  return { state: { inSpeech: true, speechMs: state.speechMs, silenceMs }, speechEnded: false };
}
