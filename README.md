# Classday

An Android planner for university life: your class timetable, your day drawn to scale, and your to-dos in order of what matters most. Classday reminds you before deadlines and events.

No account, no server, no tracking. Everything stays on the phone unless you export a backup.

The app is called Classday in English and has its own Chinese name on Chinese phones (`android/app/src/main/res/values-zh-rCN/strings.xml`).

## What it does

- **A timetable of events.** Every event is one of three kinds: **Once**, **Short-term** (repeats until an end date, like an exam week) or **Long-term** (repeats with no planned end, like classes or the gym). An event can repeat on several weekdays or every day, take the whole day, and have its own reminder. The **+** in the header of Today and Week adds one; tapping free time on Today adds one there.
- **Events from a pasted notice.** Paste a whole group announcement or chat message into an event's name, such as *“Club meeting Wed 2pm in Room 204”* or the same kind of notice in Chinese. The name, date, start and end (or length) and place are read from it, greetings and sign-offs are dropped, and every field shows for checking. With no end or length in the text, an event lasts one double period, lined up with your period times (`src/domain/notice.ts`, `notice.zh-Hans.ts`).
- **To-dos, apart from the timetable.** A to-do has an optional deadline (picked on a full calendar, with an optional time), a time needed (*30 min*, *1 h* or your own), and two priorities that start unset: the **flag** for important and the **clock** for urgent. Typing `Lab report fri 2h important` fills them in as removable chips, in English or Chinese. Nothing is ever placed on the timetable for a to-do.
- **The to-do list in Eisenhower order.** Overdue first (greyed, and still open until you tick it off), then important and urgent, important, urgent, and the rest; the nearest deadline leads within each group. A to-do due within 12 hours carries a red warning.
- **Today.** The whole day on one time scale, the hours down the side: events, meals and free time each as tall as they last, and a line at the current time. Earlier hours stay in place, quieter. Swipe sideways for the next or previous day.
- **Week.** A timetable grid: a column per day, the periods with their times down the side, each event in its own soft color, all-day events under the day row, and the semester week number on top. Back-to-back classes sit flush. Swipe sideways for the next or previous week.
- **Reminders.** Notifications before a to-do's deadline (on the day, or one or two days before) and before any event that asks for one. They arrive while the app is closed.
- **Notes.** Quick notes with draft recovery, search, tappable links, and "Make it a to-do" that keeps the whole note.
- **Timetable import.** Import the timetable PDF from your school's academic system, paste or open a text list of classes, or use any `.ics` file. Every change is reviewed first (leave out anything wrong), and the last import can be undone. Cancel a single class ("Not happening this time") without touching the series.
- **Backups.** Export and restore one JSON file. Seven daily automatic copies on the device for recovery.
- **English and Simplified Chinese.** *Settings → Appearance → Language*: *System* (the phone's language), *English* or Simplified Chinese. Everything switches at once, including dates, durations and reminders. On Android 13+ the app also appears in the phone's own per-app language settings, and a change made there is picked up.
- **Settings, grouped.** *Planning* (your day, reminders, timetable) and *App* (appearance, backup and data), each on its own page.
- **Times on wheels.** Every time is chosen on hour and minute wheels that open under the field (with am/pm on a 12-hour phone), instead of Android's clock dial.
- **Appearance.** Light, Dark or follow the phone (*System*). Nine accent colors (Indigo by default, plus Violet, Orchid, Rose, Coral, Amber, Green, Teal and Blue), or **Wallpaper** colors on Android 12+. The whole app, including the status and navigation bars, changes the moment you pick, and every accent keeps text as readable as the default.

## Project layout

| Path | Responsibility |
| --- | --- |
| `src/domain/` | Pure TypeScript: data types, defaults, validation (`schema.ts`), what occurs on a day (`schedule.ts`), the to-do order (`todos.ts`), state transitions (`actions.ts`), parsing to-do lines and notices. No DOM, no platform code. |
| `src/timetable/` | Reading timetables: PDF grids (`grid.ts`), plain text and academic-system records (`text.ts`), ICS (in a Web Worker); building weekly classes, week ranges, import diff/merge/undo. |
| `src/platform/` | Capacitor bindings, storage backends (device file vs. browser), backup export and file picking, PDF text (`pdf.ts`), reminder notifications (`notifications.ts`). |
| `src/app/` | Startup and recovery (`repository.ts`), the store (saving, undo), app shell and Android Back handling. |
| `src/i18n/` | Interface text: `en.ts` (the source) and `zh-Hans.ts`, plus switching between them. |
| `src/ui/` | Preact screens, sheets and components; wording helpers (`format.ts`), the Today and Week geometry (`dayGrid.ts`, `weekGrid.ts`); language (`language.ts`), light/dark theme and accent colors (`theme/`). |
| `src/styles/` | Design tokens (light and dark), layout, components and screens. |
| `android/` | Native project. `cn/liubai/planner/` holds the storage, backup and appearance (wallpaper colors, night mode, language) plugins. |
| `tests/` | Vitest suites for the domain, timetable, storage, backups and UI flows. |

More detail on decisions and data flow is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local development

Requires Node.js 22 or later.

```bash
npm ci
```

```bash
npm run dev
```

Open http://127.0.0.1:5173. The browser preview stores data in `localStorage` (the Android app uses a private file instead). Use your browser's device toolbar at about 360–412 px wide to see the phone layout; at 900 px and wider the tablet/desktop layout appears.

```bash
npm run check
```

`check` runs the TypeScript compiler, the test suite and the text audit, which keeps project files in English and allows Chinese only in the Simplified Chinese files (names containing `zh-Hans`, Android's `values-zh-rCN`, and lines of `index.html` marked `lang="zh-Hans"`). `npm test` alone runs the tests.

## Android builds

Requirements: JDK 21, Android SDK with platform 36 and Build Tools 35+ (Gradle finds the SDK through `ANDROID_HOME`, `android/local.properties`, or the default install folder).

```bash
npm run android:debug
```

Writes `releases/classday-<version>-debug.apk` and its SHA-256 checksum. Debug builds are signed with your local debug key and are for testing only; they cannot replace an installed release.

```bash
npm run android:test
```

Runs the native unit tests (storage, backup payloads, appearance plugin: colors, night modes and languages). `npm run android:lint` runs Android lint; the report is written to `android/app/build/reports/`.

### Release builds

Android only installs an update over an existing app when both are signed by the same key, so every release is signed with one private key. Its certificate's SHA-256 is recorded in `android/release-certificate.sha256`.

1. Put the private signing folder at `.android-signing/` (`release.jks` and `signing.properties`). It is ignored by version control; keep it out of anything you share, and keep a private backup. The key is found next to the properties file, so the `storeFile` path inside doesn't need editing after a move.
2. Build:

   ```bash
   npm run android:release
   ```

Writes `releases/classday-<version>.apk` and its SHA-256 checksum. The script refuses to continue without the key, and checks the finished APK's certificate against the recorded one, so an APK that could not update existing installs is never produced by accident. The version name comes from `package.json` and the version code is derived from it (1.0.0 → 10000, 1.2.3 → 10203).

## Timetable import

Everything is read on the phone; no file leaves it.

- **PDF.** Made for the timetable PDFs that Chinese academic systems export: weekday columns, period rows, and cells such as a course name followed by `(1-2…)` periods, weeks, campus, room and teacher. pdf.js reads the text and its position; the weekday headers mark the columns, and a second page without headers continues the first. Text above the grid (your name and student number) and notes below it are ignored. Other layouts fall back to reading the text line by line; if that finds nothing, copy the PDF's text and paste it instead.
- **Text.** One class per line, fields in any order: a name, a weekday, a time (`08:00-09:40`) or periods, and optionally weeks, room and teacher, in English or Chinese. A line holding only a weekday applies to the lines below it.
- **Periods and weeks.** Imports that count periods ask once for the Monday of week one and the times of the periods used, with periods 1–12 filled in from the default schedule (`DEFAULT_PERIODS` in `src/domain/defaults.ts`); both are remembered for next time.
- **Review.** You see every class before anything is saved and can leave out anything misread. Importing again under the same name updates those classes and keeps your own edits.

Earlier versions could sign in to one school's website directly; that was removed because academic systems differ too much. Any sign-in session it left on the phone is cleared when the app starts.

## Limits

- Reminders use Android's inexact alarms, so one can arrive a few minutes late; the phone's battery settings can delay it further.
- The PDF reader knows grid timetables from academic systems; an unusual layout may need the text pasted instead.
- One device at a time: there is no sync. Move between phones with a backup file.
- The planner is a heuristic. It explains what doesn't fit rather than promising an optimal schedule.

## License notes

`ical.js` (MPL-2.0), Mozilla's pdf.js with its Chinese character maps (`pdfjs-dist`, Apache-2.0), Capacitor's local notifications (MIT) and the Figtree font (SIL Open Font License) are bundled for offline use.
