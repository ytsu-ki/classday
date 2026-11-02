/** A small hand-drawn-feeling stroke icon set (24px grid, 1.75 stroke). */
const sun = 'M12 4v1.5M12 18.5V20M5.6 5.6l1 1M17.4 17.4l1 1M4 12h1.5M18.5 12H20M5.6 18.4l1-1M17.4 6.6l1-1M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z';
const moon = 'M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z';

const paths = {
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.2 4.2L19 7',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  today: 'M12 3v2M12 19v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M3 12h2M19 12h2M4.6 19.4L6 18M18 6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  week: 'M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5zM4 9h16M9 4v16M14.5 4v16',
  plans: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  notes: 'M6 3.5h8.5L19 8v11.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-15a1 1 0 011-1zM14 3.5V8h5M8.5 12.5h7M8.5 16h5',
  settings: 'M12 9.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 01-1.8 1l-.3 2H10.8l-.3-2a7 7 0 01-1.8-1l-1.9.7L5 14.7l1.6-1.2a7 7 0 010-2L5 10.3l1.8-3.1 1.9.7a7 7 0 011.8-1l.3-2h3.4l.3 2a7 7 0 011.8 1l1.9-.7 1.8 3.1-1.6 1.2a7 7 0 010 2z',
  sun,
  moon,
  phone: 'M8.5 3h7A1.5 1.5 0 0117 4.5v15a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 19.5v-15A1.5 1.5 0 018.5 3zM11 18h2',
  bell: 'M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0',
  clock: 'M12 7v5l3 2M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z',
  edit: 'M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M5 7h14M10 4h4M7 7l1 13h8l1-13M10 11v5M14 11v5',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  school: 'M3 9l9-5 9 5-9 5zM7 11.2V16c0 1.4 2.2 2.8 5 2.8s5-1.4 5-2.8v-4.8M21 9v6',
  calendar: 'M5 5.5h14a1 1 0 011 1V19a1 1 0 01-1 1H5a1 1 0 01-1-1V6.5a1 1 0 011-1zM4 10h16M8.5 3.5v4M15.5 3.5v4',
  search: 'M10.5 4a6.5 6.5 0 104.2 11.5L20 20M10.5 4a6.5 6.5 0 014.2 11.5',
  meal: 'M7 3v7a2 2 0 002 2v9M11 3v7a2 2 0 01-2 2M9 3v6M17 21V3c-1.7 1-3 3.5-3 7 0 1.3.6 2 1.5 2H17',
  alert: 'M12 4l9 15.5H3zM12 10v4.5M12 17.2h.01',
  sparkle: 'M12 3l1.6 4.9L18.5 9.5l-4.9 1.6L12 16l-1.6-4.9L5.5 9.5l4.9-1.6zM18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  leaf: 'M5 19c0-8 6-13 14-14-.5 8-5.5 13.5-14 14zM5 19l7-7',
  shield: 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z',
  timer: 'M12 8v5l2.5 1.5M9 2.5h6M12 5a8 8 0 100 16 8 8 0 000-16z',
  flag: 'M6 21V4.5M6 4.5h11.5l-2.5 4.25 2.5 4.25H6',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}
    >
      <path d={paths[name]} />
    </svg>
  );
}
