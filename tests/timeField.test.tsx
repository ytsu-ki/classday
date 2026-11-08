import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toMinutes } from '../src/domain/time';
import { TimeField } from '../src/ui/components/TimeField';
import { prefers24h, time } from '../src/ui/format';

function Harness({ initial = '', optional, disabled, onValue }: { initial?: string; optional?: boolean; disabled?: boolean; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return <TimeField label="Starts" value={value} optional={optional} disabled={disabled} onChange={v => { setValue(v); onValue?.(v); }} />;
}

const field = () => screen.getByRole('button', { name: /^Starts/ });
const wheel = (name: string) => screen.getByRole('listbox', { name });
const pick = (name: string, option: string) => fireEvent.click(within(wheel(name)).getByRole('option', { name: option }));
const shows = (clock: string) => expect(field().getAttribute('aria-label')).toBe(`Starts: ${time(toMinutes(clock))}`);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('time field', () => {
  it('opens scroll wheels under the field, not a clock dial, and taps choose a row', () => {
    render(<Harness initial="08:00" />);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(field());
    expect(field().getAttribute('aria-expanded')).toBe('true');
    pick('Hour', '10');
    pick('Minute', '30');
    shows('10:30');
    if (prefers24h) pick('Hour', '22');
    else pick('am or pm', 'pm');
    shows('22:30');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('scrolls the wheels into view as they open', async () => {
    const scrolled = vi.fn();
    const before = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrolled;
    try {
      render(<Harness initial="08:00" />);
      fireEvent.click(field());
      await vi.waitFor(() => expect(scrolled).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' }));
      expect(scrolled.mock.contexts[0]).toBe(screen.getByRole('group', { name: 'Starts' }));
    } finally {
      Element.prototype.scrollIntoView = before;
    }
  });

  it('settles on the row a scroll stops at', () => {
    vi.useFakeTimers();
    const onValue = vi.fn();
    render(<Harness initial="08:00" onValue={onValue} />);
    fireEvent.click(field());
    const minutes = wheel('Minute');
    minutes.scrollTop = 9 * 40;
    fireEvent.scroll(minutes);
    expect(onValue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onValue).toHaveBeenLastCalledWith('08:45');
  });

  it('moves with the arrow keys', () => {
    render(<Harness initial="08:00" />);
    fireEvent.click(field());
    fireEvent.keyDown(wheel('Hour'), { key: 'ArrowDown' });
    fireEvent.keyDown(wheel('Minute'), { key: 'ArrowUp' });
    shows('09:00');
    fireEvent.keyDown(wheel('Minute'), { key: 'ArrowDown' });
    shows('09:05');
  });

  it('keeps a minute that is off the five-minute steps', () => {
    render(<Harness initial="08:47" />);
    fireEvent.click(field());
    expect(within(wheel('Minute')).getByRole('option', { name: '47' }).getAttribute('aria-selected')).toBe('true');
    pick('Hour', '9');
    shows('09:47');
  });

  it('starts an empty field at a sensible time and can clear an optional one', () => {
    const onValue = vi.fn();
    render(<Harness optional onValue={onValue} />);
    expect(field().textContent).toContain('Set a time');
    fireEvent.click(field());
    expect(onValue).toHaveBeenLastCalledWith('09:00');
    fireEvent.click(screen.getByRole('button', { name: 'No time' }));
    expect(onValue).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('stays closed while disabled', () => {
    render(<Harness initial="08:00" disabled />);
    expect((field() as HTMLButtonElement).disabled).toBe(true);
  });
});
