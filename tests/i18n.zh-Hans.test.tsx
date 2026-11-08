import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { Store } from '../src/app/store';
import * as act from '../src/domain/actions';
import { initialData, newItem } from '../src/domain/defaults';
import type { LanguageChoice, PlannerData } from '../src/domain/types';
import { resolveLanguage, setLanguage, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { zhHans } from '../src/i18n/zh-Hans';
import { dueLabel, duration, longDate, weekRange } from '../src/ui/format';
import { choiceFromAndroid, LANGUAGE_HINT_KEY, resetLanguage, syncWithPhone } from '../src/ui/language';
import { once, weekly } from './helpers';

const phone = vi.hoisted(() => ({ system: ['en-US'] as string[], app: null as string | null, set: [] as string[] }));
vi.mock('../src/platform/native', async original => ({
  ...(await original<typeof import('../src/platform/native')>()),
  phoneLanguages: async () => ({ system: phone.system, app: phone.app }),
  setNativeLanguage: async (language: string) => { phone.set.push(language); },
}));

const clock = () => new Date('2026-10-13T09:00:00'); // Tuesday morning
const TODAY = '2026-10-13';

beforeEach(() => {
  phone.system = ['en-US'];
  phone.app = null;
  phone.set = [];
  resetLanguage(['en-US']);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  setLanguage('en');
  resetLanguage(['en-US']);
});

/** A planner with something on every screen: classes, events of each kind, to-dos in each group, notes. */
function busyPlanner(language: LanguageChoice): PlannerData {
  const d = initialData();
  d.appearance.language = language;
  d.events = [
    weekly('高等数学', 2, '10:00', '11:40', { location: '教学楼A101', teacher: '王老师' }),
    weekly('大学物理', 4, '14:00', '15:40', { weeks: [1, 3, 5, 7, 9] }),
    weekly('健身', 1, '20:30', '21:15', { days: [1, 3, 5], remind: 15 }),
    weekly('考试周复习', 2, '19:00', '20:00', { category: 'short', until: '2026-11-08' }),
    once('运动会', TODAY, '00:00', '23:59', { allDay: true }),
  ];
  d.items = [
    newItem('实验报告', { id: 'report', estimate: 120, due: '2026-10-16', important: true }),
    newItem('交作业', { id: 'late', estimate: 30, due: '2026-10-10' }),
    newItem('给导师发邮件', { id: 'mail', urgent: true }),
    newItem('交表', { id: 'soon', due: TODAY, dueTime: '18:00', important: true, urgent: true }),
  ];
  d.notes = [{ id: 'n1', text: '期末复习计划\n先整理笔记', createdAt: '2026-10-12T08:00:00.000Z', updatedAt: '2026-10-12T08:00:00.000Z' }];
  return d;
}

function mount(data: PlannerData) {
  const store = new Store(data, null, clock);
  render(<App store={store} />);
  return store;
}

/** Words that may stay as they are in Chinese: the app's name, technical names and units. */
const ALLOWED = new Set(['Day', 'Planner', 'Android', 'JavaScript', 'VPN', 'KB', 'MB', 'ics', 'PDF', 'Excel', 'xlsx', 'xls', 'WPS', 'English']);

function englishLeftovers(): string[] {
  const texts = [document.body.textContent ?? ''];
  for (const el of document.querySelectorAll('[aria-label], [placeholder], [title]'))
    for (const name of ['aria-label', 'placeholder', 'title']) texts.push(el.getAttribute(name) ?? '');
  // Text marked as English on purpose (the language's own name) is not a leftover.
  for (const el of document.querySelectorAll('[lang="en"]')) texts.push(`-${el.textContent ?? ''}`);
  const words = texts.join(' ').match(/[A-Za-z]{2,}/g) ?? [];
  return [...new Set(words.filter(w => !ALLOWED.has(w)))];
}

describe('the interface in Simplified Chinese', () => {
  it('leaves no English on any screen or sheet', () => {
    mount(busyPlanner('zh-Hans'));
    const seen: Record<string, string[]> = {};
    const check = (where: string) => { const left = englishLeftovers(); if (left.length) seen[where] = left; };
    const nav = (name: string) => fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name }));

    const close = () => fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0]);
    const header = (name: string) => fireEvent.click(within(document.querySelector('.page-head') as HTMLElement).getByRole('button', { name }));

    check('today');
    header('添加日程');
    check('event sheet');
    fireEvent.paste(screen.getByLabelText('名称'), { clipboardData: { getData: () => '全体成员，本周三下午2点在报告厅举行年级大会' } });
    check('event from a notice');
    fireEvent.click(screen.getByRole('radio', { name: '短期' }));
    check('short-term event');
    fireEvent.click(screen.getByRole('button', { name: /^开始日期/ }));
    check('calendar');
    fireEvent.click(within(document.querySelector('.sheet-foot') as HTMLElement).getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('switch', { name: '全天' }));
    check('all-day event');
    close();
    fireEvent.click(screen.getByRole('button', { name: /^高等数学/ }));
    check('event details');
    close();

    nav('本周');
    check('week');
    nav('待办');
    check('to-dos');
    header('添加待办');
    check('capture');
    fireEvent.input(screen.getByPlaceholderText(t.capture.todoPlaceholder), { target: { value: '实验报告 周五 2小时 紧急' } });
    check('capture chips');
    fireEvent.click(screen.getByRole('button', { name: /^截止日期/ }));
    check('deadline calendar');
    close();
    fireEvent.click(screen.getByRole('button', { name: /^实验报告/ }));
    check('item sheet');
    close();
    fireEvent.click(screen.getByRole('radio', { name: '已完成' }));
    check('done');
    nav('笔记');
    check('notes');
    nav('设置');
    check('settings');
    const back = () => fireEvent.click(screen.getByRole('button', { name: '返回设置' }));
    fireEvent.click(screen.getByRole('button', { name: /^你的一天/ }));
    check('your day');
    back();
    fireEvent.click(screen.getByRole('button', { name: /^提醒/ }));
    check('reminders');
    back();
    fireEvent.click(screen.getByRole('button', { name: /^外观/ }));
    check('appearance');
    back();
    fireEvent.click(screen.getByRole('button', { name: /^课表/ }));
    check('timetable');
    fireEvent.click(screen.getByRole('button', { name: /高等数学/ }));
    check('timetable event');
    fireEvent.click(screen.getByRole('button', { name: '周次' }));
    check('event weeks');
    fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '导入课表' }));
    check('import');
    fireEvent.click(screen.getByRole('button', { name: /粘贴或打开文字/ }));
    check('import text');
    fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '返回设置' }));
    fireEvent.click(screen.getByRole('button', { name: /备份与数据/ }));
    check('data');

    expect(seen).toEqual({});
  });

  it('switches language from Settings and back', () => {
    const store = mount(busyPlanner('en'));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /^Appearance/ }));
    const group = screen.getByRole('radiogroup', { name: 'Language' });
    fireEvent.click(within(group).getByRole('radio', { name: '简体中文' }));
    expect(store.get().data.appearance.language).toBe('zh-Hans');
    expect(document.documentElement.lang).toBe('zh-Hans');
    expect(screen.getByRole('heading', { name: '外观' })).toBeTruthy();
    expect(localStorage.getItem(LANGUAGE_HINT_KEY)).toBe('zh-Hans');
    // A look change is not an edit to undo, and native screens follow it.
    expect(store.get().canUndo).toBe(false);
    expect(phone.set).toEqual(['zh-Hans']);

    fireEvent.click(within(screen.getByRole('radiogroup', { name: '语言' })).getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });

  it('shows problems from the domain in the chosen language', () => {
    const store = mount(busyPlanner('zh-Hans'));
    store.act(d => act.saveNote(d, null, '   ', ''));
    expect(store.get().toast).toMatchObject({ tone: 'error', message: '先写点什么吧。' });
  });
});

