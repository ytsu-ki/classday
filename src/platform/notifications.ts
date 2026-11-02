import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';

/**
 * Reminders as Android notifications, through Capacitor's local notifications. They are
 * scheduled ahead on the phone, so they arrive while the app is closed and after a restart.
 * Inexact alarms are enough for a reminder and need no special permission.
 */
export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface Notice { id: number; at: Date; title: string; body: string }

const CHANNEL = 'reminders';

export async function notificationPermission(): Promise<NotificationPermission> {
  if (!isNative()) return 'unsupported';
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

export async function requestNotifications(): Promise<NotificationPermission> {
  if (!isNative()) return 'unsupported';
  try {
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** Replaces every pending reminder with `notices`; nothing is scheduled without permission. */
export async function syncNotifications(notices: Notice[], channelName: string) {
  if ((await notificationPermission()) !== 'granted') return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  if (!notices.length) return;
  await LocalNotifications.createChannel({ id: CHANNEL, name: channelName, importance: 3, visibility: 0 }).catch(() => undefined);
  await LocalNotifications.schedule({
    notifications: notices.map(n => ({
      id: n.id, title: n.title, body: n.body, channelId: CHANNEL,
      schedule: { at: n.at, allowWhileIdle: true },
      isExactNotification: false,
    })),
  });
}

/** Opening the app from a reminder. */
export function onNotificationOpened(handler: () => void): () => void {
  if (!isNative()) return () => {};
  const listener = LocalNotifications.addListener('localNotificationActionPerformed', () => handler());
  return () => { void listener.then(l => l.remove()); };
}
