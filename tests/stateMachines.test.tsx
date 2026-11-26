import { act as rtlAct, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { Saver } from '../src/app/repository';
import { initialNav, reduceBack, reduceNav } from '../src/app/sheetStack';
import { Store } from '../src/app/store';
import { initialData } from '../src/domain/defaults';
import { pickFile } from '../src/platform/backup';
import type { StorageBackend } from '../src/platform/storage';
import { Calendar } from '../src/ui/components/Calendar';
import { dayLayout } from '../src/ui/dayGrid';
import { time } from '../src/ui/format';
import { keepRemindersInSync } from '../src/ui/reminders';
import { evaluateSwipe, useSwipe } from '../src/ui/useSwipe';
import { once, todo, weekly, withClassTimes } from './helpers';

const nativeMocks = vi.hoisted(() => ({
  backHandler: null as null | (() => void),
  perm: 'denied' as 'granted' | 'denied' | 'prompt' | 'unsupported',
  syncSpy: vi.fn(async () => {}),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (event: string, fn: () => void) => {
      if (event === 'backButton') nativeMocks.backHandler = fn;
      return { remove: vi.fn(async () => {}) };
    }),
    getInfo: vi.fn(async () => ({ version: '1.1.0' })),
    minimizeApp: vi.fn(async () => {}),
  },
}));

vi.mock('../src/platform/native', async original => {
  const actual = await original<typeof import('../src/platform/native')>();
  return {
    ...actual,
    watchLifecycle: (handlers: Parameters<typeof actual.watchLifecycle>[0]) => {
      nativeMocks.backHandler = handlers.onBack;
      return actual.watchLifecycle(handlers);
    },
  };
});

vi.mock('../src/platform/notifications', async original => {
  const actual = await original<typeof import('../src/platform/notifications')>();
  return {
    ...actual,
    notificationPermission: vi.fn(async () => nativeMocks.perm),
    syncNotifications: nativeMocks.syncSpy,
  };
});

const clock = () => new Date('2026-10-13T09:00:00');
const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } });
const nav = (name: string) => fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  nativeMocks.backHandler = null;
  nativeMocks.perm = 'denied';
  nativeMocks.syncSpy.mockClear();
});

