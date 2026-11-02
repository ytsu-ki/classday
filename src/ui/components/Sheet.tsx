import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { Icon } from './Icon';
import { t } from '../../i18n';

/**
 * A bottom sheet on phones and a centred dialog on wide screens.
 * Built on <dialog> so focus is contained and the page behind becomes inert.
 */
export function Sheet({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: ComponentChildren; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector<HTMLElement>('[data-autofocus]');
    first?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class={`sheet ${wide ? 'sheet-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === ref.current) onClose(); }}
    >
      <div class="sheet-panel">
        <span class="sheet-grip" aria-hidden="true" />
        <header class="sheet-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p class="sheet-sub">{subtitle}</p>}
          </div>
          <button type="button" class="icon-btn" aria-label={t.common.close} onClick={onClose}><Icon name="close" /></button>
        </header>
        <div class="sheet-content">{children}</div>
        {footer && <footer class="sheet-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}
