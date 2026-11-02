import { useRef } from 'preact/hooks';

/**
 * A sideways swipe on an element: a quick, mostly horizontal stroke of at least 56 pixels, with a
 * finger, pen or mouse. `direction` is 1 for a swipe to the left (on to what comes next) and -1
 * for one to the right. The element should set `touch-action: pan-y`, so scrolling up and down
 * stays with the page. A tap that ends a swipe doesn't also open what it landed on.
 */
export function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number; at: number; id: number } | null>(null);
  const swiped = useRef(false);
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY, at: e.timeStamp, id: e.pointerId };
      swiped.current = false;
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.5 && e.timeStamp - s.at < 800) {
        swiped.current = true;
        onSwipe(dx < 0 ? 1 : -1);
      }
    },
    onPointerCancel: () => { start.current = null; },
    onClickCapture: (e: MouseEvent) => {
      if (!swiped.current) return;
      swiped.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
