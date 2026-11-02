import type { Clock, DateKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(date = new Date()): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Noon avoids daylight-saving edges when doing calendar arithmetic. */
export function dateOf(day: DateKey): Date {
  return new Date(`${day}T12:00:00`);
}

export function addDays(day: DateKey, n: number): DateKey {
  const d = dateOf(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / 86_400_000);
}

/** Monday of the week containing `day`. */
export function weekOf(day: DateKey): DateKey {
  return addDays(day, -((dateOf(day).getDay() + 6) % 7));
}

export function weekdayOf(day: DateKey): number {
  return dateOf(day).getDay();
}

export function toMinutes(clock: Clock): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

export function toClock(minutes: number): Clock {
  const m = Math.max(0, Math.min(1440, Math.round(minutes)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function minuteOfDay(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

export const isDateKey = (v: unknown): v is DateKey =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(dateOf(v).getTime()) && dayKey(dateOf(v)) === v;

export const isClock = (v: unknown): v is Clock => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export const roundUp = (minutes: number, step = 5) => Math.ceil(minutes / step) * step;

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
