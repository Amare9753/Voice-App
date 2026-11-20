export interface WhisperGenerationOptions {
  return_timestamps: true;
  language?: 'en';
  task?: 'transcribe';
  prompt_ids?: number[];
}

export function isEnglishOnlyWhisperModel(modelId: string): boolean {
  const name = (modelId.trim().split(/[/\\]/).pop() ?? modelId).toLowerCase();
  return name.endsWith('.en');
}

export function whisperGenerationOptions(input: {
  modelId: string;
  promptIds?: number[] | null;
}): WhisperGenerationOptions {
  const options: WhisperGenerationOptions = { return_timestamps: true };
  if (!isEnglishOnlyWhisperModel(input.modelId)) {
    options.language = 'en';
    options.task = 'transcribe';
  }
  const promptIds = (input.promptIds ?? []).filter((id) => Number.isFinite(id));
  if (promptIds.length > 0) options.prompt_ids = promptIds;
  return options;
}
