import { beforeEach, describe, expect, it, vi } from 'vitest';

// The phone's notifications, as the plugin sees them: what is pending and what was asked of it.
const plugin = vi.hoisted(() => ({
  pending: [] as { id: number }[],
  calls: [] as [string, unknown][],
}));
vi.mock('../src/platform/native', () => ({ isNative: () => true }));
vi.mock('@capacitor/local-notifications', () => {
  const record = (name: string) => async (args?: unknown) => { plugin.calls.push([name, args]); };
  return {
    LocalNotifications: {
      checkPermissions: async () => ({ display: 'granted' }),
      getPending: async () => ({ notifications: plugin.pending }),
      cancel: record('cancel'),
      createChannel: record('createChannel'),
      deleteChannel: record('deleteChannel'),
      schedule: record('schedule'),
    },
  };
});

const { sendTestNotification, syncNotifications } = await import('../src/platform/notifications');
const called = (name: string) => plugin.calls.filter(([n]) => n === name).map(([, args]) => args);

beforeEach(() => {
  plugin.pending = [];
  plugin.calls = [];
});

describe('phone notifications', () => {
  it('come on a channel that pops up on screen, in place of the first quiet one', async () => {
    const at = new Date(Date.now() + 3_600_000);
    await syncNotifications([{ id: 7, at, title: 'Lab report', body: 'Due today 18:00.' }], 'Reminders');
    expect(called('deleteChannel')).toEqual([{ id: 'reminders' }]);
    expect(called('createChannel')).toEqual([{ id: 'reminders-alert', name: 'Reminders', importance: 4, visibility: 0, vibration: true }]);
    expect(called('schedule')).toEqual([{ notifications: [{
      id: 7, title: 'Lab report', body: 'Due today 18:00.', channelId: 'reminders-alert',
      schedule: { at, allowWhileIdle: true }, isExactNotification: false,
    }] }]);
  });

  it('replace pending reminders but leave a test notification on its way', async () => {
    plugin.pending = [{ id: 0 }, { id: 7 }, { id: 9 }];
    await syncNotifications([], 'Reminders');
    expect(called('cancel')).toEqual([{ notifications: [{ id: 7 }, { id: 9 }] }]);
    expect(called('schedule')).toEqual([]);
  });

  it('send a test a few seconds ahead, the way reminders come', async () => {
    const before = Date.now();
    expect(await sendTestNotification('Test reminder', 'Reminders can reach you on this phone.', 'Reminders', 5)).toBe(true);
    const [{ notifications: [n] }] = called('schedule') as { notifications: { id: number; channelId: string; schedule: { at: Date } }[] }[];
    expect(n).toMatchObject({ id: 0, channelId: 'reminders-alert' });
    expect(n.schedule.at.getTime() - before).toBeGreaterThanOrEqual(5000);
    expect(n.schedule.at.getTime() - before).toBeLessThan(6000);
  });
});
