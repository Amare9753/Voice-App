import { Directory, File, Paths } from 'expo-file-system';
import { assertUserInitiatedNetwork } from '../../domain/networkPolicy';

export const MODEL_FILE_NAME = 'ggml-base.en.bin';
export const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';

export function modelDirectory(): Directory {
  const directory = new Directory(Paths.document, 'models');
  if (!directory.exists) directory.create();
  return directory;
}

export function modelFile(): File {
  return new File(modelDirectory(), MODEL_FILE_NAME);
}

export function speechModelStatus(): { installed: boolean; uri: string } {
  const file = modelFile();
  return { installed: file.exists, uri: file.uri };
}

export async function downloadSpeechModel(userInitiated: boolean): Promise<File> {
  assertUserInitiatedNetwork('download-speech-model', userInitiated);
  const destination = modelFile();
  if (destination.exists) destination.delete();
  return File.downloadFileAsync(MODEL_URL, destination, { idempotent: true });
}

export function deleteSpeechModel(): void {
  const file = modelFile();
  if (file.exists) file.delete();
}
