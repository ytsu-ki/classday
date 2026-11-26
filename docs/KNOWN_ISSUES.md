# Known Issues & Triage Ledger

This document records state-machine and UI issues discovered during the full codebase and live-browser audit.

## Triage Rubric

- **Frequency (1–10):** `1` = rare edge race or OS-triggered background state; `5` = weekly / common multi-step workflow; `10` = reproducible on every primary flow.
- **Severity (1–10):** `1` = minor cosmetic flaw; `5` = interrupts workflow or requires retry; `8` = loses unsaved user draft or breaks core functionality; `10` = data loss, crash, or security/privacy issue.
- **Decision Rule:** Issues with `Frequency × Severity < 5` **AND** `Severity < 8` (no data loss, security, or core accessibility impact) are archived below with code left untouched. All other issues are fixed in the codebase.

## Archived Issues (`F × S < 5` and `Sev < 8`, Code Untouched)

| ID | File & Location | Summary & Reproduction | Freq | Sev | Score |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **ARCH-01** | `src/ui/sheets/MiscSheets.tsx:20` | Editing an existing note in `NoteSheet` while an external store change occurs (e.g., Undo toast or background sync) leaves local `parts` state initialized at mount until the sheet is reopened. | 1 | 3 | **3** |
| **ARCH-02** | `src/ui/sheets/EventSheet.tsx:194` | Toggling `All day` off when editing an existing all-day event keeps `00:00`–`23:59` with `endChosen = true` instead of synthesizing a default period span; user can pick new start/end manually. | 2 | 2 | **4** |
| **ARCH-03** | `src/main.tsx:40` | Unconditional `saver.schedule(store.get().data)` on every `ready` boot triggers a write even when nothing changed, rotating `state.prev.json` to match `state.json` after two read-only opens. | 2 | 2 | **4** |
| **ARCH-04** | `src/ui/screens/Data.tsx:19-21` | After restoring a backup via `RestoreSheet`, the daily snapshots list on `DataScreen` does not re-fetch the newly written pre-restore snapshot until the user leaves and re-enters `DataScreen`. | 2 | 2 | **4** |
| **ARCH-05** | `src/app/App.tsx:118,142` | Changing the OS per-app language in Android 13+ system settings while a form sheet is open triggers `<div class="app" key={lang}>` remount on resume and drops unsaved form state. | 1 | 4 | **4** |
| **ARCH-06** | `src/ui/screens/Settings.tsx:83-86` | Navigating away from `DayScreen` with unsaved dirty form edits discards local `draft` without prompting. | 2 | 2 | **4** |

## Fixed Issues (`F × S >= 5` or `Sev >= 8`)