describe('navigation & sheet stack state machine', () => {
  it('reduces back, parent views, and midnight rollover without hijacking chosen days', () => {
    let s = initialNav('2026-10-13');
    s = reduceNav(s, { type: 'showDay', day: '2026-10-20' });
    // User picked a future day; midnight rollover must NOT override it.
    s = reduceNav(s, { type: 'rollover', previousToday: '2026-10-13', nextToday: '2026-10-14' });
    expect(s.day).toBe('2026-10-20');

    // Viewing Today DOES advance at midnight.
    s = reduceNav(s, { type: 'showDay', day: '2026-10-14' });
    s = reduceNav(s, { type: 'rollover', previousToday: '2026-10-14', nextToday: '2026-10-15' });
    expect(s.day).toBe('2026-10-15');

    // Back from settings subpage -> settings -> Today -> minimize.
    s = reduceNav(s, { type: 'go', view: 'timetable', today: '2026-10-15' });
    expect(reduceBack(s, '2026-10-15')).toMatchObject({ minimize: false, state: { view: 'settings' } });
    s = reduceBack(s, '2026-10-15').state;
    s = reduceBack(s, '2026-10-15').state;
    expect(s.view).toBe('today');
    expect(reduceBack(s, '2026-10-15').minimize).toBe(true);
  });

  it('preserves dirty ItemSheet edits across ConfirmSheet cancel, Escape, and Android Back', () => {
    const store = new Store({ ...initialData(), items: [todo({ title: 'Essay draft' })] }, null, clock);
    render(<App store={store} />);
    nav('To-dos');
    fireEvent.click(screen.getByRole('button', { name: /^Essay draft/ }));
    type(screen.getByLabelText('Name'), 'Essay draft v2');

    // Cancel on ConfirmSheet returns to ItemSheet with unsaved edits intact.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete this?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Essay draft v2');

    // Android Back on ConfirmSheet also pops only ConfirmSheet.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete this?' })).toBeTruthy();
    rtlAct(() => { nativeMocks.backHandler?.(); });
    expect(screen.queryByRole('heading', { name: 'Delete this?' })).toBeNull();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Essay draft v2');

    // Confirming delete removes the item and closes all sheets.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialogs = screen.getAllByRole('dialog');
    fireEvent.click(within(dialogs[0]).getByRole('button', { name: 'Delete' }));
    expect(store.get().data.items).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pops DatePage before closing EventSheet on Android Back', () => {
    const store = new Store(initialData(), null, clock);
    render(<App store={store} />);
    fireEvent.click(within(document.querySelector('.page-head')!).getByRole('button', { name: 'Add an event' }));
    type(screen.getByLabelText('Name'), 'Lab meeting');
    fireEvent.click(screen.getByRole('button', { name: /^Date:/ }));
    expect(screen.getByRole('heading', { name: 'Date' })).toBeTruthy();

    rtlAct(() => { nativeMocks.backHandler?.(); });
    expect(screen.queryByRole('heading', { name: 'Date' })).toBeNull();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Lab meeting');
    rtlAct(() => { nativeMocks.backHandler?.(); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ImportSheet step preservation & worker cleanup', () => {
  it('preserves semester config when backing out of Preview', () => {
    const store = new Store(initialData(), null, clock);
    render(<App store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import timetable' }));
    fireEvent.click(screen.getByRole('button', { name: /^Paste or open text/ }));
    type(screen.getByLabelText('Paste your timetable'), 'Calculus, Mon 08:00-09:40, weeks 1-16');
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    type(screen.getByLabelText('Timetable name'), 'Fall 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('heading', { name: 'Review the import' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Check the semester' })).toBeTruthy();
    expect((screen.getByLabelText('Timetable name') as HTMLInputElement).value).toBe('Fall 2026');
  });

  it('terminates an active ICS Worker when unmounted mid-parse', async () => {
    const terminate = vi.fn();
    let started = false;
    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      postMessage() { started = true; }
      terminate = terminate;
    }
    vi.stubGlobal('Worker', MockWorker);

    const store = new Store(initialData(), null, clock);
    const { unmount } = render(<App store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import timetable' }));
    const chooseBtn = screen.getByRole('button', { name: /^From a file/ });
    // Intercept file input selection with a valid .ics file.
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') {
        el.click = () => {
          Object.defineProperty(el, 'files', { value: [new File(['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'], 'a.ics')] });
          el.dispatchEvent(new Event('change'));
        };
      }
      return el;
    }) as typeof document.createElement);

    fireEvent.click(chooseBtn);
    await screen.findByRole('heading', { name: 'Import a calendar file' });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(started).toBe(true));
    unmount();
    expect(terminate).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('Saver drain & pickFile fallback', () => {
  it('drains newly scheduled data across concurrent flush() calls in order', async () => {
    const writes: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(r => { releaseFirst = r; });
    const backend: StorageBackend = {
      kind: 'browser',
      read: async () => null,
      readPrevious: async () => null,
      write: async json => {
        if (!writes.length) await firstGate;
        writes.push(json);
      },
      snapshot: async () => {},
      listSnapshots: async () => [],
      readSnapshot: async () => '',
    };
    const saver = new Saver(backend, () => {}, () => '2026-10-13', 100);
    saver.schedule({ ...initialData(), noteDraft: 'v1' });
    const f1 = saver.flush();
    saver.schedule({ ...initialData(), noteDraft: 'v2' });
    const f2 = saver.flush();
    releaseFirst();
    await Promise.all([f1, f2]);
    expect(writes.map(w => JSON.parse(w).noteDraft)).toEqual(['v1', 'v2']);
  });

  it('resolves pickFile to null on window focus when cancel event is absent (WebView 105-112)', async () => {
    vi.useFakeTimers();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') el.click = () => {};
      return el;
    }) as typeof document.createElement);

    const promise = pickFile('.json');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toBeNull();
    vi.restoreAllMocks();
  });
});

