import { describe, expect, it } from 'vitest';
import { isEnglishOnlyWhisperModel, whisperGenerationOptions } from './whisperOptions';

const PROMPT = [50361, 882, 13];

describe('whisper generation options', () => {
  it('treats .en checkpoints as English-only', () => {
    expect(isEnglishOnlyWhisperModel('Xenova/whisper-tiny.en')).toBe(true);
    expect(isEnglishOnlyWhisperModel('Xenova/whisper-base.en')).toBe(true);
    expect(isEnglishOnlyWhisperModel('openai/whisper-small.en')).toBe(true);
    expect(isEnglishOnlyWhisperModel('Xenova/whisper-tiny')).toBe(false);
    expect(isEnglishOnlyWhisperModel('Xenova/whisper-small')).toBe(false);
    expect(isEnglishOnlyWhisperModel('openai/whisper-large-v3')).toBe(false);
  });

  it('omits task and language for English-only models and still passes the vocabulary prompt', () => {
    const options = whisperGenerationOptions({
      modelId: 'Xenova/whisper-tiny.en',
      promptIds: PROMPT,
    });
    expect(options).toEqual({
      return_timestamps: true,
      prompt_ids: PROMPT,
    });
    expect(options).not.toHaveProperty('language');
    expect(options).not.toHaveProperty('task');
  });

  it('passes task and language for multilingual models along with the vocabulary prompt', () => {
    expect(whisperGenerationOptions({ modelId: 'Xenova/whisper-small', promptIds: PROMPT })).toEqual({
      return_timestamps: true,
      language: 'en',
      task: 'transcribe',
      prompt_ids: PROMPT,
    });
  });

  it('leaves the prompt out when there are no token ids', () => {
    expect(whisperGenerationOptions({ modelId: 'Xenova/whisper-base.en', promptIds: [] })).toEqual({
      return_timestamps: true,
    });
    expect(whisperGenerationOptions({ modelId: 'Xenova/whisper-tiny' })).toEqual({
      return_timestamps: true,
      language: 'en',
      task: 'transcribe',
    });
  });
});
