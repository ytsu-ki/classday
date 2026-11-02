import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Clock, DateKey } from '../../domain/types';
import { t } from '../../i18n';
import { Calendar } from './Calendar';
import { Button, Field } from './controls';
import { TimeField } from './TimeField';

interface Request {
  title: string;
  date: DateKey | null;
  time?: Clock;
  /** Offer an optional time of day under the calendar. */
  withTime?: boolean;
  min?: DateKey;
  done: (date: DateKey, time?: Clock) => void;
}

export interface Page { title: string; body: ComponentChildren; footer: ComponentChildren; onClose: () => void }

/**
 * A full calendar that takes over the sheet it was opened from, like a second page: the sheet
 * shows `page` in place of its own form while it is open, so only one dialog is ever open.
 */
export function useDatePage(today: DateKey): { page: Page | null; open: (request: Request) => void } {
  const [request, setRequest] = useState<Request | null>(null);
  if (!request) return { page: null, open: setRequest };
  const close = () => setRequest(null);
  return {
    open: setRequest,
    page: {
      title: request.title,
      onClose: close,
      body: (
        <div class="date-page">
          <Calendar value={request.date} today={today} min={request.min} onChange={date => setRequest({ ...request, date })} />
          {request.withTime && (
            <Field label={t.calendar.time}>
              {fid => <TimeField id={fid} label={t.calendar.time} optional start="23:00" value={request.time ?? ''}
                onChange={v => setRequest({ ...request, time: v || undefined })} />}
            </Field>
          )}
        </div>
      ),
      footer: (
        <>
          <Button variant="ghost" onClick={close}>{t.common.cancel}</Button>
          <Button variant="primary" class="grow" disabled={!request.date} onClick={() => { request.done(request.date!, request.time); close(); }}>{t.common.done}</Button>
        </>
      ),
    },
  };
}
