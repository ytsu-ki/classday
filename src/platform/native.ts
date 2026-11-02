import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { LanguageChoice, ThemeMode } from '../domain/types';

/** Bindings to the app's own Android plugins (android/app/src/main/java/cn/liubai/planner). */
export interface Snapshot { day: string; size: number }

interface PlannerStorePlugin {
  read(): Promise<{ data: string | null }>;
  readPrevious(): Promise<{ data: string | null }>;
  write(options: { data: string }): Promise<void>;
  snapshot(options: { data: string; day: string; keep: number }): Promise<void>;
  listSnapshots(): Promise<{ snapshots: Snapshot[] }>;
  readSnapshot(options: { day: string }): Promise<{ data: string }>;
}

interface BackupPlugin {
  save(options: { filename: string; data: string }): Promise<{ cancelled: boolean }>;
}

interface AppearancePlugin {
  /** Android 12+ wallpaper colors (primary, secondary, tertiary at tone 40); empty on older phones. */
  wallpaper(): Promise<{ colors: string[] }>;
  /** Tells Android 12+ the app's light/dark choice, so the launch screen matches it next time. */
  nightMode(options: { mode: ThemeMode }): Promise<void>;
  /** The phone's languages, and the app's own language when Android keeps one (13+, Settings → Apps). */
  languages(): Promise<{ system: string[]; app: string; perApp: boolean }>;
  /** The language of Android's own screens and dialogs; 'system' follows the phone. */
  setLanguage(options: { language: LanguageChoice }): Promise<void>;
}

export const isNative = () => Capacitor.isNativePlatform();
export const PlannerStore = registerPlugin<PlannerStorePlugin>('PlannerStore');
export const Backup = registerPlugin<BackupPlugin>('Backup');
const Appearance = registerPlugin<AppearancePlugin>('Appearance');

export async function wallpaperColors(): Promise<string[]> {
  if (!isNative()) return [];
  try {
    const { colors } = await Appearance.wallpaper();
    return Array.isArray(colors) ? colors.filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) : [];
  } catch {
    return [];
  }
}

/** Status and navigation bar icons that suit the app's background, and the launch screen's mode. */
export async function setSystemTheme(mode: ThemeMode, dark: boolean) {
  if (!isNative()) return;
  await Promise.allSettled([
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }),
    Appearance.nightMode({ mode }),
  ]);
}

export interface PhoneLanguages {
  /** The phone's language list, most preferred first. */
  system: string[];
  /** The app's own language from Android 13+ settings ('' to follow the phone), or null where Android has none. */
  app: string | null;
}

export async function phoneLanguages(): Promise<PhoneLanguages> {
  const browser = { system: [...(navigator.languages?.length ? navigator.languages : [navigator.language])], app: null };
  if (!isNative()) return browser;
  try {
    const result = await Appearance.languages();
    return { system: result.system?.length ? result.system : browser.system, app: result.perApp ? result.app ?? '' : null };
  } catch {
    return browser;
  }
}

export async function setNativeLanguage(language: LanguageChoice) {
  if (isNative()) await Appearance.setLanguage({ language }).catch(() => undefined);
}

export async function appVersion(): Promise<string> {
  if (!isNative()) return import.meta.env.APP_VERSION;
  try {
    return (await App.getInfo()).version;
  } catch {
    return import.meta.env.APP_VERSION;
  }
}

export interface LifecycleHandlers {
  onBack: () => void;
  onPause: () => void;
  onResume: () => void;
  /** The system restarted the app while a plugin screen was open. */
  onRestored?: (pluginId: string, ok: boolean, cancelled: boolean) => void;
}

export function watchLifecycle(handlers: LifecycleHandlers): () => void {
  const handles: Promise<PluginListenerHandle>[] = [];
  const visibility = () => (document.hidden ? handlers.onPause() : handlers.onResume());
  if (isNative()) {
    handles.push(App.addListener('backButton', handlers.onBack));
    handles.push(App.addListener('pause', handlers.onPause));
    handles.push(App.addListener('resume', handlers.onResume));
    handles.push(App.addListener('appRestoredResult', r =>
      handlers.onRestored?.(r.pluginId, r.success, Boolean((r.data as { cancelled?: boolean } | undefined)?.cancelled))));
  } else {
    document.addEventListener('visibilitychange', visibility);
  }
  window.addEventListener('pagehide', handlers.onPause);
  return () => {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', handlers.onPause);
    for (const h of handles) h.then(x => x.remove()).catch(() => undefined);
  };
}

export function minimizeApp() {
  if (isNative()) App.minimizeApp().catch(() => undefined);
}