describe('choosing the language', () => {
  it('follows the first English or Chinese language on the phone', () => {
    expect(resolveLanguage('system', ['zh-CN'])).toBe('zh-Hans');
    expect(resolveLanguage('system', ['zh-Hant-TW', 'en-US'])).toBe('zh-Hans');
    expect(resolveLanguage('system', ['en-GB', 'zh-CN'])).toBe('en');
    expect(resolveLanguage('system', ['fr-FR', 'zh-CN'])).toBe('zh-Hans');
    expect(resolveLanguage('system', ['fr-FR'])).toBe('en');
    expect(resolveLanguage('en', ['zh-CN'])).toBe('en');
  });

  it('starts in Chinese on a Chinese phone when nothing was chosen', () => {
    resetLanguage(['zh-CN', 'en-US']);
    mount(busyPlanner('system'));
    expect(document.documentElement.lang).toBe('zh-Hans');
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeTruthy();
  });

  it('takes a language chosen in Android 13+ settings', async () => {
    phone.app = 'zh-CN';
    expect(await syncWithPhone('en')).toMatchObject({ fromPhone: 'zh-Hans' });
    phone.app = '';
    expect(await syncWithPhone('en')).toMatchObject({ fromPhone: 'system' });
    phone.app = 'en';
    expect(await syncWithPhone('en')).toMatchObject({ fromPhone: null });
  });

  it('tells older Android the saved choice at every start', async () => {
    phone.app = null;
    expect(await syncWithPhone('zh-Hans')).toMatchObject({ fromPhone: null });
    expect(phone.set).toEqual(['zh-Hans']);
  });

  it('maps Android language tags back to choices', () => {
    expect(choiceFromAndroid('zh-CN')).toBe('zh-Hans');
    expect(choiceFromAndroid('en')).toBe('en');
    expect(choiceFromAndroid('')).toBe('system');
    expect(choiceFromAndroid('fr-FR')).toBeNull();
  });
});

