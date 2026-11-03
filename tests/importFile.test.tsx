import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { Store } from '../src/app/store';
import { initialData } from '../src/domain/defaults';
import { pickFile } from '../src/platform/backup';

// The system file picker can't open in tests; each test says which file was chosen.
vi.mock('../src/platform/backup', async original => ({ ...(await original<typeof import('../src/platform/backup')>()), pickFile: vi.fn() }));
const choose = (bytes: Uint8Array | string, name: string) =>
  vi.mocked(pickFile).mockResolvedValueOnce(new File([(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes) as BlobPart], name));

const clock = () => new Date('2026-10-13T09:00:00');

function openImport() {
  const store = new Store(initialData(), null, clock);
  render(<App store={store} />);
  fireEvent.click(screen.getByRole('button', { name: 'Import timetable' }));
  return store;
}

afterEach(cleanup);

describe('importing from a file', () => {
  it('reads a saved page and starts the class times from the times it gives', async () => {
    const store = openImport();
    choose(`<html><body><table>
      <tr><th></th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th></tr>
      <tr><td>1<br>8:30-9:20</td><td rowspan="2">Calculus<br>A101</td><td></td><td></td><td></td><td></td></tr>
      <tr><td>2<br>9:30-10:20</td><td></td><td></td><td></td><td></td></tr>
    </table></body></html>`, 'timetable.html');
    fireEvent.click(screen.getByRole('button', { name: /^From a file/ }));
    await screen.findByText(/Read from your file/);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(store.get().data.events[0]).toMatchObject({ title: 'Calculus', weekday: 1, start: '08:30', end: '10:20', periods: [1, 2] });
    expect(store.get().data.timetable.semester!.periods).toEqual([{ start: '08:30', end: '09:20' }, { start: '09:30', end: '10:20' }]);
  });

  it('sends a calendar on to the calendar step, and asks for an older Excel file as .xlsx', async () => {
    openImport();
    choose(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]), 'kb.xls');
    fireEvent.click(screen.getByRole('button', { name: /^From a file/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/save it as \.xlsx/);
    choose('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n', 'school.ics');
    fireEvent.click(screen.getByRole('button', { name: /^From a file/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Import a calendar file' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'school.ics' })).toBeTruthy();
  });
});
