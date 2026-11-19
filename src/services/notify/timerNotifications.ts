import * as Notifications from 'expo-notifications';
import type { SessionRecord } from '../../domain/types';

export async function scheduleTimerDone(label: string, durationMs: number): Promise<string | null> {
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return Notifications.scheduleNotificationAsync({
    content: { title: 'Timer finished', body: label, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: 'timers',
    },
  });
}

export async function armNewTimers(previous: SessionRecord, next: SessionRecord): Promise<SessionRecord> {
  let timers = next.timers;
  for (const timer of next.timers) {
    if (timer.status !== 'running' || timer.notificationId) continue;
    if (previous.timers.some((item) => item.id === timer.id)) continue;
    const notificationId = await scheduleTimerDone(timer.label, timer.durationMs);
    timers = timers.map((item) => (item.id === timer.id ? { ...item, notificationId } : item));
  }
  return timers === next.timers ? next : { ...next, timers };
}

export async function cancelTimerNotification(id: string | null): Promise<void> {
  if (!id) return;
  await Notifications.cancelScheduledNotificationAsync(id);
}
