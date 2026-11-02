import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useAppState, useStore, useUi, type View } from '../../app/context';
import * as act from '../../domain/actions';
import { upcomingReminders } from '../../domain/reminders';
import { settingsProblem } from '../../domain/schema';
import type { LanguageChoice, Reminders, Settings, ThemeMode } from '../../domain/types';
import { language as shown, LANGUAGE_NAMES, problemText, t } from '../../i18n';
import { appVersion } from '../../platform/native';
import { notificationPermission, requestNotifications, type NotificationPermission } from '../../platform/notifications';
import { AccentPicker } from '../components/AccentPicker';
import { Button, Field, IconButton, Segmented, Switch } from '../components/controls';
import { Icon, type IconName } from '../components/Icon';
import { TimeField } from '../components/TimeField';
import { clockTime, duration, joinFacts } from '../format';
import { labelFor } from '../theme/accent';

/** Settings is a short menu; each group opens its own page, so no page is crowded. */
export function SettingsScreen() {
  const { data, save } = useAppState();
  const ui = useUi();
  const [version, setVersion] = useState('');
  useEffect(() => { appVersion().then(setVersion); }, []);
  const s = data.settings, r = data.reminders, look = data.appearance;
  const imported = data.events.length;
  // The language in use, even when it follows the phone, so the summary never reads "System · System".
  const language = LANGUAGE_NAMES[shown];

  return (
    <section class="screen settings" aria-labelledby="settings-title">
      <header class="page-head">
        <div class="page-title">
          <p class="eyebrow">{t.settings.eyebrow}</p>
          <h1 id="settings-title">{t.settings.title}</h1>
        </div>
      </header>

      <nav class="settings-groups" aria-label={t.settings.more}>
        <section class="settings-group" aria-labelledby="settings-planning">
          <h2 id="settings-planning" class="group-title">{t.settings.planning}</h2>
          <div class="link-list">
            <LinkRow icon="clock" title={t.settings.yourDay} detail={`${clockTime(s.dayStart)} – ${clockTime(s.dayEnd)}`} onClick={() => ui.go('day')} />
            <LinkRow icon="bell" title={t.reminders.title} detail={r.deadlines ? t.reminders.lead[r.deadlineDays] : t.reminders.off} onClick={() => ui.go('reminders')} />
            <LinkRow icon="school" title={t.settings.timetable} detail={imported ? t.settings.classesAndCommitments(imported) : t.settings.importClasses} onClick={() => ui.go('timetable')} />
          </div>
        </section>
        <section class="settings-group" aria-labelledby="settings-app">
          <h2 id="settings-app" class="group-title">{t.settings.app}</h2>
          <div class="link-list">
            <LinkRow icon="sparkle" title={t.appearance.title} detail={joinFacts([t.appearance.themes[look.theme], language, labelFor(look.accent)])} onClick={() => ui.go('appearance')} />
            <LinkRow icon="shield" title={t.settings.backup} detail={save === 'failed' ? t.settings.savingAttention : t.settings.storedHere} onClick={() => ui.go('data')} alert={save === 'failed'} />
          </div>
        </section>
      </nav>

      <p class="about-line">{t.settings.aboutBody(version)}</p>
    </section>
  );
}

