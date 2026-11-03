# Architecture

Classday is an offline Android app: a Preact + TypeScript interface running in Capacitor's WebView, a pure TypeScript domain layer, and a few small native plugins. There is no server.

## Why no backend service

The product is personal and offline-first: one student, one phone, no registration. A server would add accounts, sync conflicts, hosting and a privacy surface without helping the core job (planning a realistic day). The "backend" responsibilities — validation, persistence, recovery, backups and reminders — live in the domain layer and the native plugins instead. If sync is ever needed, `PlannerData` is a single versioned document that could be stored remotely without changing the domain code.

## Layers

```
 UI (src/ui, src/app/App.tsx)          screens, sheets, wording (from src/i18n)
   │  store.act(draft => action(draft))
 Store (src/app/store.ts)              clone → action → save → undo history; keeps the clock
   │
 Domain (src/domain)                   types, schema, actions, schedule, to-do order, parsing
   │
 Repository (src/app/repository.ts)    boot, recovery fallbacks, debounced saving with retries
   │
 Platform (src/platform)               StorageBackend: device file (Android) | localStorage (preview)
   │
 Native (android/.../cn/liubai/planner) PlannerStore, Backup, Appearance plugins; Capacitor's LocalNotifications
```

- **Domain functions are pure or mutate a draft.** `actions.ts` functions take a cloned `PlannerData` and change it; invalid requests throw `ActionError` carrying a `Problem` (`domain/problems.ts`), a code with its details. The store puts it into words in the current language, shows it, and keeps the old data. Timetable, backup and settings checks report problems the same way, so no layer below the interface holds sentences.
- **Nothing is planned automatically.** The student puts every event on the timetable; `domain/schedule.ts` only answers what occurs on a day (`occurs`, `fixedFor`, `allDayFor`) and where the free time is. To-dos never go on the timetable; `domain/todos.ts` orders them (Eisenhower groups, overdue first) and says which are overdue or due within 12 hours.

## Data model (`src/domain/types.ts`)

`PlannerData` (schema 1) holds `items` (to-dos), `events` (the timetable), `notes`, `noteDraft`, `settings` (the shape of a day: its hours and meals), `appearance` (theme, accent and language), `reminders`, `timetable` (import exclusions, last import for undo, semester details: the Monday of week one, empty until an import, and the class times) and `meta`.

- A to-do has `status` (`open` or `done`), an optional deadline (`due`, `dueTime`), `estimate`, and two flags, `important` and `urgent`, both false until set.
- An event has exactly one `category`: `once`, `short` (repeats until `until`, which it must have) or `long` (repeats with no planned end; imported classes keep their semester end). `repeat` follows the category. A repeating event happens on `days` (several weekdays, or all seven) or on `weekday`, within `from`/`until`, in the given `weeks` or `parity`, minus `exclusions`. `allDay` events run 00:00–23:59 and show apart from the hours; `remind` is minutes before the start (or, for all-day events, the day itself or the day before).
- All untrusted JSON (storage and backups) passes through `normalizeData`, which rebuilds every object from known fields only. Unknown fields — for example anything resembling credentials — cannot enter the data or its backups. An event without a valid category is dropped and counted, as is anything else invalid. Data of any other schema, or from another app, is refused.

## Persistence and recovery

- **Android:** `PlannerStorePlugin` writes `files/planner/state.json` atomically (temporary file → fsync → rename), keeps the version before each write as `state.prev.json`, and keeps one copy per day for the last seven days in `files/planner/snapshots/`. Cloud backup stays off; Android's device-to-device transfer (`res/xml/data_extraction_rules.xml`) moves only `files/planner/`, never the WebView's storage.
- **Saving** is debounced (400 ms), ordered, flushed when the app pauses, and retried with backoff; a failure shows a banner with a shortcut to export a backup.
- **Boot** tries, in order: the latest save; the previous save; daily copies (newest first); a fresh start. If saved data exists but nothing can be read, a recovery screen lets the student save the raw text, restore a file, use a daily copy, or start over — nothing is overwritten before that choice.

## Timetable import

