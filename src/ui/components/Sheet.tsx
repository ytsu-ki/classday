import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useId, useRef } from 'preact/hooks';
import { UiContext } from '../../app/context';
import { t } from '../../i18n';
import { Icon } from './Icon';

/** Whether the enclosing sheet is the active top sheet in the stack. */
export const SheetActiveContext = createContext(true);

/**
 * A bottom sheet on phones and a centred dialog on wide screens.
 * Built on <dialog> so focus is contained and the page behind becomes inert.
 */
export function Sheet({ title, subtitle, onClose, onBack, children, footer }: {
  title: string; subtitle?: ComponentChildren; onClose: () => void; onBack?: () => void; children: ComponentChildren; footer?: ComponentChildren;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const active = useContext(SheetActiveContext);
  const ui = useContext(UiContext);
  const backHandlerRef = useRef(onBack ?? onClose);
  backHandlerRef.current = onBack ?? onClose;
  const previousRef = useRef<HTMLElement | null>(null);
  const autofocusedRef = useRef(false);
  const dragRef = useRef<{
    id: number; startX: number; startY: number; lastY: number; lastAt: number; vy: number; locked: boolean;
  } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (active) {
      if (!previousRef.current) previousRef.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) dialog.showModal();
      if (!autofocusedRef.current) {
        autofocusedRef.current = true;
        dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [active]);

  useEffect(() => () => {
    const dialog = ref.current;
    if (dialog?.open) dialog.close();
    const prev = previousRef.current;
    if (prev?.isConnected) prev.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!active || !ui) return;
    return ui.registerBack(() => {
      backHandlerRef.current();
      return true;
    });
  }, [active, ui]);

  const onPointerDown = (e: PointerEvent) => {
    if (!active || e.button !== 0 || e.isPrimary === false || window.innerWidth >= 640) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [role="listbox"], [data-no-drag]')) return;
    if (target?.closest('.sheet-content') && contentRef.current && contentRef.current.scrollTop > 0) return;
    dragRef.current = {
      id: e.pointerId, startX: e.clientX, startY: e.clientY, lastY: e.clientY, lastAt: e.timeStamp, vy: 0, locked: false,
    };
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.locked) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      if (dy <= 0 || Math.abs(dx) > dy * 0.7) {
        dragRef.current = null;
        return;
      }
      d.locked = true;
      panelRef.current?.setAttribute('data-dragging', 'true');
    }
    const dt = e.timeStamp - d.lastAt;
    if (dt > 0) d.vy = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastAt = e.timeStamp;
    const panel = panelRef.current;
    if (panel) {
      panel.style.transition = 'none';
      panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
    }
  };

  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.id !== e.pointerId || !d.locked) return;
    const dy = Math.max(0, e.clientY - d.startY);
    const panel = panelRef.current;
    panel?.removeAttribute('data-dragging');
    const height = panel?.getBoundingClientRect().height || 400;
    if (!cancelled && (dy > Math.min(120, height * 0.28) || d.vy > 0.55)) {
      onClose();
      return;
    }
    if (panel) {
      panel.style.transition = 'transform var(--medium) var(--ease)';
      panel.style.transform = '';
    }
  };

  return (
    <dialog
      ref={ref}
      hidden={!active}
      class="sheet"
      aria-labelledby={titleId}
      onCancel={e => { e.preventDefault(); backHandlerRef.current(); }}
      onClick={e => { if (e.target === ref.current) onClose(); }}
    >
      <div
        ref={panelRef}
        class="sheet-panel"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={e => endDrag(e, false)}
        onPointerCancel={e => endDrag(e, true)}
      >
        <span class="sheet-grip" aria-hidden="true" />
        <header class="sheet-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p class="sheet-sub">{subtitle}</p>}
          </div>
          <button type="button" class="icon-btn" aria-label={t.common.close} onClick={onClose}><Icon name="close" /></button>
        </header>
        <div ref={contentRef} class="sheet-content">{children}</div>
        {footer && <footer class="sheet-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}