describe('Reminders stop guard & foreground permission refresh', () => {
  it('does not sync after stop() and refreshes permission on visibilitychange', async () => {
    vi.useFakeTimers();
    const store = new Store(initialData(), null, clock);
    const handle = keepRemindersInSync(store);
    handle.stop();
    store.act(d => { d.noteDraft = 'x'; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(nativeMocks.syncSpy).not.toHaveBeenCalled();
    vi.useRealTimers();

    nativeMocks.perm = 'denied';
    render(<App store={store} />);
    nav('Settings');
    fireEvent.click(screen.getByRole('button', { name: /^Reminders/ }));
    await screen.findByText(/Notifications are off for Classday/);

    nativeMocks.perm = 'granted';
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    await screen.findByRole('button', { name: 'Send a test notification' });
  });
});

describe('Calendar APG roving tabindex, CaptureSheet, EventSheet & dayGrid', () => {
  it('uses roving tabindex and arrow keys in Calendar', async () => {
    const onChange = vi.fn();
    render(<Calendar value="2026-10-13" today="2026-10-13" min="2026-10-13" onChange={onChange} />);
    const buttons = screen.getAllByRole('button').filter(b => b.hasAttribute('data-day'));
    expect(buttons.filter(b => b.tabIndex === 0)).toHaveLength(1);
    const day13 = screen.getByRole('button', { name: '13 October' });
    expect(day13.tabIndex).toBe(0);

    fireEvent.keyDown(day13, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByRole('button', { name: '14 October' }).tabIndex).toBe(0));
    fireEvent.keyDown(screen.getByRole('button', { name: '14 October' }), { key: 'PageDown' });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy());
  });

  it('keeps manual due date when removing parsed time chip and drops sub-20m meal slivers', () => {
    const store = new Store(initialData(), null, clock);
    render(<App store={store} />);
    nav('To-dos');
    fireEvent.click(within(document.querySelector('.page-head')!).getByRole('button', { name: 'Add a to-do' }));
    type(screen.getByPlaceholderText('Add a to-do…'), 'Read 18:00');
    fireEvent.click(screen.getByRole('button', { name: /^Deadline:/ }));
    fireEvent.click(screen.getByRole('button', { name: '15 October' }));
    fireEvent.click(within(document.querySelector('.sheet-foot')!).getByRole('button', { name: 'Done' }));
    // Removing time keeps manual 15 Oct due date.
    fireEvent.click(screen.getByRole('button', { name: /Remove at/ }));
    expect(screen.getByRole('button', { name: /^Deadline: 15 Oct\./ })).toBeTruthy();

    // 10-minute meal sliver (12:00-12:10) before 12:10-12:30 event is dropped; 30-minute remainder stays.
    const d = { ...initialData(), events: [once('Sign-in', '2026-10-13', '12:10', '12:30')] };
    const meals = dayLayout(d, '2026-10-13').entries.filter(e => e.kind === 'meal');
    expect(meals.map(m => [m.start, m.end])).toEqual([[750, 780], [1080, 1140]]);
  });

  it('clamps EventSheet short-term until date when firstDay moves past lastDay', () => {
    const store = new Store(initialData(), null, clock);
    render(<App store={store} />);
    fireEvent.click(within(document.querySelector('.page-head')!).getByRole('button', { name: 'Add an event' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Short-term' }));
    fireEvent.click(screen.getByRole('button', { name: /^First day:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: '20 November' }));
    fireEvent.click(within(document.querySelector('.sheet-foot')!).getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: /^Last day:/ }).getAttribute('aria-label')).toContain('20 November');
  });
});

describe('useSwipe prototype benchmark & bailout', () => {
  it('outperforms pure-distance threshold on crisp flicks while rejecting vertical scrolls', () => {
    // Crisp 42px flick on a 360px phone screen (90ms -> 0.47 px/ms) is recognized; diagonal scroll is rejected.
    expect(evaluateSwipe(-42, 4, 90)).toBe(1);
    expect(evaluateSwipe(42, -3, 90)).toBe(-1);
    expect(evaluateSwipe(-60, 80, 200)).toBe(0);
    expect(evaluateSwipe(-60, 0, 900)).toBe(0);

    vi.useFakeTimers();
    const onSwipe = vi.fn();
    const onChildClick = vi.fn();
    function Harness() {
      const swipe = useSwipe(onSwipe);
      return (
        <div data-testid="area" {...swipe}>
          <button type="button" onClick={onChildClick}>Tap</button>
        </div>
      );
    }
    render(<Harness />);
    const area = screen.getByTestId('area');

    // Vertical scroll bailout: pointermove dy=30 aborts horizontal swipe even if pointerup ends with dx=70.
    fireEvent.pointerDown(area, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 105, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(area, { clientX: 170, clientY: 132, pointerId: 1 });
    expect(onSwipe).not.toHaveBeenCalled();

    // Touch swipe without subsequent click auto-expires guard after 80ms so later taps work.
    fireEvent.pointerDown(area, { clientX: 200, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerUp(area, { clientX: 120, clientY: 102, pointerId: 1 });
    expect(onSwipe).toHaveBeenCalledWith(1);
    vi.advanceTimersByTime(90);
    fireEvent.click(screen.getByRole('button', { name: 'Tap' }));
    expect(onChildClick).toHaveBeenCalledTimes(1);
  });
});

describe('Week overlap +N cluster & empty-space quick-create', () => {
  it('collapses overlapping Week events into +N, drills into OverlapSheet -> FixedSheet, and pops back cleanly', () => {
    const store = new Store(withClassTimes({
      ...initialData(),
      events: [
        weekly('AI Seminar', 3, '10:10', '11:50', { location: 'Room 401' }),
        weekly('Agile Lab', 3, '10:10', '11:50', { location: 'Room 402' }),
        weekly('ACM Practice', 3, '10:30', '11:30', { location: 'Lab 602' }),
      ],
    }), null, clock);
    render(<App store={store} />);
    nav('Week');

    const stacked = document.querySelectorAll('.wk-card.is-stacked');
    expect(stacked).toHaveLength(1);
    expect(stacked[0].textContent).toContain('AI Seminar');
    expect(stacked[0].textContent).toContain('+2');

    // Clicking +2 card opens OverlapSheet listing all 3 events.
    fireEvent.click(stacked[0]);
    expect(screen.getByRole('heading', { name: '3 overlapping events' })).toBeTruthy();

    // Clicking Agile Lab pushes FixedSheet; cancelling occurrence pops back to OverlapSheet with 2 left.
    fireEvent.click(screen.getByRole('button', { name: /Agile Lab/ }));
    expect(screen.getByRole('heading', { name: 'Agile Lab' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not happening this time' }));
    expect(screen.getByRole('heading', { name: '2 overlapping events' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Agile Lab/ })).toBeNull();

    // Android Back closes OverlapSheet.
    rtlAct(() => { nativeMocks.backHandler?.(); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('places dashed draft on empty click, drags bottom handle to resize, and dismisses cleanly on Back/swipe', () => {
    const store = new Store(withClassTimes(), null, clock);
    render(<App store={store} />);
    nav('Week');

    const friCol = document.querySelector('.wk-col[data-day="2026-10-16"]') as HTMLElement;
    vi.spyOn(friCol, 'getBoundingClientRect').mockReturnValue({
      top: 100, left: 0, right: 100, bottom: 800, width: 100, height: 700, x: 0, y: 100, toJSON: () => {},
    });

    // Horizontal swipe across column moves week without showing draft or opening EventSheet.
    fireEvent.pointerDown(friCol, { clientX: 280, clientY: 160, button: 0, pointerId: 1 });
    fireEvent.pointerUp(friCol, { clientX: 80, clientY: 165, pointerId: 1 });
    fireEvent.click(friCol, { clientY: 100 });
    expect(document.querySelector('[data-draft-slot]')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: '19 – 25 October' })).toBeTruthy();

    // Plain tap at top of next week's column places dashed draft slot at 08:00–09:40 for 2026-10-23.
    const nextBody = document.querySelector('.wk-body') as HTMLElement;
    vi.spyOn(nextBody, 'getBoundingClientRect').mockReturnValue({
      top: 100, left: 0, right: 320, bottom: 800, width: 320, height: 700, x: 0, y: 100, toJSON: () => {},
    });
    const nextFriCol = document.querySelector('.wk-col[data-day="2026-10-23"]') as HTMLElement;
    vi.spyOn(nextFriCol, 'getBoundingClientRect').mockReturnValue({
      top: 100, left: 0, right: 100, bottom: 800, width: 100, height: 700, x: 0, y: 100, toJSON: () => {},
    });
    fireEvent.pointerDown(nextFriCol, { clientX: 50, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerUp(nextFriCol, { clientX: 50, clientY: 100, pointerId: 1 });
    fireEvent.click(nextFriCol, { clientY: 100 });
    const draftEl = document.querySelector('[data-draft-slot]') as HTMLElement;
    expect(draftEl).toBeTruthy();

    // Android Back dismisses active draft slot instead of changing view.
    rtlAct(() => { nativeMocks.backHandler?.(); });
    expect(document.querySelector('[data-draft-slot]')).toBeNull();

    // Tap again, drag bottom handle down to ~11:50 (y around top + 275px on period 4), then tap body -> EventSheet keeps dragged end!
    fireEvent.click(nextFriCol, { clientY: 100 });
    vi.useFakeTimers();
    const bottomHandle = document.querySelector('.draft-handle.is-bottom') as HTMLElement;
    fireEvent.pointerDown(bottomHandle, { clientX: 50, clientY: 230, button: 0, pointerId: 2 });
    fireEvent.pointerMove(bottomHandle, { clientX: 50, clientY: 365, pointerId: 2 });
    fireEvent.pointerUp(bottomHandle, { clientX: 50, clientY: 365, pointerId: 2 });
    const endAfterDrag = document.querySelector('.draft-handle.is-bottom')!.getAttribute('aria-valuetext');
    expect(endAfterDrag).not.toBe('09:40');

    vi.advanceTimersByTime(100);
    fireEvent.click(document.querySelector('.draft-body')!);
    vi.useRealTimers();
    expect(screen.getByRole('heading', { name: 'Add an event' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Date: 23 October/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Starts:/ }).getAttribute('aria-label')).toBe(`Starts: ${time(8 * 60)}`);
    expect(screen.getByRole('button', { name: /^Ends:/ }).getAttribute('aria-label')).not.toBe(`Ends: ${time(9 * 60 + 40)}`);
  });

  it('closes an open Notebook back to Shelf on Android Back', () => {
    const store = new Store({
      ...initialData(),
      notebooks: [{ id: 'b1', name: 'Physics', color: 1, createdAt: '2026-10-12T10:00:00.000Z', updatedAt: '2026-10-12T10:00:00.000Z' }],
      notes: [],
    }, null, clock);
    render(<App store={store} />);
    nav('Notes');
    fireEvent.click(screen.getByRole('button', { name: /Physics/ }));
    expect(screen.getByRole('heading', { name: 'Physics' })).toBeTruthy();
    rtlAct(() => { nativeMocks.backHandler?.(); });
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy();
  });
});
