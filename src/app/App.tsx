import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { minimizeApp, watchLifecycle } from '../platform/native';
import { Icon, type IconName } from '../ui/components/Icon';
import { applyAccent, loadWallpaper } from '../ui/theme/accent';
import { applyTheme, watchSystemTheme } from '../ui/theme/mode';
import * as act from '../domain/actions';
import type { LanguageChoice } from '../domain/types';
import { t, type Language } from '../i18n';
import { setNativeLanguage } from '../platform/native';
import { applyLanguage, syncWithPhone } from '../ui/language';
import { keepRemindersInSync } from '../ui/reminders';
import { onNotificationOpened } from '../platform/notifications';
import { DataScreen } from '../ui/screens/Data';
import { NotesScreen } from '../ui/screens/Notes';
import { PlansScreen } from '../ui/screens/Plans';
import { AppearanceScreen, DayScreen, RemindersScreen, SettingsScreen } from '../ui/screens/Settings';
import { TimetableScreen } from '../ui/screens/Timetable';
import { TodayScreen } from '../ui/screens/Today';
import { WeekScreen } from '../ui/screens/Week';
import { CaptureSheet } from '../ui/sheets/CaptureSheet';
import { ClassTimesSheet } from '../ui/sheets/ClassTimesSheet';
import { EventSheet, FixedSheet } from '../ui/sheets/EventSheet';
import { ImportSheet } from '../ui/sheets/ImportSheet';
import { ItemSheet } from '../ui/sheets/ItemSheet';
import { ConfirmSheet, NoteSheet, RestoreSheet } from '../ui/sheets/MiscSheets';
import { StoreContext, UiContext, useAppState, useStore, useUi, type SheetSpec, type Ui, type View } from './context';
import type { Store } from './store';

const TABS: { view: 'today' | 'week' | 'plans' | 'notes'; icon: IconName }[] = [
  { view: 'today', icon: 'today' },
  { view: 'week', icon: 'week' },
  { view: 'plans', icon: 'plans' },
  { view: 'notes', icon: 'notes' },
];

const PARENT: Partial<Record<View, View>> = { day: 'settings', reminders: 'settings', appearance: 'settings', timetable: 'settings', data: 'settings' };

export function App({ store, notice }: { store: Store; notice?: string }) {
  // Set before anything renders; a new language re-renders everything below (see the `key` on .app),
  // since every component reads `t` while rendering.
  const [lang, setLang] = useState<Language>(() => applyLanguage(store.get().data.appearance.language));
  const [view, setView] = useState<View>('today');
  const [day, setDay] = useState(store.get().today);
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const state = useRef({ view, day, sheet });
  state.current = { view, day, sheet };

  const go = useCallback((next: View) => {
    setSheet(null);
    setView(next);
    if (next === 'today' && state.current.view !== 'today') setDay(store.get().today);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      mainRef.current?.focus({ preventScroll: true });
    });
  }, [store]);

  const ui: Ui = useMemo(() => ({
    view, go, day, showDay: setDay, sheet,
    open: setSheet,
    close: () => setSheet(null),
  }), [view, go, day, sheet]);

  // The phone's languages, and on Android 13+ a language chosen for the app in Android's settings.
  const syncLanguage = useCallback(() => {
    void syncWithPhone(store.get().data.appearance.language).then(({ systemChanged, fromPhone }) => {
      if (fromPhone) store.act(d => act.setLanguage(d, fromPhone), { undoable: false });
      else if (systemChanged) setLang(applyLanguage(store.get().data.appearance.language));
    });
  }, [store]);
  useEffect(syncLanguage, [syncLanguage]);

  // Android Back: close a sheet, then go up, then back to Today, then leave the app.
  const onBack = useCallback(() => {
    const s = state.current;
    if (s.sheet) setSheet(null);
    else if (PARENT[s.view]) go(PARENT[s.view]!);
    else if (s.view !== 'today') go('today');
    else if (s.day !== store.get().today) setDay(store.get().today);
    else minimizeApp();
  }, [go, store]);

  // Apply the theme, accent and language before the first paint, and again whenever they change.
  useLayoutEffect(() => {
    let accent = '';
    let language: LanguageChoice | null = null;
    const sync = () => {
      const look = store.get().data.appearance;
      applyTheme(look.theme);
      if (look.accent !== accent) applyAccent(accent = look.accent);
      // Android's own screens and dialogs follow a choice made in the app.
      if (language !== null && look.language !== language) void setNativeLanguage(look.language);
      language = look.language;
      setLang(applyLanguage(look.language));
    };
    sync();
    const unsubscribe = store.subscribe(sync);
    const unwatch = watchSystemTheme(sync);
    return () => { unsubscribe(); unwatch(); };
  }, [store]);

  // Reminders follow the data and the language; a tapped reminder opens Today.
  const reminders = useRef<ReturnType<typeof keepRemindersInSync> | null>(null);
  useEffect(() => {
    reminders.current = keepRemindersInSync(store);
    return () => reminders.current?.stop();
  }, [store, lang]);
  useEffect(() => onNotificationOpened(() => go('today')), [go]);

  useEffect(() => watchLifecycle({
    onBack,
    onPause: () => { void store.flush(); reminders.current?.now(); },
    onResume: () => {
      store.refresh(true);
      // The wallpaper or the phone's language may have changed while the app was away.
      void loadWallpaper().then(changed => changed && applyAccent(store.get().data.appearance.accent));
      syncLanguage();
    },
    onRestored: pluginId => {
      if (pluginId === 'Backup') store.showToast(t.app.restartedBackup, 'info');
    },
  }), [onBack, store, syncLanguage]);

  // Keep "now" current and roll over at midnight.
  useEffect(() => {
    const timer = setInterval(() => store.refresh(), 30_000);
    return () => clearInterval(timer);
  }, [store]);
  const today = store.get().today;
  useEffect(() => store.subscribe(s => {
    if (s.today !== today) setDay(s.today);
  }), [store, today]);

  useEffect(() => {
    if (notice) store.showToast(notice, 'info');
  }, []);

  return (
    <StoreContext.Provider value={store}>
      <UiContext.Provider value={ui}>
        <div class="app" key={lang}>
          <a class="skip-link" href="#main">{t.app.skip}</a>
          <Nav />
          <main id="main" class="main" tabIndex={-1} ref={mainRef}>
            <SaveBanner />
            {view === 'today' && <TodayScreen />}
            {view === 'week' && <WeekScreen />}
            {view === 'plans' && <PlansScreen />}
            {view === 'notes' && <NotesScreen />}
            {view === 'settings' && <SettingsScreen />}
            {view === 'day' && <DayScreen />}
            {view === 'reminders' && <RemindersScreen />}
            {view === 'appearance' && <AppearanceScreen />}
            {view === 'timetable' && <TimetableScreen />}
            {view === 'data' && <DataScreen />}
          </main>
          <ToastView />
          {sheet && <SheetHost sheet={sheet} />}
        </div>
      </UiContext.Provider>
    </StoreContext.Provider>
  );
}

