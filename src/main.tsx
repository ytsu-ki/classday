import '@fontsource-variable/figtree';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/screens.css';
import { render } from 'preact';
import { App } from './app/App';
import { Recovery } from './app/Recovery';
import { boot, Saver, type BootNotice } from './app/repository';
import { services } from './app/services';
import { Store } from './app/store';
import { initialData } from './domain/defaults';
import { dayKey } from './domain/time';
import { shortDate } from './ui/format';
import type { PlannerData } from './domain/types';
import { defaultBackend } from './platform/storage';
import { t } from './i18n';
import { applyLanguage, lastLanguage, loadPhoneLanguages } from './ui/language';
import { loadWallpaper } from './ui/theme/accent';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const root = document.getElementById('app')!;
const backend = defaultBackend();
services.backend = backend;

function noticeText(notice: BootNotice): string {
  switch (notice.code) {
    case 'dropped': return t.boot.dropped(notice.count);
    case 'restored-previous': return t.boot.restoredPrevious;
    case 'restored-snapshot': return t.boot.restoredSnapshot(shortDate(notice.day));
  }
}

function start(data: PlannerData, notice?: string) {
  let store: Store;
  const saver = new Saver(backend, status => store?.setSaveStatus(status), () => dayKey());
  store = new Store(data, saver);
  // Save the freshly planned state (and today's automatic copy) right away.
  saver.schedule(store.get().data);
  root.replaceChildren();
  render(<App store={store} notice={notice} />, root);
}

async function main() {
  // Wallpaper colors and the phone's languages are read alongside the data, so the first paint
  // already has the right accent and language.
  const [result] = await Promise.all([boot(backend), loadWallpaper(), loadPhoneLanguages()]);
  if (result.status === 'broken') {
    applyLanguage(lastLanguage());
    root.replaceChildren();
    render(
      <Recovery raw={result.raw} error={result.error} backend={backend}
        onRecovered={(data, message) => start(data ?? initialData(), message)} />,
      root,
    );
    return;
  }
  applyLanguage(result.data.appearance.language);
  if (result.status === 'fresh') start(result.data);
  else start(result.data, result.notice && noticeText(result.notice));
}

main().catch(() => {
  const page = document.createElement('main');
  page.className = 'recovery';
  const title = document.createElement('h1');
  const body = document.createElement('p');
  title.textContent = t.app.fatalTitle;
  body.textContent = t.app.fatalBody;
  page.append(title, body);
  root.replaceChildren(page);
});
