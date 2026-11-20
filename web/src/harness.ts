import { suggestNormalization } from '@core/domain/normalize';
import { vocabularyFromSeed } from '@core/domain/vocabulary';
import { resampleFloat32 } from '@core/domain/wav';
import { downloadWhisperModel, transcribeSamples } from './speech/whisperWeb';

const out = document.querySelector('#out');

async function run(): Promise<void> {
  await downloadWhisperModel(true, (message) => {
    if (out) out.textContent = message;
  });
  const response = await fetch('/samples/jfk.wav');
  if (!response.ok) throw new Error(`Sample audio missing (${response.status}).`);
  const context = new AudioContext();
  const decoded = await context.decodeAudioData(await response.arrayBuffer());
  const mono = decoded.getChannelData(0);
  const samples = resampleFloat32(mono, decoded.sampleRate, 16_000);
  const prompt = 'Lab notebook dictation. Expected terms: DMSO, ethanol, OD600';
  const speech = await transcribeSamples(samples, prompt);
  const suggestion = suggestNormalization('added five microliters of dmso', vocabularyFromSeed());
  const payload = {
    text: speech.text,
    segments: speech.segments.length,
    suggestion: suggestion?.text ?? null,
  };
  if (out) out.textContent = JSON.stringify(payload);
  (window as unknown as { __result?: unknown }).__result = payload;
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (out) out.textContent = `ERROR ${message}`;
  (window as unknown as { __result?: unknown }).__result = { error: message };
});