function Nav() {
  const ui = useUi();
  const { save } = useAppState();
  const active = PARENT[ui.view] ?? ui.view;
  return (
    <nav class="nav" aria-label={t.nav.main}>
      <div class="nav-brand" aria-hidden="true">
        <span class="brand-mark" />
        <span>{t.common.appName}</span>
      </div>
      <ul>
        {TABS.map(tab => (
          <li key={tab.view}>
            <button type="button" class={active === tab.view ? 'is-active' : ''} aria-current={active === tab.view ? 'page' : undefined} onClick={() => ui.go(tab.view)}>
              <Icon name={tab.icon} />
              <span>{t.nav[tab.view]}</span>
            </button>
          </li>
        ))}
        <li class="nav-settings">
          <button type="button" class={active === 'settings' ? 'is-active' : ''} aria-current={active === 'settings' ? 'page' : undefined} onClick={() => ui.go('settings')}>
            <Icon name="settings" />
            <span>{t.nav.settings}</span>
            {save === 'failed' && <span class="nav-alert" aria-label={t.nav.savingAttention} />}
          </button>
        </li>
      </ul>
    </nav>
  );
}

function SaveBanner() {
  const { save } = useAppState();
  const ui = useUi();
  if (save !== 'failed') return null;
  return (
    <div class="banner" role="alert">
      <Icon name="alert" size={20} />
      <span class="grow">{t.app.saveFailed}</span>
      <button type="button" class="link-btn" onClick={() => ui.go('data')}>{t.app.backUpNow}</button>
    </div>
  );
}

function ToastView() {
  const { toast } = useAppState();
  const store = useStore();
  return (
    <div class="toast-region" role="status" aria-live="polite">
      {toast && (
        <div class={`toast toast-${toast.tone}`} key={toast.id}>
          <span class="grow">{toast.message}</span>
          {toast.undo && <button type="button" class="toast-action" onClick={() => store.undo()}>{t.common.undo}</button>}
          <button type="button" class="toast-close" aria-label={t.common.dismiss} onClick={() => store.dismissToast()}><Icon name="close" size={18} /></button>
        </div>
      )}
    </div>
  );
}

function SheetHost({ sheet }: { sheet: SheetSpec }) {
  switch (sheet.type) {
    case 'capture': return <CaptureSheet key="capture" due={sheet.due} />;
    case 'item': return <ItemSheet key={`item-${sheet.id}`} id={sheet.id} />;
    case 'note': return <NoteSheet key={`note-${sheet.id}`} id={sheet.id} />;
    case 'event': return <EventSheet key={`event-${sheet.id}-${sheet.day}-${sheet.start}`} id={sheet.id} day={sheet.day} start={sheet.start} />;
    case 'fixed': return <FixedSheet key={`fixed-${sheet.eventId}`} eventId={sheet.eventId} day={sheet.day} />;
    case 'import': return <ImportSheet key="import" />;
    case 'class-times': return <ClassTimesSheet key="class-times" />;
    case 'restore': return <RestoreSheet key="restore" report={sheet.report} source={sheet.source} />;
    case 'confirm': return <ConfirmSheet key={`confirm-${sheet.title}`} {...sheet} />;
  }
}
