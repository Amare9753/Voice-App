declare module 'whisper.rn' {
  export interface WhisperContext {
    transcribe(
      filePath: string,
      options?: { language?: string; prompt?: string; temperature?: number },
    ): {
      promise: Promise<{
        result: string;
        segments: Array<{ text: string; t0: number; t1: number; avg_logprob?: number; probability?: number }>;
      }>;
    };
  }

  export function initWhisper(options: { filePath: string; useGpu?: boolean }): Promise<WhisperContext>;
}
