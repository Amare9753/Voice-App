export interface LabelOcrResult {
  text: string;
  engine: string;
}

export async function recognizeLabel(uri: string): Promise<LabelOcrResult> {
  const extractor = await import('expo-text-extractor');
  if (!extractor.isSupported) {
    return { text: '', engine: 'unavailable' };
  }
  const lines = await extractor.extractTextFromImage(uri);
  return { text: lines.join('\n'), engine: 'expo-text-extractor' };
}