/** The header of a settings page: back to the menu, then the page's name. */
export function SubPage({ id, eyebrow, title, back = 'settings', children }: { id: string; eyebrow: string; title: string; back?: View; children: ComponentChildren }) {
  const ui = useUi();
  return (
    <section class="screen settings-page" aria-labelledby={id}>
      <header class="page-head">
        <div class="page-title">
          <IconButton icon="back" label={t.timetable.backToSettings} onClick={() => ui.go(back)} class="back-btn" />
          <div>
            <p class="eyebrow">{eyebrow}</p>
            <h1 id={id}>{title}</h1>
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}

export function DayScreen() {
  const { data } = useAppState();
  const store = useStore();
  const [draft, setDraft] = useState<Settings>(data.settings);
  const [error, setError] = useState('');
  useEffect(() => setDraft(data.settings), [data.settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => { setError(''); setDraft({ ...draft, [key]: value }); };
  const submit = (e: Event) => {
    e.preventDefault();
    const problem = settingsProblem(draft);
    if (problem) { setError(problemText(problem)); return; }
    store.act(d => act.setSettings(d, draft), { message: t.settings.saved });
  };

  return (
    <SubPage id="day-title" eyebrow={t.settings.planning} title={t.settings.yourDay}>
      <form class="panel form" onSubmit={submit} noValidate>
        <p class="panel-sub">{t.settings.yourDayHint}</p>
        <div class="form-grid">
          <Field label={t.settings.dayStarts}>{id => <TimeField id={id} label={t.settings.dayStarts} value={draft.dayStart} onChange={v => set('dayStart', v)} />}</Field>
          <Field label={t.settings.dayEnds}>{id => <TimeField id={id} label={t.settings.dayEnds} value={draft.dayEnd} onChange={v => set('dayEnd', v)} />}</Field>
          <Field label={t.settings.lunch}>{id => <TimeField id={id} label={t.settings.lunch} value={draft.lunch} onChange={v => set('lunch', v)} />}</Field>
          <Field label={t.settings.dinner}>{id => <TimeField id={id} label={t.settings.dinner} value={draft.dinner} onChange={v => set('dinner', v)} />}</Field>
        </div>
        <Field label={t.settings.mealBreaks} hint={t.settings.mealsKept}>
          {id => (
            <select id={id} value={draft.mealMinutes} onChange={e => set('mealMinutes', Number((e.target as HTMLSelectElement).value))}>
              {[30, 45, 60, 75, 90].map(m => <option value={m}>{duration(m)}</option>)}
            </select>
          )}
        </Field>

        {error && <p class="field-error" role="alert">{error}</p>}
        {dirty && (
          <div class="form-actions sticky-actions">
            <Button variant="ghost" onClick={() => { setDraft(data.settings); setError(''); }}>{t.common.cancel}</Button>
            <Button variant="primary" type="submit">{t.common.saveChanges}</Button>
          </div>
        )}
      </form>
    </SubPage>
  );
}

export function RemindersScreen() {
  const { data } = useAppState();
  const store = useStore();
  const r = data.reminders;
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  useEffect(() => { notificationPermission().then(setPermission); }, []);
  const change = (patch: Partial<Reminders>) => store.act(d => act.setReminders(d, patch), { undoable: false });
  const allow = async () => {
    setPermission(await requestNotifications());
    change({ asked: true });
  };
  const upcoming = upcomingReminders(data, new Date()).length;

  return (
    <SubPage id="reminders-title" eyebrow={t.settings.planning} title={t.reminders.title}>
      <section class="panel">
        {permission === 'unsupported' && <p class="notice">{t.reminders.browser}</p>}
        {permission === 'denied' && <p class="notice notice-warn">{t.reminders.denied}</p>}
        {permission === 'prompt' && (
          <div class="notice">
            <span class="grow">{t.reminders.askBody}</span>
            <Button size="sm" variant="primary" icon="bell" onClick={allow}>{t.reminders.allow}</Button>
          </div>
        )}
        <div class="form-stack">
          <Switch checked={r.deadlines} onChange={v => change({ deadlines: v })} label={t.reminders.deadlines} hint={t.reminders.deadlinesHint} />
          {r.deadlines && (
            <Segmented<'0' | '1' | '2'> size="sm" label={t.reminders.deadlines} value={String(r.deadlineDays) as '0' | '1' | '2'}
              onChange={v => change({ deadlineDays: Number(v) as Reminders['deadlineDays'] })}
              options={[{ value: '0', label: t.reminders.lead[0] }, { value: '1', label: t.reminders.lead[1] }, { value: '2', label: t.reminders.lead[2] }]} />
          )}
          <Field label={t.reminders.at} hint={permission === 'granted' ? t.reminders.upcoming(upcoming) : t.reminders.atHint}>
            {id => <TimeField id={id} label={t.reminders.at} value={r.at} onChange={v => { if (v) change({ at: v }); }} />}
          </Field>
          <p class="field-hint">{t.reminders.eventsHint}</p>
        </div>
      </section>
    </SubPage>
  );
}

export function AppearanceScreen() {
  const { data } = useAppState();
  const store = useStore();
  const quiet = { undoable: false };
  return (
    <SubPage id="appearance-title" eyebrow={t.settings.app} title={t.appearance.title}>
      <section class="panel" aria-label={t.appearance.title}>
        <div class="picker">
          <p class="picker-title" aria-hidden="true">{t.appearance.theme}</p>
          <Segmented<ThemeMode> label={t.appearance.theme} value={data.appearance.theme}
            onChange={theme => store.act(d => act.setTheme(d, theme), quiet)} options={[
              { value: 'system', label: t.appearance.themes.system, icon: 'phone' },
              { value: 'light', label: t.appearance.themes.light, icon: 'sun' },
              { value: 'dark', label: t.appearance.themes.dark, icon: 'moon' },
            ]} />
        </div>
        <div class="picker">
          <p class="picker-title" aria-hidden="true">{t.appearance.language}</p>
          <Segmented<LanguageChoice> label={t.appearance.language} value={data.appearance.language}
            onChange={language => store.act(d => act.setLanguage(d, language), quiet)} options={[
              { value: 'system', label: t.appearance.systemLanguage, icon: 'phone' },
              { value: 'en', label: LANGUAGE_NAMES.en, lang: 'en' },
              { value: 'zh-Hans', label: LANGUAGE_NAMES['zh-Hans'], lang: 'zh-Hans' },
            ]} />
        </div>
        <AccentPicker value={data.appearance.accent} onChange={accent => store.act(d => act.setAccent(d, accent), quiet)} />
      </section>
    </SubPage>
  );
}

export function LinkRow({ icon, title, detail, onClick, alert }: { icon: IconName; title: string; detail: string; onClick: () => void; alert?: boolean }) {
  return (
    <button type="button" class={`link-row ${alert ? 'has-alert' : ''}`} onClick={onClick}>
      <span class="link-icon"><Icon name={icon} /></span>
      <span class="grow"><strong>{title}</strong><span>{detail}</span></span>
      <Icon name="forward" size={18} />
    </button>
  );
}