The readers produce the same `ClassEntry` list (`timetable/classes.ts`), which `buildEvents` turns into weekly events using the semester details; the existing diff, merge and undo (`timetable/merge.ts`) do the rest. *From a file* (`timetable/files.ts`, loaded only when a file is chosen, together with the PDF, web page and Excel readers) lets any file be picked, since Android greys out files whose type isn't in the picker's list and saved pages and exports often carry odd types. `fileKind` then decides by the first bytes: `%PDF-`, a zip (`.xlsx`), the compound-file signature of a binary `.xls` (answered with a request to save it as `.xlsx`), `BEGIN:VCALENDAR` (on to the calendar step), an MHTML header, Excel 2003 XML, HTML, or else plain text. Files are limited to 10 MB.

- **PDF** (`platform/pdf.ts`, `timetable/grid.ts`). pdf.js's legacy build (for older Android WebViews) is loaded only when a PDF is chosen; its worker and the Chinese (GB) character maps are bundled, the maps by a small Vite plugin, so PDFs with non-embedded Chinese fonts read offline. Text items are taken in viewport coordinates, which turns rotated pages upright. The weekday header row gives the columns; text above it (title, student details) is skipped, and a page without headers continues the last columns. Each column's text is joined top to bottom and read as academic-system records: a title, `(n-m<period>)`, then weeks, campus, room and teacher separated by slashes, ending with hours and credits. Line breaks inside a record are dropped next to Chinese, digits and punctuation, since the PDF broke lines only to fit the cell.
- **Web pages and spreadsheets** (`timetable/html.ts`, `timetable/xlsx.ts`, `timetable/table.ts`). Both become tables of cells with their row and column spans. Pages are decoded by their BOM or declared charset, else as UTF-8, else GB18030 (which covers GBK), and parsed with `DOMParser` into an inert document whose scripts never run; a cell's text keeps its line breaks, with a blank line (`<br><br>`) or a rule between classes. MHTML parts are unwrapped (quoted-printable or base64) and every HTML part is read, so a timetable in a frame is found too. An `.xlsx` is read without a library: a short zip reader finds the central directory, `DecompressionStream('deflate-raw')` (WebView 103+; the app requires 105) inflates only the workbook, its relationships, shared strings and sheets, each stopped past 20 MB, and `DOMParser` reads the XML, refusing any document that declares entities. Merged cells become spans, and a number that is a whole minute of a day reads as a time, as Excel stores one. Excel 2003 XML is read the same way from its `ss:Index`, `MergeAcross` and `MergeDown`. `classesFromTables` reads any table with a header row of at least five weekdays as a grid: a cell's records are read as in a PDF; otherwise each block of lines is read as a text line, adding the periods of the rows the cell spans (from the labels left of the first weekday column) when the text gives none. Cells starting left of the weekday columns, such as notes across the whole table, are not classes. With no such table, the table yielding the most classes is read one class per row.
- **Period times** (`timetable/periodTimes.ts`). The labels left of a grid, from a table or from a PDF (`readGrid` collects the text left of the first column, row by row), are read for period numbers (Chinese numerals too) and the times next to or below them; a range such as "1-2" takes four times. The result must run from period 1 without gaps or overlaps, and labels for double periods give nothing. It fills the import's class times, flagged as read from the file.
- **Text** (`timetable/text.ts`). One class per line, fields in any order, English or Chinese; a weekday-only line starts a section; records in the academic-system format are read here too. Chinese words live in `timetable/vocabulary.zh-Hans.ts`.
- **ICS** (`timetable/ics.ts`), in a Web Worker as before.

### Class times

`domain/periods.ts` holds the school's class times (`semester.periods`) and the operations on them. Periods fall into blocks (morning, afternoon, evening) wherever the gap to the next is at most 40 minutes. A new start keeps a period's length and moves the rest of its block by as much, keeping lengths and breaks; a new end does the same for the periods after it. A new class length lays every block out again from its first period, keeping the breaks; a new break changes every gap equal to the usual one, leaving longer ones. A change that would run past midnight changes only the period itself. In the editor (`ui/components/PeriodTable.tsx`), every step of one time wheel applies to the table as it was before the wheel turned, so passing through a time that doesn't fit leaves no trace. The same editor serves the import and *Settings → Timetable → Class times* (`ui/sheets/ClassTimesSheet.tsx`).

