import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { Store } from '../src/app/store';
import { initialData } from '../src/domain/defaults';
import { notificationPermission, requestNotifications, sendTestNotification } from '../src/platform/notifications';

// Notifications as on a phone; each test says what the phone answers.
vi.mock('../src/platform/notifications', async original => ({
  ...(await original<typeof import('../src/platform/notifications')>()),
  notificationPermission: vi.fn(), requestNotifications: vi.fn(), sendTestNotification: vi.fn(), syncNotifications: vi.fn(),
}));

function openReminders(permission: 'granted' | 'prompt') {
  vi.mocked(notificationPermission).mockResolvedValue(permission);
  const data = initialData();
  data.reminders.deadlines = false;
  const store = new Store(data, null, () => new Date('2026-10-13T09:00:00'));
  render(<App store={store} />);
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('button', { name: /^Reminders/ }));
  return store;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('reminder settings', () => {
  it('ask for notifications when reminders are turned on', async () => {
    vi.mocked(requestNotifications).mockResolvedValue('granted');
    const store = openReminders('prompt');
    await screen.findByRole('button', { name: 'Turn on' });
    fireEvent.click(screen.getByRole('switch', { name: /^Before a deadline/ }));
    expect(store.get().data.reminders.deadlines).toBe(true);
    await waitFor(() => expect(requestNotifications).toHaveBeenCalledOnce());
  });

  it('send a test notification once notifications are allowed', async () => {
    vi.mocked(sendTestNotification).mockResolvedValue(true);
    const store = openReminders('granted');
    fireEvent.click(await screen.findByRole('button', { name: 'Send a test notification' }));
    await waitFor(() => expect(store.get().toast?.message).toMatch(/arrives in 5 seconds/));
    expect(sendTestNotification).toHaveBeenCalledWith('Test reminder', 'Reminders can reach you on this phone.', 'Reminders', 5);
    expect(screen.getByText(/Some phones stop apps in the background/)).toBeTruthy();
  });
});