describe('first paint', () => {
  const html = readFileSync('index.html', 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const boot = (languages: string[]) => {
    Object.defineProperty(navigator, 'languages', { value: languages, configurable: true });
    new Function(script)();
    return document.documentElement.lang;
  };
  afterEach(() => Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true }));

  it('uses the last language, or the phone’s', () => {
    expect(boot(['zh-CN'])).toBe('zh-Hans');
    expect(boot(['en-US', 'zh-CN'])).toBe('en');
    localStorage.setItem(LANGUAGE_HINT_KEY, 'zh-Hans');
    expect(boot(['en-US'])).toBe('zh-Hans');
    localStorage.setItem(LANGUAGE_HINT_KEY, 'en');
    expect(boot(['zh-CN'])).toBe('en');
  });

  it('has start-up text in both languages', () => {
    expect(html).toContain('<span lang="en">Opening your planner…</span>');
    expect(html).toMatch(/<span lang="zh-Hans">[^<]+<\/span>/);
  });
});

describe('dates, times and counts in Chinese', () => {
  beforeEach(() => setLanguage('zh-Hans'));

  it('formats durations, dates and repeats', () => {
    expect(duration(45)).toBe('45分钟');
    expect(duration(90)).toBe('1小时30分');
    expect(duration(120)).toBe('2小时');
    expect(longDate('2026-10-16')).toBe('10月16日');
    expect(weekRange('2026-10-12')).toBe('10月12日 – 18日');
    expect(weekRange('2026-10-26')).toBe('10月26日 – 11月1日');
    expect(dueLabel('2026-10-14', undefined, TODAY)).toBe('明天截止');
    expect(dueLabel('2026-10-10', undefined, TODAY)).toBe('已于10月10日截止');
  });

  it('has every key of the English catalog', () => {
    const shape = (value: unknown): unknown =>
      Array.isArray(value) ? value.length
        : typeof value === 'object' && value ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
          : typeof value;
    expect(shape(zhHans)).toEqual(shape(en));
  });
});
