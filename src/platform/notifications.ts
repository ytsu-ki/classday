import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';

/**
 * Reminders as Android notifications, through Capacitor's local notifications. They are
 * scheduled ahead on the phone, so they arrive while the app is closed and after a restart.
 * Inexact alarms are enough for a reminder and need no special permission.
 */
export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface Notice { id: number; at: Date; title: string; body: string }

/**
 * Reminders pop up on screen as well as wait in the shade (high importance). A channel keeps the
 * importance it was made with, so this is a new channel; the first one, which only waited in
 * the shade, is removed.
 */
const CHANNEL = 'reminders-alert';
const OLD_CHANNELS = ['reminders'];
/** Reminder ids are 1 and up, so the test notification never replaces one. */
const TEST_ID = 0;

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

async function ensureChannel(name: string) {
  for (const id of OLD_CHANNELS) await LocalNotifications.deleteChannel({ id }).catch(() => undefined);
  await LocalNotifications.createChannel({ id: CHANNEL, name, importance: 4, visibility: 0, vibration: true }).catch(() => undefined);
}

const toSchedule = (n: Notice) => ({
  id: n.id, title: n.title, body: n.body, channelId: CHANNEL,
  schedule: { at: n.at, allowWhileIdle: true },
  isExactNotification: false,
});

/** Replaces every pending reminder with `notices`; nothing is scheduled without permission. */
export async function syncNotifications(notices: Notice[], channelName: string) {
  if ((await notificationPermission()) !== 'granted') return;
  const pending = (await LocalNotifications.getPending()).notifications.filter(n => n.id !== TEST_ID);
  if (pending.length) await LocalNotifications.cancel({ notifications: pending.map(n => ({ id: n.id })) });
  if (!notices.length) return;
  await ensureChannel(channelName);
  await LocalNotifications.schedule({ notifications: notices.map(toSchedule) });
}

/** A notification a few seconds from now, the way reminders come, to check that they arrive. */
export async function sendTestNotification(title: string, body: string, channelName: string, seconds = 5): Promise<boolean> {
  if ((await notificationPermission()) !== 'granted') return false;
  await ensureChannel(channelName);
  await LocalNotifications.cancel({ notifications: [{ id: TEST_ID }] }).catch(() => undefined);
  await LocalNotifications.schedule({ notifications: [toSchedule({ id: TEST_ID, at: new Date(Date.now() + seconds * 1000), title, body })] });
  return true;
}

/** Opening the app from a reminder. */
export function onNotificationOpened(handler: () => void): () => void {
  if (!isNative()) return () => {};
  const listener = LocalNotifications.addListener('localNotificationActionPerformed', () => handler());
  return () => { void listener.then(l => l.remove()); };
}
