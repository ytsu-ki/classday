import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/App';
import { Store } from '../src/app/store';
import { initialData } from '../src/domain/defaults';
import type { PlannerData } from '../src/domain/types';
import { prefers24h, time, timeParts } from '../src/ui/format';
import { once, todo, weekly } from './helpers';

const clock = () => new Date('2026-10-13T09:00:00'); // Tuesday morning

function mount(data: PlannerData = initialData()) {
  const store = new Store(data, null, clock);
  render(<App store={store} />);
  return store;
}

const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } });
const nav = (name: string) => fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name }));
const dialog = () => screen.getByRole('dialog');
/** Chooses a time on a time field's wheels, in 12- or 24-hour form as the device uses. */
function setTime(name: RegExp, clock: string) {
  const button = screen.getByRole('button', { name });
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
  const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
  const [h, m] = clock.split(':').map(Number);
  const choose = (wheel: string, option: string) => fireEvent.click(within(within(panel).getByRole('listbox', { name: wheel })).getByRole('option', { name: option }));
  if (prefers24h) choose('Hour', String(h).padStart(2, '0'));
  else {
    choose('Hour', String(h % 12 || 12));
    choose('am or pm', h >= 12 ? 'pm' : 'am');
  }
  choose('Minute', String(m).padStart(2, '0'));
}
/** A quick sideways stroke across an element, as a finger makes it. */
function swipe(el: Element, direction: 'left' | 'right') {
  const [from, to] = direction === 'left' ? [300, 80] : [80, 300];
  fireEvent.pointerDown(el, { clientX: from, clientY: 200, button: 0 });
  fireEvent.pointerUp(el, { clientX: to, clientY: 210, button: 0 });
}
/** The + in the page header. */
const headerButton = (name: string) => within(document.querySelector('.page-head') as HTMLElement).getByRole('button', { name });
const addTodo = () => { nav('To-dos'); fireEvent.click(headerButton('Add a to-do')); };
const addEvent = () => fireEvent.click(headerButton('Add an event'));

afterEach(() => cleanup());

describe('first run', () => {
  it('welcomes a new student without asking for an account', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Leave room in your day.' })).toBeTruthy();
    expect(screen.getByText(/No account needed/)).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    // The add button lives in the header now, not floating over the page.
    expect(document.querySelector('.fab')).toBeNull();
  });
});

