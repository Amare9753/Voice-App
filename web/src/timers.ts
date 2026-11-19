import { remainingMs } from '@core/domain/duration';
import type { TimerEvent } from '@core/domain/types';

const handles = new Map<string, number>();

export function clearTimerHandle(id: string): void {
  const handle = handles.get(id);
  if (handle !== undefined) window.clearTimeout(handle);
  handles.delete(id);
}

export function clearAllTimerHandles(): void {
  for (const id of handles.keys()) clearTimerHandle(id);
}

export function scheduleTimer(timer: TimerEvent, onFire: (id: string) => void): void {
  clearTimerHandle(timer.id);
  const remaining = remainingMs(timer.startedAt, timer.durationMs, new Date().toISOString());
  const handle = window.setTimeout(() => {
    handles.delete(timer.id);
    onFire(timer.id);
  }, remaining);
  handles.set(timer.id, handle);
}

export async function requestTimerPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export async function notifyTimer(label: string): Promise<void> {
  beep();
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification('Timer finished', { body: label });
  } catch {
    // iOS only shows this for an installed home-screen app, and may reject it in a browser tab.
  }
}

function beep(): void {
  const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  const context = new Context();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
  oscillator.onended = () => void context.close();
}
