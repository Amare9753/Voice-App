import { env, pipeline } from '@huggingface/transformers';
import { assertUserInitiatedNetwork } from '@core/domain/networkPolicy';
import { mapTimestampedChunks, type SpeechResult } from '@core/services/speech/mapResult';
import { whisperGenerationOptions } from '@core/services/speech/whisperOptions';

export const WHISPER_MODEL = 'Xenova/whisper-tiny.en';

type AsrOutput = {
  text: string;
  chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
};

type Asr = ((audio: Float32Array, options?: Record<string, unknown>) => Promise<AsrOutput>) & {
  tokenizer?: (text: string, options?: { add_special_tokens?: boolean }) => { input_ids?: { tolist?: () => Array<number[] | bigint[]> } };
};

let transcriber: Promise<Asr> | null = null;

export function configureWhisperRuntime(): void {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.useWasmCache = true;
  const onnx = env.backends.onnx as { wasm?: { numThreads?: number; wasmPaths?: unknown } };
  if (!onnx.wasm) return;
  onnx.wasm.numThreads = 1;
  const base = new URL(`${import.meta.env.BASE_URL}ort/`, window.location.href);
  onnx.wasm.wasmPaths = {
    mjs: new URL('ort-wasm-simd-threaded.mjs', base).href,
    wasm: new URL('ort-wasm-simd-threaded.wasm', base).href,
  };
}

export async function downloadWhisperModel(
  userInitiated: boolean,
  onProgress?: (message: string) => void,
): Promise<void> {
  assertUserInitiatedNetwork('download-speech-model', userInitiated);
  configureWhisperRuntime();
  env.allowRemoteModels = true;
  onProgress?.('Downloading the English tiny model into this browser.');
  transcriber = pipeline('automatic-speech-recognition', WHISPER_MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (event: { status?: string; file?: string; progress?: number }) => {
      if (!onProgress) return;
      const file = event.file ? ` ${event.file}` : '';
      const progress = typeof event.progress === 'number' ? ` ${Math.round(event.progress)}%` : '';
      onProgress(`${event.status ?? 'working'}${file}${progress}`);
    },
  }) as Promise<Asr>;
  await transcriber;
  onProgress?.('Model saved in this browser. Later transcriptions stay offline.');
}

export async function transcribeSamples(samples: Float32Array, prompt: string): Promise<SpeechResult> {
  configureWhisperRuntime();
  env.allowRemoteModels = false;
  if (!transcriber) {
    transcriber = pipeline('automatic-speech-recognition', WHISPER_MODEL, {
      dtype: 'q8',
      device: 'wasm',
      local_files_only: true,
    }) as Promise<Asr>;
  }
  const asr = await transcriber;
  const promptIds = vocabularyPromptIds(asr, prompt);
  const options = whisperGenerationOptions({ modelId: WHISPER_MODEL, promptIds });
  let output: AsrOutput;
  try {
    output = await asr(samples, { ...options });
  } catch (error) {
    if (!options.prompt_ids) throw error;
    output = await asr(samples, { ...whisperGenerationOptions({ modelId: WHISPER_MODEL }) });
  }
  return mapTimestampedChunks({
    text: output.text,
    engine: 'transformers.js',
    chunks: output.chunks?.map((chunk) => ({
      text: chunk.text,
      startSec: chunk.timestamp[0] ?? 0,
      endSec: chunk.timestamp[1],
    })),
  });
}

function vocabularyPromptIds(asr: Asr, prompt: string): number[] | undefined {
  if (!prompt.trim() || !asr.tokenizer) return undefined;
  try {
    const encoded = asr.tokenizer(`<|startofprev|> ${prompt}`, { add_special_tokens: false });
    const raw = encoded.input_ids?.tolist?.();
    const row = Array.isArray(raw?.[0]) ? raw[0] : raw;
    if (!Array.isArray(row) || row.length === 0) return undefined;
    return row.map((id) => Number(id));
  } catch {
    return undefined;
  }
}