| ID | File & Location | Summary | Freq | Sev | Score |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **BUG-01** | `App.tsx`, `Sheet.tsx`, `ItemSheet.tsx`, `EventSheet.tsx`, `MiscSheets.tsx` | Opening `ConfirmSheet` replaced the single `sheet` slot, losing dirty form drafts on Cancel. Fixed via explicit `sheets` stack (`ui.push`/`ui.pop`). | 5 | 8 | **40** |
| **BUG-02** | `App.tsx`, `Sheet.tsx`, `DatePage.tsx`, `ImportSheet.tsx` | Android `backButton` bypassed `DatePage` and `ImportSheet` sub-steps and closed the entire sheet. Fixed via `ui.registerBack` + `<Sheet onBack>`. | 7 | 7 | **49** |
| **BUG-03** | `src/ui/sheets/ImportSheet.tsx` | Clicking Back on `preview` discarded `semester` configuration (`periods`, `firstMonday`, `entries`). Fixed by storing explicit `backTo` step state. | 5 | 5 | **25** |
| **BUG-04** | `src/app/App.tsx`, `src/app/sheetStack.ts` | Midnight rollover subscription captured initial `today` and overrode `day` even when the user had navigated to another day. Fixed via `rollover` transition. | 3 | 6 | **18** |
| **BUG-05** | `src/ui/sheets/ImportSheet.tsx` | Unmounting `ImportSheet` during ICS worker parsing or async file read leaked the `Worker` and called `setState` on an unmounted tree. Fixed via cleanup termination + mounted guard. | 3 | 5 | **15** |
| **BUG-06** | `src/platform/backup.ts` | `pickFile` Promise never settled if user cancelled the native file chooser on Android WebView 105–112 (prior to HTMLInputElement `cancel` event). Fixed via `window` `focus` fallback. | 4 | 7 | **28** |
| **BUG-07** | `src/app/repository.ts` | Concurrent `Saver.flush()` during an active write returned immediately before draining newly queued `pending` data. Fixed with serialized drain loop. | 3 | 8 | **24** |
| **BUG-08 / UX-01** | `src/styles/components.css` | `TimeField` wheels squeezed inside 1-column `.form-grid` (`154px` at `360px` width), clipping `AM/PM` labels. Fixed with `.field:has(.time-panel) { grid-column: 1 / -1 }`. | 9 | 6 | **54** |
| **BUG-09** | `src/ui/components/TimeField.tsx` | `140ms` scroll timer could race active compositor scroll-snap. Fixed with `scrollend` support + active-scroll sync guard. | 6 | 4 | **24** |
| **BUG-12** | `src/ui/sheets/EventSheet.tsx` | Updating `firstDay` past `lastDay` on short-term events left invalid `until < from` intermediate state. Fixed by clamping `until`. | 3 | 3 | **9** |
| **BUG-13** | `src/ui/sheets/CaptureSheet.tsx` | Removing parsed `time` token wiped manually picked `due` date, and clearing input kept stale `ignore` set. Fixed. | 3 | 3 | **9** |
| **BUG-14** | `src/ui/reminders.ts` | `keepRemindersInSync` queued async sync could run after `stop()` was called. Fixed via `stopped` guard. | 2 | 4 | **8** |
| **BUG-15** | `src/ui/reminders.ts`, `Settings.tsx`, `Today.tsx` | Notification permission state went stale after user enabled notifications in Android Settings and returned to the app. Fixed via `useNotificationPermission` foreground refresh. | 5 | 5 | **25** |
| **BUG-16** | `src/ui/useSwipe.ts` | Stale `swiped` flag after touch swipe without click, no vertical-scroll bailout, multi-touch overwrite, no flick velocity threshold. Fixed with `evaluateSwipe` + `pointermove` bailout + auto-expiring guard. | 7 | 5 | **35** |
| **UX-02** | `layout.css`, `screens.css`, `Week.tsx` | Desktop `Week` capped at `1040px` while narrow multi-lane cards clipped characters mid-glyph. Fixed by expanding `.main:has(> .week)` and adapting multi-lane typography. | 6 | 6 | **36** |
| **UX-03** | `src/ui/dayGrid.ts`, `Today.tsx`, `screens.css` | Meal slices under `20m` rendered `10px` clipped strips on `Today`. Fixed by filtering sub-`FREE_MIN` remnants and adding `.day-meal.is-short`. | 5 | 5 | **25** |
| **UX-04** | `src/styles/layout.css` | `360px` `.page-head` crowded when `"Today"`/`"This week"` button appeared. Fixed with `<= 440px` clean wrapping. | 7 | 4 | **28** |
| **UX-06** | `src/ui/components/Calendar.tsx` | Month grid exposed 42 Tab stops instead of WAI-ARIA APG roving tabindex + arrow keys. Fixed. | 5 | 5 | **25** |
| **UX-07** | `components.css`, `screens.css`, `Sheet.tsx` | Coarse-pointer touch targets under `44px`, missing desktop hover affordances, and missing mobile bottom-sheet drag-to-dismiss. Fixed. | 6 | 5 | **30** |
