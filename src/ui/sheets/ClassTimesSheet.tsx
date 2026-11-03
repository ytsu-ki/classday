import { useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import * as act from '../../domain/actions';
import { EXAMPLE_PERIODS, periodsInUse, periodsProblem } from '../../domain/periods';
import type { ClassPeriod } from '../../domain/types';
import { problemText, t } from '../../i18n';
import { Button } from '../components/controls';
import { PeriodTable } from '../components/PeriodTable';
import { Sheet } from '../components/Sheet';

/** The school's class times. Before any are set it starts from the example times, ready to adjust. */
export function ClassTimesSheet() {
  const { data } = useAppState();
  const store = useStore();
  const ui = useUi();
  const saved = data.timetable.semester?.periods ?? [];
  const [periods, setPeriods] = useState<ClassPeriod[]>(() => (saved.length ? saved : [...EXAMPLE_PERIODS]));
  const [error, setError] = useState('');
  const inUse = periodsInUse(data);

  const save = () => {
    const problem = periodsProblem(periods, inUse);
    if (problem) return setError(problemText(problem));
    const moved = store.act(d => act.setClassTimes(d, periods), { message: n => t.classTimes.saved(n) });
    if (moved !== undefined) ui.close();
  };

  return (
    <Sheet title={t.classTimes.title} onClose={ui.close} footer={<>
      <Button variant="ghost" onClick={ui.close}>{t.common.cancel}</Button>
      <Button variant="primary" class="grow" onClick={save}>{t.common.save}</Button>
    </>}>
      <div class="form-stack">
        <p class="field-hint">{t.classTimes.hint}</p>
        <PeriodTable periods={periods} keep={inUse} onChange={next => { setPeriods(next); setError(''); }} />
        {error && <p class="field-error" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}
