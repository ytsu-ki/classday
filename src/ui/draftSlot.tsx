import type { RefObject } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { eventEnd } from '../domain/notice';
import type { Interval } from '../domain/schedule';
import { t } from '../i18n';
import type { DateKey } from '../domain/types';
import { duration, span, timeParts } from './format';
import { slotStartAt, type Axis, type Period } from './weekGrid';

export interface DraftSlot {
  day: DateKey;
  start: number;
  end: number;
}

export const DRAFT_MIN = 30;
const SNAP_STEP = 15;
const PERIOD_SNAP_TOLERANCE = 12;
const MAX_END = 23 * 60 + 55;

/** Creates a dashed draft slot anchored to a tapped grid minute, snapped to periods or 30m steps. */
export function createDraftSlot(day: DateKey, rawMinute: number, periods: readonly Period[], range: Interval): DraftSlot {
  const maxStart = Math.max(range.start, Math.min(23 * 60, range.end - DRAFT_MIN));
  const start = Math.max(range.start, Math.min(maxStart, slotStartAt(rawMinute, periods, range)));
  const maxEnd = Math.min(MAX_END, Math.max(range.end, start + DRAFT_MIN));
  const suggestedEnd = eventEnd(start, {}, [...periods]);
  const end = Math.max(start + DRAFT_MIN, Math.min(maxEnd, suggestedEnd));
  return { day, start, end };
}

/** Resizes a draft slot's top or bottom edge, snapping to nearby periods or 15-minute increments. */
export function resizeDraftSlot(
  slot: DraftSlot,
  edge: 'start' | 'end',
  rawMinute: number,
  periods: readonly Period[],
  range: Interval,
): DraftSlot {
  const stepSnap = Math.round(rawMinute / SNAP_STEP) * SNAP_STEP;
  let snapped = stepSnap;
  if (periods.length > 0) {
    let bestDiff = PERIOD_SNAP_TOLERANCE + 1;
    for (const p of periods) {
      const target = edge === 'start' ? p.start : p.end;
      const diff = Math.abs(rawMinute - target);
      if (diff <= PERIOD_SNAP_TOLERANCE && diff < bestDiff) {
        bestDiff = diff;
        snapped = target;
      }
    }
  }
  const maxEnd = Math.min(MAX_END, Math.max(range.end, slot.end));
  if (edge === 'start') {
    const start = Math.max(range.start, Math.min(slot.end - DRAFT_MIN, snapped));
    return { ...slot, start };
  }
  const end = Math.max(slot.start + DRAFT_MIN, Math.min(maxEnd, snapped));
  return { ...slot, end };
}

const px = (n: number) => `${n}px`;

/**
 * Interactive dashed slot shown on Week/Today after tapping free space: drag either edge to set
 * duration, then tap the body to open the compact EventSheet with the chosen span prefilled.
 */
export function DraftBlock({
  slot,
  axis,
  range,
  periods,
  compact,
  containerRef,
  onChange,
  onEdit,
}: {
  slot: DraftSlot;
  axis: Axis;
  range: Interval;
  periods: readonly Period[];
  compact?: boolean;
  containerRef: RefObject<HTMLElement>;
  onChange: (next: DraftSlot) => void;
  onEdit: () => void;
}) {
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const snapRef = useRef<{ edge: 'start' | 'end'; top: number; axis: Axis; slot: DraftSlot; onChange: (next: DraftSlot) => void; id: number } | null>(null);
  const draggedAt = useRef(0);
  const latestRef = useRef({ slot, periods, range, onChange });
  latestRef.current = { slot, periods, range, onChange };

  const top = axis.y(slot.start);
  const rawHeight = axis.y(slot.end) - top;
  const height = Math.max(30, rawHeight);
  const rangeText = span(slot.start, slot.end);
  const durText = duration(slot.end - slot.start);

  const beginDrag = (edge: 'start' | 'end') => (e: PointerEvent) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    e.stopPropagation();
    e.preventDefault();
    const host = containerRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* noop in synthetic environments */ }
    snapRef.current = { edge, top: rect.top, axis, slot, onChange, id: e.pointerId };
    setDragging(edge);
  };

  const moveDrag = (e: PointerEvent) => {
    const s = snapRef.current;
    if (!s || s.id !== e.pointerId) return;
    e.stopPropagation();
    const relY = e.clientY - s.top;
    const rawMinute = s.axis.minuteAt(relY);
    const { slot: current, periods: p, range: r, onChange: commit } = latestRef.current;
    commit(resizeDraftSlot(current, s.edge, rawMinute, p, r));
  };

  const endDrag = (e: PointerEvent) => {
    const s = snapRef.current;
    if (!s || s.id !== e.pointerId) return;
    e.stopPropagation();
    snapRef.current = null;
    setDragging(null);
    draggedAt.current = Date.now();
  };

  const onHandleKey = (edge: 'start' | 'end') => (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowUp' ? -SNAP_STEP : e.key === 'ArrowDown' ? SNAP_STEP : 0;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    const target = (edge === 'start' ? slot.start : slot.end) + delta;
    onChange(resizeDraftSlot(slot, edge, target, periods, range));
  };

  return (
    <div
      class={`draft-slot${dragging ? ' is-dragging' : ''}${compact ? ' is-compact' : ''}`}
      data-draft-slot
      style={{ top: px(top), height: px(height) }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {dragging && <div class="draft-pill" aria-hidden="true">{rangeText} · {durText}</div>}
      <div
        class="draft-handle is-top"
        role="slider"
        tabIndex={0}
        aria-label={t.draft.adjustStart}
        aria-valuemin={range.start}
        aria-valuemax={slot.end - DRAFT_MIN}
        aria-valuenow={slot.start}
        aria-valuetext={timeParts(slot.start).digits}
        onPointerDown={beginDrag('start')}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onHandleKey('start')}
      />
      <button
        type="button"
        class="draft-body"
        aria-label={t.draft.editAria(rangeText)}
        onClick={e => {
          e.stopPropagation();
          if (Date.now() - draggedAt.current < 80) return;
          onEdit();
        }}
      >
        {compact ? (
          <>
            <strong class="draft-compact-time">{timeParts(slot.start).digits}</strong>
            <span class="draft-compact-sub">{height >= 54 ? timeParts(slot.end).digits : durText}</span>
          </>
        ) : (
          <>
            <strong class="draft-range">{rangeText}</strong>
            <span class="draft-hint">{durText}{t.format.separator}{t.draft.tapToEdit}</span>
          </>
        )}
      </button>
      <div
        class="draft-handle is-bottom"
        role="slider"
        tabIndex={0}
        aria-label={t.draft.adjustEnd}
        aria-valuemin={slot.start + DRAFT_MIN}
        aria-valuemax={Math.min(MAX_END, Math.max(range.end, slot.end))}
        aria-valuenow={slot.end}
        aria-valuetext={timeParts(slot.end).digits}
        onPointerDown={beginDrag('end')}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onHandleKey('end')}
      />
    </div>
  );
}