describe('to-dos', () => {
  it('turn one typed line into a to-do that stays off the timetable', async () => {
    const store = mount();
    addTodo();
    const input = screen.getByPlaceholderText('Add a to-do…');
    type(input, 'Lab report fri 2h important');
    expect(screen.getByRole('button', { name: /Remove Due Fri/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Important' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Urgent' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.submit(input.closest('form')!);
    expect(store.get().data.items[0]).toMatchObject({ title: 'Lab report', due: '2026-10-16', estimate: 120, important: true, urgent: false });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Added to your to-dos/));
    nav('Today');
    expect(screen.queryByText('Lab report')).toBeNull();
  });

  it('start with nothing set, and take a deadline from the calendar', () => {
    const store = mount();
    addTodo();
    expect(screen.getByRole('button', { name: 'Choose a deadline' }).textContent).toBe('None');
    for (const name of ['30 min', '1 h', 'Custom', 'Important', 'Urgent']) expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
    type(screen.getByPlaceholderText('Add a to-do…'), 'Return books');
    fireEvent.click(screen.getByRole('button', { name: 'Choose a deadline' }));
    expect(within(dialog()).getByRole('heading', { name: 'Deadline' })).toBeTruthy();
    expect(within(dialog()).getByRole('heading', { name: 'October 2026' })).toBeTruthy();
    // Earlier days can't be picked for a deadline.
    expect((screen.getByRole('button', { name: '12 October' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: '3 November' }));
    setTime(/^Time/, '18:00');
    fireEvent.click(within(document.querySelector('.sheet-foot') as HTMLElement).getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: /^Deadline: 3 Nov/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '30 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Urgent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to-do' }));
    expect(store.get().data.items[0]).toMatchObject({ title: 'Return books', due: '2026-11-03', dueTime: '18:00', estimate: 30, important: false, urgent: true });
  });

  it('are listed in Eisenhower order, overdue first and greyed, with a warning near the deadline', () => {
    const store = mount({ ...initialData(), items: [
      todo({ title: 'Relaxed' }),
      todo({ title: 'Urgent one', urgent: true }),
      todo({ title: 'Both', important: true, urgent: true, due: '2026-10-13', dueTime: '17:00' }),
      todo({ title: 'Important one', important: true }),
      todo({ title: 'Late', due: '2026-10-12' }),
    ] });
    nav('To-dos');
    expect(screen.getAllByRole('radio').map(r => r.textContent)).toEqual(['To-dos 5', 'Done']);
    const titles = [...document.querySelectorAll('.item-title')].map(e => e.textContent!.replace('!', ''));
    expect(titles).toEqual(['Late', 'Both', 'Important one', 'Urgent one', 'Relaxed']);
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent!.replace(/\d+$/, ''))).toEqual(['Overdue', 'Important and urgent', 'Important', 'Urgent', 'Everything else']);
    expect(document.querySelector('.item-row.is-overdue')!.textContent).toContain('Late');
    // Due at 17:00 today, eight hours away.
    expect(screen.getByRole('img', { name: 'Due within 12 hours' }).closest('li')!.textContent).toContain('Both');
    // Overdue stays a to-do until it is ticked off.
    expect(store.get().data.items.find(i => i.title === 'Late')!.status).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'Mark Late done' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Done' }));
    expect(screen.getByText('Late')).toBeTruthy();
  });

  it('are changed in their own sheet', () => {
    const store = mount({ ...initialData(), items: [todo({ title: 'Essay', due: '2026-10-16' })] });
    nav('To-dos');
    fireEvent.click(screen.getByRole('button', { name: /^Essay/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Important' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove the deadline' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save changes' }));
    expect(store.get().data.items[0]).toMatchObject({ important: true });
    expect(store.get().data.items[0]).not.toHaveProperty('due');
  });
});

describe('events', () => {
  it('are added from the + on Today, as one of three kinds', () => {
    const store = mount();
    addEvent();
    expect(screen.getAllByRole('radio').map(r => r.textContent)).toEqual(['Once', 'Short-term', 'Long-term']);
    type(screen.getByLabelText('Name'), 'Exam revision');
    fireEvent.click(screen.getByRole('radio', { name: 'Short-term' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thu' }));
    setTime(/^Starts/, '19:00');
    fireEvent.change(screen.getByLabelText('Reminder'), { target: { value: '15' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }));
    const [event] = store.get().data.events;
    expect(event).toMatchObject({ title: 'Exam revision', category: 'short', repeat: 'weekly', from: '2026-10-13', until: '2026-11-09', days: [2, 4], start: '19:00', remind: 15 });
  });

  it('read a whole notice pasted into the name, lasting a double period without an end', () => {
    const store = mount();
    addEvent();
    fireEvent.paste(screen.getByLabelText('Name'), { clipboardData: { getData: () => 'Hi all, the career fair is on Oct 15 at 10:10 in the Main Hall. Please bring your CV.' } });
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('career fair');
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('Main Hall');
    expect(screen.getByText(/Read the date, the start time and the place from the message/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }));
    expect(store.get().data.events[0]).toMatchObject({ title: 'career fair', category: 'once', date: '2026-10-15', start: '10:10', end: '11:50', location: 'Main Hall' });
  });

  it('can be all day, and show above the hours', () => {
    const store = mount();
    addEvent();
    type(screen.getByLabelText('Name'), 'Sports day');
    fireEvent.click(screen.getByRole('switch', { name: 'All day' }));
    expect(screen.queryByRole('button', { name: /^Starts/ })).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add' }));
    expect(store.get().data.events[0]).toMatchObject({ allDay: true, start: '00:00', end: '23:59' });
    expect(within(screen.getByRole('list', { name: 'All day' })).getByText('Sports day')).toBeTruthy();
  });

  it('can start where free time was tapped', () => {
    mount({ ...initialData(), events: [weekly('Physics', 2, '14:00', '15:00')] });
    fireEvent.click(screen.getByRole('button', { name: `Add an event at ${time(15 * 60)}` }));
    expect(screen.getByRole('button', { name: /^Starts/ }).getAttribute('aria-label')).toBe(`Starts: ${time(15 * 60)}`);
  });

  it('show what kind they are, and one occurrence can be cancelled', () => {
    const store = mount({ ...initialData(), events: [weekly('Physics', 2, '10:00', '11:40', { location: 'B204' })] });
    fireEvent.click(screen.getByRole('button', { name: /^Physics/ }));
    expect(within(dialog()).getByText('Long-term · Every Tue')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Not happening this time' }));
    expect(store.get().data.events[0].exclusions).toEqual(['2026-10-13']);
  });
});

describe('today', () => {
  it('shows the whole day, earlier hours included, with the current time marked and no empty card', () => {
    mount({ ...initialData(), items: [todo()], events: [weekly('Physics', 2, '08:00', '08:45'), weekly('Chemistry', 2, '14:00', '15:30'), once('Seminar', '2026-10-13', '10:00', '11:00')] });
    const rows = [...document.querySelectorAll<HTMLElement>('.day-items > li')];
    const order = rows.map(r => (r.classList.contains('day-now') ? 'now' : r.querySelector('.card-title')?.textContent)).filter(Boolean);
    expect(order).toEqual(['Physics', 'now', 'Seminar', 'Chemistry']);
    expect(rows.find(r => r.textContent?.includes('Physics'))!.classList.contains('is-over')).toBe(true);
    expect(screen.queryByText(/Nothing planned|Add something/)).toBeNull();
  });

  it('draws the day to one scale: everything as tall as it lasts, placed at its time', () => {
    mount({ ...initialData(), events: [weekly('Physics', 2, '08:00', '08:45'), weekly('Chemistry', 2, '14:00', '15:30')] });
    const box = (el: Element) => { const s = (el as HTMLElement).style; return { top: parseFloat(s.top) - 1, height: parseFloat(s.height) + 2 }; };
    const card = (name: string) => box(screen.getByRole('button', { name: new RegExp(`^${name}`) }).closest('li')!);
    const physics = card('Physics'), chemistry = card('Chemistry');
    // 90 minutes is twice 45, and 14:00 sits six hours below 08:00 on the same scale.
    expect(chemistry.height).toBeCloseTo(physics.height * 2);
    expect(chemistry.top - physics.top).toBeCloseTo((physics.height / 45) * 6 * 60);
    // Free time takes its own length too: 15:30 to the 18:00 dinner is 150 minutes.
    const free = box(screen.getByRole('button', { name: `Add an event at ${time(15 * 60 + 30)}` }).closest('li')!);
    expect(free.height).toBeCloseTo((physics.height / 45) * 150);
    // The current time sits between the hours it falls between.
    const now = parseFloat((document.querySelector('.day-now') as HTMLElement).style.top);
    expect(now).toBeCloseTo(physics.top + (physics.height / 45) * 60);
  });

  it('moves between days with a swipe', () => {
    mount();
    swipe(document.querySelector('.timeline')!, 'left');
    expect(screen.getByRole('heading', { name: '14 October' })).toBeTruthy();
    swipe(document.querySelector('.timeline')!, 'right');
    swipe(document.querySelector('.timeline')!, 'right');
    expect(screen.getByRole('heading', { name: '12 October' })).toBeTruthy();
  });

  it('shows titles as text, never as markup', () => {
    mount({ ...initialData(), events: [once('<img src=x onerror=alert(1)>', '2026-10-13', '15:00', '16:00')] });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getAllByText('<img src=x onerror=alert(1)>').length).toBeGreaterThan(0);
  });
});

describe('week', () => {
  it('shows a timetable with the semester week, periods and classes, and moves by swiping', () => {
    const d = { ...initialData(), events: [weekly('Physics', 2, '08:00', '09:40', { location: 'B204' })] };
    d.timetable.semester = { firstMonday: '2026-09-07', periods: [{ start: '08:00', end: '08:45' }, { start: '08:55', end: '09:40' }] };
    mount(d);
    nav('Week');
    expect(screen.getByRole('heading', { name: 'Week 6' })).toBeTruthy();
    const grid = screen.getByRole('group', { name: /Timetable for 12 – 18 October/ });
    // The two saved periods, then the default times for periods 3–12.
    expect(grid.querySelectorAll('.wk-period')).toHaveLength(12);
    expect(within(grid).getByRole('button', { name: /^Physics · Tue/ }).textContent).toContain('B204');
    // Only the cards take a tap: no current-time line, no hidden add zones, and the day row stays put.
    expect(within(grid).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([expect.stringMatching(/^Physics · Tue/)]);
    expect(document.querySelector('.wk-now')).toBeNull();
    fireEvent.click(within(grid).getByText('Tue'));
    expect(screen.getByRole('heading', { name: 'Week 6' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    swipe(document.querySelector('.week-pane')!, 'left');
    expect(screen.getByRole('heading', { name: 'Week 7' })).toBeTruthy();
  });

  it('sets back-to-back classes flush across the passing period between them', () => {
    mount({ ...initialData(), events: [weekly('Physics', 2, '08:00', '09:40'), weekly('Chemistry', 2, '10:10', '11:50')] });
    nav('Week');
    const card = (name: RegExp) => screen.getByRole('button', { name }) as HTMLElement;
    const physics = card(/^Physics · Tue/), chemistry = card(/^Chemistry · Tue/);
    expect(parseFloat(physics.style.top) + parseFloat(physics.style.height)).toBe(parseFloat(chemistry.style.top));
    expect(physics.classList.contains('joins-below')).toBe(true);
    expect(chemistry.classList.contains('joins-above')).toBe(true);
    // No day column carries a background of its own; today shows only in the header.
    expect(document.querySelector('.wk-col.is-today')).toBeNull();
  });

  it('runs through periods 11 and 12, with evening classes flush like the rest', () => {
    mount({ ...initialData(), events: [weekly('Seminar', 3, '18:30', '20:10'), weekly('Lab', 3, '20:20', '22:00')] });
    nav('Week');
    const labels = [...document.querySelectorAll('.wk-period')].map(p => p.textContent);
    expect(labels).toHaveLength(12);
    expect(labels.at(-1)).toBe(`12${timeParts(21 * 60 + 15).digits}${timeParts(22 * 60).digits}`);
    const card = (name: RegExp) => screen.getByRole('button', { name }) as HTMLElement;
    const seminar = card(/^Seminar · Wed/), lab = card(/^Lab · Wed/);
    expect(parseFloat(seminar.style.top) + parseFloat(seminar.style.height)).toBe(parseFloat(lab.style.top));
    expect(lab.classList.contains('joins-above')).toBe(true);
  });
});

describe('other screens', () => {
  it('turns a note into a to-do that keeps the whole note', () => {
    const store = mount({ ...initialData(), notes: [{ id: 'n1', text: 'Ask about research\nhttps://example.edu/r', createdAt: '2026-10-12T10:00:00.000Z', updatedAt: '2026-10-12T10:00:00.000Z' }] });
    nav('Notes');
    fireEvent.click(screen.getByRole('button', { name: /Ask about research/ }));
    expect(screen.getByRole('link', { name: 'https://example.edu/r' }).getAttribute('rel')).toContain('noopener');
    fireEvent.click(screen.getByRole('button', { name: 'Make it a to-do' }));
    const item = store.get().data.items[0];
    expect(item.details).toContain('https://example.edu/r');
    expect(store.get().data.notes[0].itemId).toBe(item.id);
  });

  it('keeps a half-written note as a draft', async () => {
    const store = mount();
    nav('Notes');
    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    type(screen.getByLabelText('Note'), 'Idea for the club poster');
    await waitFor(() => expect(store.get().data.noteDraft).toBe('Idea for the club poster'), { timeout: 2000 });
  });

  it('rejects impossible day settings with a clear message', () => {
    const store = mount();
    nav('Settings');
    fireEvent.click(screen.getByRole('button', { name: /^Your day/ }));
    setTime(/^Day ends/, '09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert').textContent).toMatch(/four hours/);
    expect(store.get().data.settings.dayEnd).toBe('23:00');
  });
});
