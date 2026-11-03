import { useRef } from 'preact/hooks';
import { breakLength, classLength, withBreak, withLength, withPeriodAdded, withTime } from '../../domain/periods';
import type { ClassPeriod } from '../../domain/types';
import { t } from '../../i18n';
import { duration } from '../format';
import { Button, Field } from './controls';
import { TimeField } from './TimeField';

const LENGTHS = [30, 35, 40, 45, 50, 55, 60, 75, 80, 90, 100, 120];
const BREAKS = [0, 5, 10, 15, 20, 25, 30];
/** The choices, with the table's own value among them. */
const choices = (list: number[], value: number) => [...new Set([...list, value])].sort((a, b) => a - b);

/**
 * A school's class times, for the import and Settings → Timetable. Class length and break set
 * every period at once; moving one period moves the rest of its block (see domain/periods.ts).
 * `keep` is how many periods classes use, which can't be removed.
 */
export function PeriodTable({ periods, onChange, keep = 0 }: { periods: ClassPeriod[]; onChange: (periods: ClassPeriod[]) => void; keep?: number }) {
  const length = classLength(periods), gap = breakLength(periods);
  const added = withPeriodAdded(periods);
  // A wheel sends a time for every step it turns. Each applies to the table as it was before the
  // first, so passing through a time that doesn't fit leaves the other periods where they were.
  const edit = useRef<{ n: number; key: 'start' | 'end'; from: ClassPeriod[]; to: ClassPeriod[] } | null>(null);
  const setTime = (n: number, key: 'start' | 'end', clock: string) => {
    const last = edit.current;
    const from = last && last.n === n && last.key === key && last.to === periods ? last.from : periods;
    const to = withTime(from, n, key, clock);
    edit.current = { n, key, from, to };
    onChange(to);
  };
  return (
    <div class="period-table">
      {periods.length > 0 && (
        <>
          <div class="form-grid">
            <Field label={t.classTimes.length}>
              {id => (
                <select id={id} value={length} onChange={e => onChange(withLength(periods, Number((e.target as HTMLSelectElement).value)))}>
                  {choices(LENGTHS, length).map(m => <option value={m}>{duration(m)}</option>)}
                </select>
              )}
            </Field>
            <Field label={t.classTimes.break}>
              {id => (
                <select id={id} value={gap} onChange={e => onChange(withBreak(periods, Number((e.target as HTMLSelectElement).value)))}>
                  {choices(BREAKS, gap).map(m => <option value={m}>{duration(m)}</option>)}
                </select>
              )}
            </Field>
          </div>
          <div class="period-grid">
            <span aria-hidden="true">{t.classTimes.period}</span><span aria-hidden="true">{t.classTimes.starts}</span><span aria-hidden="true">{t.classTimes.ends}</span>
            {periods.map((p, i) => (
              <>
                <span class="period-n">{i + 1}</span>
                <TimeField label={t.classTimes.periodStarts(i + 1)} value={p.start} onChange={v => setTime(i + 1, 'start', v)} />
                <TimeField label={t.classTimes.periodEnds(i + 1)} value={p.end} onChange={v => setTime(i + 1, 'end', v)} />
              </>
            ))}
          </div>
        </>
      )}
      <div class="button-row">
        <Button size="sm" variant="soft" icon="plus" disabled={!added} onClick={() => added && onChange(added)}>{t.classTimes.add}</Button>
        {periods.length > keep && <Button size="sm" variant="ghost" onClick={() => onChange(periods.slice(0, -1))}>{t.classTimes.removeLast}</Button>}
        {keep === 0 && periods.length > 1 && <Button size="sm" variant="ghost" onClick={() => onChange([])}>{t.classTimes.removeAll}</Button>}
      </div>
    </div>
  );
}
