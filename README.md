<!-- zh-Hans -->
# 课日

**简体中文** · [English](#classday)

为大学生活而做的安卓规划应用：你的课表、按时间比例显示的一天，以及按轻重缓急排好的待办。截止日期和日程开始前，课日会提醒你。

无需账号，没有服务器，不做任何追踪。除非你导出备份，所有数据都只保存在手机上。

## 功能

- **日程组成的课表。** 每个日程都属于三种之一：**一次**、**短期**（重复到某个结束日期，比如考试周）和**长期**（没有计划中的结束日期，比如上课或健身）。日程可以在一周的几天或每天重复，可以是全天，也可以有自己的提醒。“今天”和“本周”页面顶部的 **+** 用来添加日程；在“今天”里点一下空闲时间，就会在那里添加。
- **从通知里读出日程。** 把整条群公告或聊天消息粘贴到日程的名称里，比如 *“周三下午2点在报告厅举行年级大会”* 或同样的英文通知。名称、日期、开始和结束时间（或时长）以及地点都会被读出来，问候语和结尾客套话会被去掉，每一项都显示出来供你核对。用安卓键盘的剪贴板建议插入也可以。如果文字里没有结束时间或时长，日程默认持续一个大节，与你的节次时间对齐（`src/domain/notice.ts`、`notice.zh-Hans.ts`）。
- **待办，与课表分开。** 待办可以有截止日期（在完整的月历上选择，时间可选）、预计用时（*30分钟*、*1小时* 或自定义），以及两个默认不选的优先级：**旗子** 表示重要，**时钟** 表示紧急。输入 `实验报告 周五 2小时 重要` 会把这些自动填成可以删除的小标签，中英文都可以。待办永远不会被放到课表上。
- **按四象限排列的待办。** 已过期的排在最前（显示为灰色，在你勾掉之前一直保持未完成），然后是重要且紧急、重要、紧急和其他；每组里截止日期最近的排在前面。12 小时内到期的待办会有红色提醒。
- **今天。** 整天按同一时间比例显示，小时刻度在左侧：日程、用餐和空闲时间都按实际长短显示，当前时间有一条线标出。已经过去的时段留在原处，颜色变淡。左右滑动切换到前一天或后一天。
- **本周。** 课表网格：每天一列，左侧是节次和时间（还没有设置上课时间时显示小时），每个日程有自己的柔和颜色，全天日程显示在日期行下方，顶部显示教学周。相邻的课无缝衔接。左右滑动切换周。
- **上课时间。** 在 *设置 → 课表 → 上课时间* 里按你们学校的作息填写每一节的开始和结束时间。改“每节时长”或“课间”会一次调整所有节次；调整某一节时，它之后直到午饭或晚饭前的节次会一起移动，所以换夏令时、冬令时作息只需要改一处。按节次导入的课程会记住自己的节次，随上课时间一起调整。
- **提醒。** 待办截止前（当天，或提前一两天）以及设了提醒的日程开始前发出通知。应用关闭时也能收到。
- **笔记。** 快速记笔记，支持草稿恢复、搜索、可点击的链接，以及保留完整内容的“转成待办”。
- **导入课表。** **从文件导入**教务系统导出的 PDF、Excel（`.xlsx`）、保存的网页或 `.ics` 日历，或者粘贴、打开文字课程列表。每项变化都会先让你核对（把错的去掉），最近一次导入可以撤销。单独取消某一次课（“这次取消”）不会影响整个系列。
- **备份。** 导出或恢复一个 JSON 文件。设备上自动保留最近七天的每日副本，用于恢复。
- **简体中文和英文。** *设置 → 外观 → 语言*：*跟随系统*、*English* 或简体中文。所有内容一起切换，包括日期、时长和提醒。在 Android 13 及以上版本中，应用也会出现在系统的“应用语言”设置里，在那里做的修改同样生效。
- **分组的设置。** *计划*（你的一天、提醒、课表）和 *应用*（外观、备份与数据），每项都有自己的页面。
- **滚轮选时间。** 所有时间都用在字段下方展开的小时和分钟滚轮来选（12 小时制的手机会多一个上午/下午），而不是安卓的表盘。
- **外观。** 浅色、深色或跟随系统。九种主题色（默认靛蓝，另有紫罗兰、兰花紫、玫瑰红、珊瑚橙、琥珀金、青绿、湖蓝和海蓝），Android 12 及以上还可以用 **壁纸取色**。选择后整个应用（包括状态栏和导航栏）立即改变，每种主题色的文字都和默认一样清晰易读。

应用在中文手机上显示为“课日”，在其他语言下显示为 Classday（`android/app/src/main/res/values-zh-rCN/strings.xml`）。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| `src/domain/` | 纯 TypeScript：数据类型、默认值、校验（`schema.ts`）、某一天有哪些安排（`schedule.ts`）、待办排序（`todos.ts`）、状态变更（`actions.ts`），以及解析待办输入和通知。不涉及 DOM 和平台代码。 |
| `src/timetable/` | 读取课表：PDF 表格（`grid.ts`）、纯文本和教务系统记录（`text.ts`）、ICS（在 Web Worker 中）；生成每周课程、周次范围，以及导入的差异、合并和撤销。 |
| `src/platform/` | Capacitor 绑定、存储后端（设备文件或浏览器）、备份导出和选择文件、PDF 文字（`pdf.ts`）、提醒通知（`notifications.ts`）。 |
| `src/app/` | 启动与恢复（`repository.ts`）、状态存储（保存、撤销）、应用框架和安卓返回键处理。 |
| `src/i18n/` | 界面文字：`en.ts`（原文）和 `zh-Hans.ts`，以及两者之间的切换。 |
| `src/ui/` | Preact 页面、面板和组件；文字格式工具（`format.ts`）、“今天”和“本周”的布局计算（`dayGrid.ts`、`weekGrid.ts`）；语言（`language.ts`）、浅色/深色主题和主题色（`theme/`）。 |
| `src/styles/` | 设计变量（浅色和深色）、布局、组件和页面样式。 |
| `android/` | 原生项目。`cn/liubai/planner/` 中是存储、备份和外观（壁纸颜色、深色模式、语言）插件。 |
| `tests/` | 针对领域逻辑、课表、存储、备份和界面流程的 Vitest 测试。 |

关于设计决策和数据流的更多细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（英文）。

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm ci
```

```bash
npm run dev
```

打开 http://127.0.0.1:5173。浏览器预览把数据存在 `localStorage` 里（安卓应用则使用私有文件）。用浏览器的设备工具栏把宽度设为约 360–412 px 可以看到手机布局；900 px 及以上会显示平板/桌面布局。

```bash
npm run check
```

`check` 会运行 TypeScript 编译器、测试和文字检查。文字检查要求项目文件使用英文，只允许以下位置出现中文：文件名包含 `zh-Hans` 的文件、安卓的 `values-zh-rCN`、`index.html` 中标有 `lang="zh-Hans"` 的行，以及本 README 中 `<!-- zh-Hans -->` 与 `<!-- /zh-Hans -->` 之间的中文部分。只运行测试用 `npm test`。

## 安卓构建

需要：JDK 21，以及带有 platform 36 和 Build Tools 35+ 的 Android SDK（Gradle 通过 `ANDROID_HOME`、`android/local.properties` 或默认安装位置找到 SDK）。

```bash
npm run android:debug
```

生成 `releases/classday-<version>-debug.apk` 及其 SHA-256 校验值。调试版用本机的调试密钥签名，只用于测试，不能覆盖安装正式版。

```bash
npm run android:test
```

运行原生单元测试（存储、备份数据、外观插件：颜色、深色模式和语言）。`npm run android:lint` 运行安卓 lint，报告写在 `android/app/build/reports/`。

### 正式版构建

只有两个应用用同一个密钥签名时，安卓才允许覆盖安装更新，所以每个正式版都用同一个私有密钥签名。它的证书 SHA-256 记录在 `android/release-certificate.sha256` 中。

1. 把私有的签名文件夹放在 `.android-signing/`（`release.jks` 和 `signing.properties`）。它不会被纳入版本控制；不要把它放进任何要分享的东西里，并另外私下备份。密钥会在 properties 文件旁边查找，所以移动位置后不需要修改里面的 `storeFile` 路径。
2. 构建：

   ```bash
   npm run android:release
   ```

生成 `releases/classday-<version>.apk` 及其 SHA-256 校验值。没有密钥时脚本会拒绝继续，并且会把生成的 APK 的证书与记录的证书比对，所以不会意外产生无法覆盖安装的 APK。版本名来自 `package.json`，版本号由它推算（1.0.0 → 10000，1.2.3 → 10203）。

## 导入课表

所有内容都在手机上读取，文件不会离开手机。**从文件导入**可以选择任何文件，按文件内容（而不是扩展名）决定怎么读取，因为教务系统导出的“Excel”常常其实是网页。

- **PDF。** 针对国内教务系统导出的课表 PDF：星期几为列、节次为行，单元格里是课程名，后面跟着 `(1-2节)` 这样的节次、周次、校区、教室和老师。pdf.js 读取文字及其位置；星期标题确定各列，没有标题的第二页接着第一页。表格上方的文字（你的姓名和学号）和下方的备注会被忽略。其他版式会退回到逐行读取文字；如果仍然读不到，就复制 PDF 里的文字粘贴进来。
- **网页和 Excel。** 教务系统里保存的课表网页（`.html`）、安卓版 Chrome“下载网页”得到的 `.mhtml`、`.xlsx`、Excel 2003 XML，以及其实是网页或 XML 的 `.xls`。网页按 GBK 或 UTF-8 读取，不会运行其中的脚本，也不会加载任何外部内容；`.xlsx` 用系统自带的解压和 XML 解析读取，不依赖电子表格库。有一行星期几表头的表格按课表网格读取：单元格的星期来自表头；如果单元格里没写节次，就按它跨越的行（合并单元格）对应的节次。一格里的多门课可以用空行隔开。没有星期表头的表格按“每行一门课”读取。旧版二进制 `.xls` 请先用 WPS 或 Excel 另存为 `.xlsx`。
- **文字。** 每行一门课，各项顺序随意：课程名、星期几、时间（`08:00-09:40`）或节次，以及可选的周次、教室和老师，中英文都可以。只写了星期几的一行，会应用到它下面的各行。
- **节次和周次。** 按节次记录的课表会询问一次第一周的星期一和上课时间。如果文件在节次旁边写了时间（比如“第1节 08:00-08:45”，PDF、网页和 Excel 都可以），就用这些时间，并提示你核对；否则沿用已经设置的上课时间；都没有的话，先填入一份示例作息，截到课表用到的节次，请对照学校的作息核对（`src/domain/periods.ts` 中的 `EXAMPLE_PERIODS`）。两者都会记住，导入的课程会随之后修改的上课时间一起调整。
- **核对。** 保存前你能看到每门课，可以去掉读错的。用同一个名称再次导入，会更新这些课程并保留你自己做的修改。

课日不会登录学校网站：各校教务系统差别太大，所以它读取系统导出的课表。

## 局限

- 提醒使用安卓的非精确闹钟，可能晚到几分钟；手机的省电设置可能让它更晚。
- 文件读取针对教务系统的表格式课表；特殊版式可能需要改为粘贴文字。旧版二进制 `.xls` 需要先另存为 `.xlsx`。
- 一次只用一台设备：没有同步。换手机时用备份文件迁移。

## 许可说明

为了离线使用，应用内置了 `ical.js`（MPL-2.0）、Mozilla 的 pdf.js 及其中文字符映射（`pdfjs-dist`，Apache-2.0）、Capacitor 本地通知（MIT）和 Figtree 字体（SIL Open Font License）。
<!-- /zh-Hans -->

---

# Classday

An Android planner for university life: your class timetable, your day drawn to scale, and your to-dos in order of what matters most. Classday reminds you before deadlines and events.

No account, no server, no tracking. Everything stays on the phone unless you export a backup.

## What it does

- **A timetable of events.** Every event is one of three kinds: **Once**, **Short-term** (repeats until an end date, like an exam week) or **Long-term** (repeats with no planned end, like classes or the gym). An event can repeat on several weekdays or every day, take the whole day, and have its own reminder. The **+** in the header of Today and Week adds one; tapping free time on Today adds one there.
- **Events from a pasted notice.** Paste a whole group announcement or chat message into an event's name, such as *“Club meeting Wed 2pm in Room 204”* or the same kind of notice in Chinese. The name, date, start and end (or length) and place are read from it, greetings and sign-offs are dropped, and every field shows for checking. Inserting it from the Android keyboard's clipboard suggestion works too. With no end or length in the text, an event lasts one double period, lined up with your period times (`src/domain/notice.ts`, `notice.zh-Hans.ts`).
- **To-dos, apart from the timetable.** A to-do has an optional deadline (picked on a full calendar, with an optional time), a time needed (*30 min*, *1 h* or your own), and two priorities that start unset: the **flag** for important and the **clock** for urgent. Typing `Lab report fri 2h important` fills them in as removable chips, in English or Chinese. Nothing is ever placed on the timetable for a to-do.
- **The to-do list in Eisenhower order.** Overdue first (greyed, and still open until you tick it off), then important and urgent, important, urgent, and the rest; the nearest deadline leads within each group. A to-do due within 12 hours carries a red warning.
- **Today.** The whole day on one time scale, the hours down the side: events, meals and free time each as tall as they last, and a line at the current time. Earlier hours stay in place, quieter. Swipe sideways for the next or previous day.
- **Week.** A timetable grid: a column per day, the periods with their times down the side (or hours, until class times are set), each event in its own soft color, all-day events under the day row, and the semester week number on top. Back-to-back classes sit flush. Swipe sideways for the next or previous week.
- **Class times.** *Settings → Timetable → Class times* holds when each period starts and ends at your school. Class length and break change every period at once; moving one period moves the ones after it up to lunch or dinner, so a switch to summer or winter hours is one change. Classes imported by period remember their periods and move with the class times.
- **Reminders.** Notifications before a to-do's deadline (on the day, or one or two days before) and before any event that asks for one. They arrive while the app is closed.
- **Notes.** Quick notes with draft recovery, search, tappable links, and "Make it a to-do" that keeps the whole note.
- **Timetable import.** **From a file**: the PDF, Excel file (`.xlsx`), saved web page or `.ics` calendar from your school's academic system; or paste or open a text list of classes. Every change is reviewed first (leave out anything wrong), and the last import can be undone. Cancel a single class ("Not happening this time") without touching the series.
- **Backups.** Export and restore one JSON file. Seven daily automatic copies on the device for recovery.
- **English and Simplified Chinese.** *Settings → Appearance → Language*: *System* (the phone's language), *English* or Simplified Chinese. Everything switches at once, including dates, durations and reminders. On Android 13+ the app also appears in the phone's own per-app language settings, and a change made there is picked up.
- **Settings, grouped.** *Planning* (your day, reminders, timetable) and *App* (appearance, backup and data), each on its own page.
- **Times on wheels.** Every time is chosen on hour and minute wheels that open under the field (with am/pm on a 12-hour phone), instead of Android's clock dial.
- **Appearance.** Light, Dark or follow the phone (*System*). Nine accent colors (Indigo by default, plus Violet, Orchid, Rose, Coral, Amber, Green, Teal and Blue), or **Wallpaper** colors on Android 12+. The whole app, including the status and navigation bars, changes the moment you pick, and every accent keeps text as readable as the default.

The app is called Classday in English and has its own Chinese name on Chinese phones (`android/app/src/main/res/values-zh-rCN/strings.xml`).

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

`check` runs the TypeScript compiler, the test suite and the text audit, which keeps project files in English and allows Chinese only in the Simplified Chinese files (names containing `zh-Hans`, Android's `values-zh-rCN`, lines of `index.html` marked `lang="zh-Hans"`, and the Chinese half of this README, between `<!-- zh-Hans -->` and `<!-- /zh-Hans -->`). `npm test` alone runs the tests.

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

Everything is read on the phone; no file leaves it. **From a file** lets you choose any file and reads it by what it holds, not its extension, since an academic system's "Excel" export is often a web page.

- **PDF.** Made for the timetable PDFs that Chinese academic systems export: weekday columns, period rows, and cells such as a course name followed by `(1-2…)` periods, weeks, campus, room and teacher. pdf.js reads the text and its position; the weekday headers mark the columns, and a second page without headers continues the first. Text above the grid (your name and student number) and notes below it are ignored. Other layouts fall back to reading the text line by line; if that finds nothing, copy the PDF's text and paste it instead.
- **Web pages and Excel.** A timetable page saved from the academic system (`.html`), the `.mhtml` that Chrome on Android saves, `.xlsx`, Excel 2003 XML, and `.xls` files that are really a web page or XML. Pages are read as GBK or UTF-8, without running their scripts or loading anything they link to; `.xlsx` is opened with the phone's own unzipping and XML parser, with no spreadsheet library. A table with a header row of weekdays is read as a timetable grid: a cell takes its weekday from the header and, when its text doesn't give periods, the periods of the rows it spans (merged cells). Classes sharing a cell can be separated by a blank line. A table without a weekday header is read as one class per row. An older binary `.xls` needs saving as `.xlsx` in WPS or Excel first.
- **Text.** One class per line, fields in any order: a name, a weekday, a time (`08:00-09:40`) or periods, and optionally weeks, room and teacher, in English or Chinese. A line holding only a weekday applies to the lines below it.
- **Periods and weeks.** Imports that count periods ask once for the Monday of week one and the class times. When the file writes times beside the period numbers (such as "1 08:00-08:45", in a PDF, page or spreadsheet), those are used and flagged for checking; otherwise saved class times are used as they are; otherwise an example schedule is filled in, cut to the periods the timetable uses, for checking against your school's (`EXAMPLE_PERIODS` in `src/domain/periods.ts`). Both are remembered, and imported classes move with any later change to the class times.
- **Review.** You see every class before anything is saved and can leave out anything misread. Importing again under the same name updates those classes and keeps your own edits.

Classday doesn't sign in to school websites: academic systems differ too much, so it reads the timetable they export instead.

## Limits

- Reminders use Android's inexact alarms, so one can arrive a few minutes late; the phone's battery settings can delay it further.
- The file readers know grid timetables from academic systems; an unusual layout may need the text pasted instead. An older binary `.xls` needs saving as `.xlsx` first.
- One device at a time: there is no sync. Move between phones with a backup file.

## License notes

`ical.js` (MPL-2.0), Mozilla's pdf.js with its Chinese character maps (`pdfjs-dist`, Apache-2.0), Capacitor's local notifications (MIT) and the Figtree font (SIL Open Font License) are bundled for offline use.