Classes built from periods keep `periods: [first, last]`, and their `sourceKey` names the periods rather than the times, so a class stays the same class under new class times. Saving a new table (`setClassTimes`, or an import with changed times) moves every linked class whose times still match its periods in the old table; one changed by hand keeps its times and loses the link, as does any class whose times are edited. A table can't drop a period that classes use. Stored tables keep their periods up to the first unreadable or overlapping one, so period numbers never shift. `EXAMPLE_PERIODS` is only a starting point for the editor and an import with no saved times, cut to the periods the timetable uses; Week shows hours until a table exists.

The school sign-in import (a separate WebView on one school's site) was removed: academic systems differ too much to support well. `MainActivity` clears web cookies at start-up so any session it left behind ends; the app itself uses no cookies.

## Events from notices

`domain/notice.ts` reads a pasted notice or message into a one-off event; the Chinese wording lives in `notice.zh-Hans.ts`, and both languages are read whatever the interface language is. Text is first made half-width, and spaces between Chinese and numbers are dropped. Each field is then found where it appears and cut out of the text: a calendar date (before relative days such as *tomorrow* or *next Monday*, so a notice giving both keeps the date), a time range or a single time, a length, and a place (after *in/at*, *Location:*, or a Chinese preposition before a verb such as "hold" or "gather"). An unmarked 1 to 6 o'clock reads as the afternoon, as notices mean. The first clause left, without greetings, sign-offs and joining words, is the title; a place written right before it is split off. `eventEnd` gives the end: the text's own, else its length, else one double period (from a period's start to the end of the next, or the length of periods 1–2). Pasting into an event's name (`ui/sheets/EventSheet.tsx`) fills in what the text says, for the student to check in the form below.

## Reminders

`domain/reminders.ts` works out, from the data alone, which notifications should be pending: one per unfinished to-do with a deadline (the chosen number of days before, at the reminder time, or the morning of the due day if that has passed), and one per occurrence of an event that sets `remind`, in the next two weeks. `ui/reminders.ts` words them in the current language and, shortly after any change, when the language changes or when the app goes to the background, replaces every pending notification with that list through Capacitor's local notifications. The plugin keeps them across restarts. They use inexact alarms (`isExactNotification: false`, and the exact-alarm permission is removed from the manifest), so Android never sends the student to the alarm settings. Permission is asked once, from a card on Today when there is first something to remind about, or from *Settings → Reminders*.

## Interface

- Preact keeps the bundle small for older Android WebViews (minimum WebView 105, Android 7.0).
- One `<dialog>`-based bottom sheet at a time; Android Back closes a sheet, then returns to the parent screen, then Today, then leaves the app.
- Tokens in `styles/tokens.css` define the neutral light and dark palettes (cool greys, white surfaces, category and status hues) and the default accent, all checked for WCAG AA text contrast. The dark palette applies when `<html>` has `data-theme="dark"` (see *Theme* below). One sans-serif family (Figtree) is bundled.
- Phones get a bottom navigation bar; at 900 px and wider the layout switches to a side rail. Each screen's add action is the **+** in its header: events on Today and Week, to-dos on To-dos, notes on Notes.
- **Sheets with a second page.** A full calendar (`ui/components/Calendar.tsx`, through `useDatePage`) takes over the sheet it was opened from instead of opening a second dialog. Swiping (`ui/useSwipe.ts`) moves Today by a day and Week by a week, and the calendar by a month; pages keep `touch-action: pan-y`, so scrolling stays with the page.
- **Times.** `ui/components/TimeField.tsx` replaces `<input type="time">`: its hour and minute wheels (plus am/pm when the phone uses 12-hour time) open under the field, using CSS scroll snapping, taps and arrow keys. Android's own clock dial was awkward on a phone. Dates are picked on the app's own calendar. The launch theme sets no `android:background`: Capacitor applies the app theme on top of it, so a theme background would stay behind and paint every system dialog.
- **Today** draws the whole day to one scale (`ui/dayGrid.ts`, 1.2 px a minute): hours down the side, and every event, meal and free stretch placed at its time and as tall as it lasts. The axis covers the waking day and stretches to whole hours for an event outside it. Overlapping events share the width in lanes; a meal gives way to any event at the same time; free stretches under 20 minutes stay blank. What is over stays in place, quieter; free time still ahead takes a tap to add an event there. The current time is a line with the time in the margin.
- **Week** is a timetable grid (`ui/weekGrid.ts` for the geometry). One time axis serves all seven days, so rows line up: periods and anything on the plan get full height (1.3 px a minute) and the time between is compressed (0.35 px a minute), so lunch doesn't take a screen. Passing periods (breaks of up to 30 minutes between periods, for walking between rooms) take no height, so back-to-back classes sit flush with square joining corners; one stays open only if something planned starts or ends inside it. Today is marked in the day row only, never with a column background. Period labels are the student's class times, or whole hours when none are set. Overlapping events share a day in lanes. Each event title gets one of ten soft colors (generated with the accent palette code, at least 5:1 in both themes). All-day events sit under the day row. Only the cards take a tap: the day row and empty space do nothing, and there is no current-time line (the day row marks today).

## Theme

Like Tuck (the author's notification and memo app), the app offers *System*, *Light* and *Dark* (`ui/theme/mode.ts`). The choice is resolved to `data-theme="light"` or `"dark"` on `<html>`, so a forced theme works regardless of the phone's setting. On *System* the app listens to `prefers-color-scheme` and follows the phone live.

- **Status and navigation bars.** The app draws edge to edge. Capacitor's built-in `SystemBars` plugin sets the bar icons to dark or light to match the resolved theme.
- **Launch screen.** On Android 12+, `AppearancePlugin.nightMode` passes the choice to `UiModeManager.setApplicationNightMode`, as Tuck's `NightMode` does. Android remembers it, so the launch screen and window background already match on the next start. Older versions follow the phone there until the app draws.
- **First paint.** The theme is stored in `PlannerData.appearance`, which loads asynchronously. A small script in `index.html` sets `data-theme` before anything is drawn, from a copy of the choice that `applyTheme` keeps in `localStorage` (`classday.theme`), and falls back to the phone's setting. The copy is only a hint for the first paint; the saved data stays the source of truth.

## Languages

The interface is in English or Simplified Chinese (`src/i18n`).

- **Catalogs.** `en.ts` is the source; `zh-Hans.ts` must have the same keys and the same function signatures, which the type checker enforces. Text with values in it is a function, so each language orders words and counts things its own way (English plurals, Chinese measure words). Each catalog also owns its date and duration formats. 12- or 24-hour time follows the phone in both languages.
- **Switching.** The choice (`appearance.language`: *System*, English or Chinese) is saved with the data like the theme and accent. *System* takes the first English or Chinese language in the phone's list; on Android that list comes from the system, not from the app's own language. `t` is a live binding read while rendering, and the app re-renders its whole tree under a `key` of the language, so a switch takes effect at once. `<html lang>` follows it, which gives Chinese glyphs and the screen-reader voice; Chinese gets Chinese fallback fonts after Figtree, slightly more line height, and no letter-spacing.
- **First paint.** Like the theme, the script in `index.html` sets `lang` from a copy of the last language (`classday.language`) or the phone's, and the start-up text exists in both languages.
- **Quick capture** reads English and Chinese phrases regardless of the setting. Chinese has no spaces, so `quickParse.zh-Hans.ts` peels recognised phrases (dates, times, durations, repeats, priority) off the end of a word before the usual end-of-line reading; whatever stays in the title keeps its original spacing.
- **Android.** A choice made in the app goes to `AppCompatDelegate.setApplicationLocales` through `AppearancePlugin`. On Android 13+ Android keeps it: the app is listed in the phone's per-app language settings (`res/xml/locales_config.xml`), and when the app starts or returns it adopts a language changed there. Older versions keep no per-app language, so the app passes its choice to them at every start. The activity handles locale changes itself, so switching never reloads the page.
- **Text audit.** `npm run audit:english` allows Chinese only in files whose names contain `zh-Hans`, in Android's `values-zh-rCN` resources, on `index.html` lines marked `lang="zh-Hans"`, and in the Chinese half of `README.md` between `<!-- zh-Hans -->` and `<!-- /zh-Hans -->` (an unclosed section fails); code, comments, the rest of the docs and the English catalog stay English.

## Accent colors

The accent system also follows Tuck's: each choice is only an OKLCH hue and chroma, and `ui/theme/palette.ts` turns it into tones, where tone is mapped to CIE L* as in Material 3. Because tone predicts luminance, every accent token is defined once as a tone (`ui/theme/accent.ts`), for example the button at tone 46 with white text in light mode and tone 62 with near-black text in dark mode, and every hue gets the same contrast. Chroma is reduced where sRGB runs out, and soft tints are capped so greens and cyans stay as calm as blues.

- **Choices.** Indigo (the default), Tuck's eight hues, and Wallpaper. On Android 12+ `AppearancePlugin.wallpaper` reports the system palettes' tone-40 colors; their hue and chroma become the seed, so wallpaper colors also go through the same tones. Older phones don't show the Wallpaper swatch, and a Wallpaper choice restored from a backup falls back to Indigo there with a short note.
- **Scope.** Only `--accent`, `--accent-press`, `--accent-ink`, `--accent-soft`, `--on-accent` and `--inverse-accent` change. Category and event colors, status colors, neutrals, the brand mark and the launcher icon never do, so an accent can never make two kinds of plans look alike.
- **Applying.** A non-default accent is one injected `<style>` with a light block and a `[data-theme='dark']` block (`html:root` outranks the defaults whatever the load order); the default needs none. The app applies it in a layout effect before the first paint, and startup reads the wallpaper colors alongside the saved data, so there is no flash of the default color. Returning to the app re-reads the wallpaper.
- **Storage.** The accent and theme live in `PlannerData.appearance`, so they are saved atomically, kept in daily copies and carried by backups. `normalizeData` turns a missing or unknown value into Indigo and *System*. Changing either one doesn't re-plan, isn't an undo step, and Undo never changes it back.
- **Checks.** `tests/accent.test.tsx` requires every preset, and every hue the wallpaper could produce, to keep text at 4.5:1 and accent shapes at 3:1 against the real neutrals in both themes. It also requires the defaults in `tokens.css` to equal the generated Indigo.

## Testing

- `tests/storage.test.ts` — reading back a save, boot fallbacks, snapshot pruning, save retries, store undo and day rollover.
- `tests/backup.test.ts` — backups read back exactly, unknown fields (such as login details) stripped, other versions and files refused, size limits.
- `tests/dayGrid.test.ts` — Today's axis: its hours, events, meals and free time in order, free time split at the current time, and overlapping events in lanes.
- `tests/todos.test.ts` — Eisenhower order, overdue and 12-hour warnings, repeating and all-day events, free time, and event categories.
- `tests/reminders.test.ts` — deadline and event reminders, their timing and settings.
- `tests/timetable.test.ts`, `tests/timetableGrid.zh-Hans.test.ts`, `tests/quickParse.test.ts`, `tests/quickParse.zh-Hans.test.ts`, `tests/actions.test.ts` — building classes, reading text and PDF grids (a made-up timetable in the academic-system layout), parsing in both languages, and state transitions.
- `tests/ui.test.tsx` — adding to-dos with the calendar and the flag and clock, the to-do order, events of each kind from the header +, a pasted notice, all-day events, free time, Today drawn to scale, swiping days and weeks, the Week grid and what it leaves untappable, notes, settings and escaping, rendered with Testing Library.
- `tests/notice.test.ts`, `tests/notice.zh-Hans.test.ts` — reading notices in English and Chinese, and how long an event lasts.
- `tests/timeField.test.tsx`, `tests/weekGrid.test.ts` — the time wheels (taps, scrolling, keys, off-step minutes, clearing) and the Week grid's axis, lanes, course colors, period rows and week numbers.
- `tests/timetableFiles.test.ts`, `tests/timetableFiles.zh-Hans.test.ts`, `tests/importFile.test.tsx` — telling files apart, made-up timetables as a saved page (UTF-8, GBK, MHTML, renamed .xls), .xlsx (built by `tests/zip.ts`) and Excel 2003 XML, period times beside a grid, a zip bomb and entity declarations turned away, and *From a file* in the interface.
- `tests/periods.test.ts` — class times: moving a block, class length and break, adding periods, checks, storing them, and classes that follow them through a new table and a second import.
- `tests/accent.test.tsx` — palette math, contrast for every accent and wallpaper hue, token sync, storage defaults, undo, and the picker.
- `tests/theme.test.tsx` — theme storage, resolving *System*, following the phone live, the first-paint script in `index.html`, and the picker.
- `tests/i18n.zh-Hans.test.tsx` — every screen and the main sheets rendered in Chinese with no English left in text or accessibility labels, switching languages, Android 13+ per-app language sync, the first-paint language, Chinese formats, and catalog completeness.
- `android/app/src/test` — atomic file storage, backup payloads, and the appearance plugin (color format, night modes, language tags).
