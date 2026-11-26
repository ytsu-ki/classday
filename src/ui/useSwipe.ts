import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/** Pure gesture classifier: accepts steady swipes (>= 56px) or brisk flicks (>= 36px, >= 0.35 px/ms). */
export function evaluateSwipe(dx: number, dy: number, dt: number): 1 | -1 | 0 {
  if (dt >= 800) return 0;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax <= ay * 1.5) return 0;
  const v = dt > 0 ? ax / dt : 0;
  if (ax >= 56 || (ax >= 36 && v >= 0.35)) return dx < 0 ? 1 : -1;
  return 0;
}

/**
 * A sideways swipe on an element: a quick, mostly horizontal stroke with a finger, pen or mouse.
 * `direction` is 1 for a swipe to the left (on to what comes next) and -1 for one to the right.
 * Bails out early on vertical scroll gestures and expires its click guard if no click follows.
 */
export function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number; at: number; id: number } | null>(null);
  const swiped = useRef(false);
  const guardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGuard = () => {
    swiped.current = false;
    if (guardTimer.current) { clearTimeout(guardTimer.current); guardTimer.current = null; }
  };
  useEffect(() => () => { if (guardTimer.current) clearTimeout(guardTimer.current); }, []);

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0 || e.isPrimary === false) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-draft-slot]')) return;
      start.current = { x: e.clientX, y: e.clientY, at: e.timeStamp, id: e.pointerId };
      clearGuard();
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) start.current = null;
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== e.pointerId) return;
      const dir = evaluateSwipe(e.clientX - s.x, e.clientY - s.y, Math.max(0, e.timeStamp - s.at));
      if (dir !== 0) {
        swiped.current = true;
        guardTimer.current = setTimeout(() => { swiped.current = false; guardTimer.current = null; }, 80);
        onSwipe(dir);
      }
    },
    onPointerCancel: () => { start.current = null; },
    onClickCapture: (e: MouseEvent) => {
      if (!swiped.current) return;
      clearGuard();
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

/** Shared horizontal swipe + desktop ArrowLeft/ArrowRight navigation + directional slide state. */
export function usePager(onMove: (by: 1 | -1) => void, disabled: boolean) {
  const [slide, setSlide] = useState<'next' | 'previous' | ''>('');
  const move = useCallback((by: 1 | -1) => {
    setSlide(by > 0 ? 'next' : 'previous');
    onMove(by);
  }, [onMove]);
  const swipe = useSwipe(move);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest('[role="listbox"]'))) return;
      e.preventDefault();
      move(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, disabled]);
  return { slide, setSlide, move, swipe };
}
