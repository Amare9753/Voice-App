import { useRef } from 'react';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';

export interface RecordedClip {
  uri: string;
  durationMs: number;
  sampleRate: number;
}

export function useBenchRecorder(onPcm: (pcm: Uint8Array, sampleRate: number) => void) {
  const onPcmRef = useRef(onPcm);
  onPcmRef.current = onPcm;
  const fileOpen = useRef(false);
  const { stream } = useAudioStream({
    sampleRate: 16_000,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => {
      onPcmRef.current(new Uint8Array(buffer.data), buffer.sampleRate);
    },
  });

  async function ensureStarted(): Promise<void> {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Microphone permission is off. Core Capture records only on this device.');
    }
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      allowsRecording: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
    if (!stream.isStreaming) await stream.start();
  }

  async function startClip(): Promise<void> {
    await ensureStarted();
    if (fileOpen.current) return;
    await stream.startFileRecordingAsync({ format: 'wav', directory: 'document' });
    fileOpen.current = true;
  }

  async function stopClip(): Promise<RecordedClip | null> {
    if (!fileOpen.current) return null;
    const result = await stream.stopFileRecordingAsync();
    fileOpen.current = false;
    return {
      uri: result.uri,
      durationMs: Math.round(result.duration * 1000),
      sampleRate: result.sampleRate,
    };
  }

  async function stopStream(): Promise<void> {
    if (fileOpen.current) await stopClip();
    if (stream.isStreaming) stream.stop();
  }

  return { startClip, stopClip, stopStream };
}
