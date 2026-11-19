export interface SpeechSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
}

export interface SpeechResult {
  text: string;
  segments: SpeechSegment[];
  engine: string;
}

export interface WhisperLikeSegment {
  text: string;
  t0: number;
  t1: number;
  avg_logprob?: number;
  avgLogprob?: number;
  probability?: number;
}

export function whisperTimeToMs(timestamp: number): number {
  return Math.max(0, Math.round(timestamp * 10));
}

export function confidenceFromSegment(segment: WhisperLikeSegment): number | null {
  const logprob = segment.avg_logprob ?? segment.avgLogprob;
  if (typeof logprob === 'number' && Number.isFinite(logprob)) {
    return clamp01(Math.exp(logprob));
  }
  if (typeof segment.probability === 'number' && Number.isFinite(segment.probability)) {
    return clamp01(segment.probability);
  }
  return null;
}

export function mapWhisperResult(input: {
  result: string;
  segments?: WhisperLikeSegment[];
  durationMs?: number;
}): SpeechResult {
  const segments = (input.segments ?? [])
    .map((segment) => ({
      text: cleanTranscript(segment.text),
      startMs: whisperTimeToMs(segment.t0),
      endMs: whisperTimeToMs(segment.t1),
      confidence: confidenceFromSegment(segment),
    }))
    .filter((segment) => segment.text.length > 0 && !isBlankAudio(segment.text));
  const text = cleanTranscript(input.result);
  if (segments.length === 0 && text && !isBlankAudio(text)) {
    segments.push({
      text,
      startMs: 0,
      endMs: input.durationMs ?? 0,
      confidence: null,
    });
  }
  return {
    text: segments.map((segment) => segment.text).join(' ').trim(),
    segments,
    engine: 'whisper.rn',
  };
}

export function cleanTranscript(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function isBlankAudio(text: string): boolean {
  return /^\[?\s*blank[_\s-]*audio\s*\]?$/i.test(text) || /^\[?\s*silence\s*\]?$/i.test(text);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
