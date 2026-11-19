import { initWhisper, type WhisperContext } from 'whisper.rn';
import { modelFile } from '../model/speechModel';
import { mapWhisperResult, type SpeechResult } from './mapResult';

let loading: Promise<WhisperContext> | null = null;
let loadedPath = '';

export async function transcribeWithWhisper(wavPath: string, prompt: string): Promise<SpeechResult> {
  const model = modelFile();
  if (!model.exists) {
    throw new Error('No speech model on this device. Open Speech model and download or copy ggml-base.en.bin.');
  }
  if (!loading || loadedPath !== model.uri) {
    loadedPath = model.uri;
    loading = initWhisper({ filePath: model.uri, useGpu: true });
  }
  const context = await loading;
  const { promise } = context.transcribe(wavPath, {
    language: 'en',
    prompt,
    temperature: 0,
  });
  const result = await promise;
  return mapWhisperResult({ result: result.result, segments: result.segments });
}
