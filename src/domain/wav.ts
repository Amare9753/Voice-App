export interface DecodedWav {
  pcm: Uint8Array;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export function encodeWav(pcm: Uint8Array, sampleRate = 16_000, channels = 1, bitsPerSample = 16): Uint8Array {
  const data = pcm.byteLength % 2 === 0 ? pcm : pcm.slice(0, pcm.byteLength - 1);
  const buffer = new ArrayBuffer(44 + data.byteLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + data.byteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, data.byteLength, true);
  new Uint8Array(buffer, 44).set(data);
  return new Uint8Array(buffer);
}

export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Audio is not a WAV file.');
  }
  let offset = 12;
  let sampleRate = 16_000;
  let channels = 1;
  let bitsPerSample = 16;
  let dataStart = -1;
  let dataLength = 0;
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= view.byteLength) {
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      dataStart = body;
      dataLength = size;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (dataStart < 0) throw new Error('WAV file is missing audio data.');
  const end = Math.min(bytes.byteLength, dataStart + dataLength);
  return { pcm: bytes.slice(dataStart, end), sampleRate, channels, bitsPerSample };
}

export function resamplePcm16(pcm: Uint8Array, fromRate: number, toRate: number): Uint8Array {
  if (fromRate === toRate) return pcm;
  const input = pcm16Values(pcm);
  if (input.length === 0) return new Uint8Array();
  const outLength = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Int16Array(outLength);
  const ratio = fromRate / toRate;
  for (let index = 0; index < outLength; index += 1) {
    const position = index * ratio;
    const left = Math.min(input.length - 1, Math.floor(position));
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - Math.floor(position);
    const sample = input[left] * (1 - fraction) + input[right] * fraction;
    out[index] = clampInt16(Math.round(sample));
  }
  return new Uint8Array(out.buffer);
}

export function downmixToMono(pcm: Uint8Array, channels: number): Uint8Array {
  if (channels <= 1) return pcm;
  const values = pcm16Values(pcm);
  const frames = Math.floor(values.length / channels);
  const mono = new Int16Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) sum += values[frame * channels + channel];
    mono[frame] = clampInt16(Math.round(sum / channels));
  }
  return new Uint8Array(mono.buffer);
}

export function toWhisperWav(bytes: Uint8Array): Uint8Array {
  const decoded = decodeWav(bytes);
  if (decoded.bitsPerSample !== 16) {
    throw new Error(`Expected 16-bit PCM WAV, received ${decoded.bitsPerSample}-bit audio.`);
  }
  const mono = downmixToMono(decoded.pcm, decoded.channels);
  const pcm = decoded.sampleRate === 16_000 ? mono : resamplePcm16(mono, decoded.sampleRate, 16_000);
  if (decoded.sampleRate === 16_000 && decoded.channels === 1) return bytes;
  return encodeWav(pcm, 16_000, 1, 16);
}

function pcm16Values(pcm: Uint8Array): Int16Array {
  const length = pcm.byteLength - (pcm.byteLength % 2);
  const copy = pcm.slice(0, length);
  return new Int16Array(copy.buffer, copy.byteOffset, length / 2);
}

function clampInt16(value: number): number {
  return Math.max(-32768, Math.min(32767, value));
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(view.getUint8(offset + index));
  return text;
}
