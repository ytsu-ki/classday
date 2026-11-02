// jsdom lacks a few browser features the interface relies on.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  }
  const proto = window.HTMLDialogElement?.prototype;
  if (proto && !proto.showModal) {
    proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    proto.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
  }
  // Node's own localStorage global (empty without --localstorage-file) hides jsdom's; use one in memory.
  let usable = false;
  try { usable = typeof localStorage.getItem === 'function'; } catch { /* not usable */ }
  if (!usable) {
    const items = new Map<string, string>();
    const memory: Storage = {
      get length() { return items.size; },
      key: i => [...items.keys()][i] ?? null,
      getItem: k => items.get(k) ?? null,
      setItem: (k, v) => { items.set(k, String(v)); },
      removeItem: k => { items.delete(k); },
      clear: () => items.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
  }
  // Pointer events carry mouse coordinates; jsdom has no PointerEvent of its own.
  if (!window.PointerEvent) {
    class PointerEvent extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'touch';
      }
    }
    window.PointerEvent = PointerEvent as unknown as typeof window.PointerEvent;
  }
  // Preact listens for lower-case event names only where the element has the `on…` property.
  for (const name of ['onpointerdown', 'onpointerup', 'onpointercancel'])
    if (!(name in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, name, { value: null, writable: true, configurable: true });
  if (!window.requestAnimationFrame) window.requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0) as unknown as number;
  window.scrollTo = () => {};
}
