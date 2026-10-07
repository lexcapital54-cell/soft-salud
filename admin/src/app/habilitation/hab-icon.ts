import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Íconos de línea (viewBox 24×24, trazo 1.7), misma familia visual que Lucide. */
const ICONS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5 M5 9v11h5v-6h4v6h5V9',
  dashboard: 'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z',
  layers: 'M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z',
  file: 'M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5z M14 2.5V7.5h5 M9 13h6 M9 17h6',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3.5 6h.01 M3.5 12h.01 M3.5 18h.01',
  calendar: 'M4 5.5h16v15H4z M4 10h16 M8 3v4 M16 3v4',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7.5V12l3 2',
  archive: 'M3 4h18v4H3z M5 8v11.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8 M10 12h4',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7.5V12l3 2',
  upload: 'M12 15V3 M7 8l5-5 5 5 M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M15.5 15.5 21 21',
  filter: 'M3 4.5h18l-7 8.5v6l-4 2v-8z',
  plus: 'M12 5v14 M5 12h14',
  filePlus: 'M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5z M14 2.5V7.5h5 M12 11v6 M9 14h6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  pencil: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  replace: 'M4 7.5h14l-3.5-3.5 M20 16.5H6l3.5 3.5',
  restore: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5',
  x: 'M6 6l12 12 M18 6 6 18',
  save: 'M5 3h11l4 4v12.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3z M8 3v5h7V3 M7 21v-7h10v7',
  printer: 'M6 9V3h12v6 M6 18H4.5A1.5 1.5 0 0 1 3 16.5v-6A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H18 M6 14h12v7H6z',
  trash: 'M3 6h18 M8 6V4h8v2 M6 6l1 14.5h10L18 6 M10 10.5v6 M14 10.5v6',
  arrowLeft: 'M19 12H5 M11 6l-6 6 6 6',
  image: 'M4 4h16v16H4z M8.5 7.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3 M20 15l-5-5L5 20',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  building: 'M4 21V4.5A1.5 1.5 0 0 1 5.5 3h8A1.5 1.5 0 0 1 15 4.5V21 M15 9h4.5A1.5 1.5 0 0 1 21 10.5V21 M2 21h20 M8 7h3 M8 11h3 M8 15h3',
  package: 'M12 2.5 3 7v10l9 4.5 9-4.5V7z M3 7l9 4.5L21 7 M12 11.5v10 M7.5 4.8l9 4.5',
  pill: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z M8.5 8.5l7 7',
  clipboard: 'M9 3h6v3H9z M8 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2 M9 12h6 M9 16h4',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2 M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2',
  scale: 'M12 3v18 M5 21h14 M3 8h18 M6 8l-3 7a3 3 0 0 0 6 0z M18 8l-3 7a3 3 0 0 0 6 0z',
  shield: 'M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z M9 12l2 2 4-4',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  tag: 'M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z M7.5 7.5h.01',
  logout: 'M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9 M16 17l5-5-5-5 M21 12H9',
  external: 'M14 3h7v7 M21 3l-9 9 M19 14v5.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 19.5v-13A1.5 1.5 0 0 1 4.5 5H10',
  key: 'M14.5 4a5.5 5.5 0 1 1-4.9 8L3 18.5V21h3.5v-2h2v-2h2l1.1-1.1A5.5 5.5 0 0 1 14.5 4z M16.5 7.5h.01',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z M9 8h6 M9 12h6 M9 16h3',
  monitor: 'M3 4.5h18v12H3z M8 21h8 M12 16.5V21',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  power: 'M12 3v9 M6.3 6.8a8 8 0 1 0 11.4 0',
  userPlus: 'M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M8.5 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M19 8v6 M16 11h6',
  refresh: 'M20 11a8 8 0 0 0-14.6-4.5L3 9 M3 4v5h5 M4 13a8 8 0 0 0 14.6 4.5L21 15 M21 20v-5h-5',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
};

@Component({
  selector: 'hab-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    [attr.width]="size()"
    [attr.height]="size()"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  ><path [attr.d]="d()" /></svg>`,
  styles: [':host{display:inline-flex;line-height:0;flex:none}'],
})
export class HabIcon {
  readonly name = input.required<string>();
  readonly size = input(18);
  readonly d = computed(() => ICONS[this.name()] ?? ICONS['file']);
}
