import { App } from '@capacitor/app';
import { useEffect, useState } from 'preact/hooks';
import type { Store } from '../app/store';
import { upcomingReminders } from '../domain/reminders';
import { dayKey } from '../domain/time';
import type { PlannerData } from '../domain/types';
import { t } from '../i18n';
import { isNative } from '../platform/native';
import { notificationPermission, syncNotifications, type Notice, type NotificationPermission } from '../platform/notifications';
import { dueLabel, span } from './format';
import { toMinutes } from '../domain/time';

/** The reminders' words, in the current language, for the phone to show later. */
export function reminderNotices(data: PlannerData, now: Date): Notice[] {
  const titles = new Map(data.items.map(i => [i.id, i.title]));
  const events = new Map(data.events.map(e => [e.id, e]));
  return upcomingReminders(data, now).map(r => {
    if (r.kind === 'deadline') {
      // Worded for the moment it arrives: "Due tomorrow" on the day before.
      return { id: r.id, at: r.at, title: titles.get(r.itemId) ?? '', body: t.reminders.dueBody(dueLabel(r.due, r.dueTime, dayKey(r.at))) };
    }
    const e = events.get(r.eventId)!;
    const when = e.allDay ? t.event.allDay : span(toMinutes(e.start), toMinutes(e.end));
    return { id: r.id, at: r.at, title: e.title, body: t.reminders.eventBody(when, e.location ?? '', r.day === dayKey(r.at)) };
  });
}

/**
 * Keeps the phone's scheduled reminders in step with the data: shortly after any change, when
 * the language changes, and when the app goes to the background. Returns a stop function.
 */
export function keepRemindersInSync(store: Store): { stop: () => void; now: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = '';
  let stopped = false;
  // One sync at a time: two at once could each cancel what the other had just scheduled.
  let queue: Promise<void> = Promise.resolve();
  const run = () => {
    if (stopped) return;
    queue = queue.then(sync, sync);
  };
  const sync = async () => {
    if (stopped) return;
    const notices = reminderNotices(store.get().data, new Date());
    const perm = await notificationPermission();
    if (stopped) return;
    const key = JSON.stringify([notices, t.lang, perm]);
    if (key === last) return;
    last = key;
    try {
      await syncNotifications(notices, t.reminders.channel);
    } catch {
      last = '';
    }
  };
  const soon = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), 1500);
  };
  const unsubscribe = store.subscribe(soon);
  soon();
  return {
    stop: () => { stopped = true; if (timer) clearTimeout(timer); unsubscribe(); },
    now: () => { if (timer) clearTimeout(timer); void run(); },
  };
}

/** Tracks notification permission and refreshes it when returning from system settings. */
export function useNotificationPermission(): [NotificationPermission | null, (next: NotificationPermission) => void] {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { void notificationPermission().then(p => { if (active) setPermission(p); }); };
    refresh();
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const nativeHandle = isNative() ? App.addListener('resume', refresh) : null;
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void nativeHandle?.then(h => h.remove()).catch(() => undefined);
    };
  }, []);
  return [permission, setPermission];
}
