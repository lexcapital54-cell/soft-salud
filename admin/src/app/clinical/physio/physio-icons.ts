import { Component, computed, input } from '@angular/core';

/** Íconos de línea (viewBox 24×24) de las convenciones del formato de fisioterapia. */
const ICONS: Record<string, string> = {
  // Terapias
  manualTherapy:
    'M8 13V5.5a1.5 1.5 0 0 1 3 0V12 M11 11V4a1.5 1.5 0 0 1 3 0v7 M14 11V5.5a1.5 1.5 0 0 1 3 0V13 M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.3 15.4a1.6 1.6 0 0 1 2.5-2L8 15.5',
  electrotherapy: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  ultrasound: 'M3 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M10 8a5.5 5.5 0 0 1 0 8 M14 5a10 10 0 0 1 0 14 M18 2.5a14 14 0 0 1 0 19',
  therapeuticLaser:
    'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9 7 7 M17 17l2.1 2.1 M4.9 19.1 7 17 M17 7l2.1-2.1',
  magnetotherapy: 'M6 3h4v8a2 2 0 0 0 4 0V3h4v8a6 6 0 0 1-12 0V3z M6 7h4 M14 7h4',
  massageTherapy:
    'M3 21h18 M4 17.5c2.5-1.3 5-1.3 8 0s5.5 1.3 8 0 M8 13V7.5a1.5 1.5 0 0 1 3 0V12 M11 11V6a1.5 1.5 0 0 1 3 0v6 M14 12V8a1.5 1.5 0 0 1 3 0v5',
  therapeuticExercise:
    'M13 4.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M6 10.5 9.5 8l4 .5 2 3.5 3 1 M9.5 8 8 14l3.5 2.5-1 5.5 M8 14l-3.5 3.5',
  lymphaticDrainage:
    'M12 4a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M12 8v6 M8 11l4 2 4-2 M6 20c1.5-3 3.5-5 6-6 2.5 1 4.5 3 6 6 M3 14l2 1.5 M21 14l-2 1.5',
  functionalTaping:
    'M7.5 21.5 2.5 16.5a2 2 0 0 1 0-2.8L13.7 2.5a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L10.3 21.5a2 2 0 0 1-2.8 0z M8 8l8 8 M11 12h.01 M12 11h.01 M13 12h.01 M12 13h.01',
  dryNeedling: 'M21 3 10 14 M18 2l4 4 M10 14l-2.5 2.5 M7.5 16.5 3 21 M12 10l2 2 M14.5 7.5l2 2',
  hydrotherapy: 'M12 2.5c-3.5 4.5-6 7.8-6 11a6 6 0 0 0 12 0c0-3.2-2.5-6.5-6-11z M9 14a3 3 0 0 0 3 3',
  // Antecedentes
  antPathological:
    'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z M3.5 12H8l1.5-3 2.5 6 1.5-3h3',
  antSurgical: 'M19.5 3.5 8 15l2 2L21.5 5.5a1.4 1.4 0 0 0-2-2z M8 15l-5 6 7-4 M14 9l1.5 1.5',
  antTraumatic:
    'M17 10c.7-.7 1.7 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .8.7 1.8 0 2.5l-7 7c-.7.7-1.7 0-2.5 0a2.5 2.5 0 0 0 0 5c.3 0 .5.2.5.5a2.5 2.5 0 1 0 5 0c0-.8-.7-1.8 0-2.5z',
  antAllergies: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
  antPharmacological: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z M8.5 8.5l7 7',
  antFamily:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  antPersonal: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M4 21a8 8 0 0 1 16 0',
  antOccupational: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16 M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  antObgyn: 'M12 15v7 M9 19h6 M12 3a6 6 0 1 0 0 12a6 6 0 1 0 0-12',
  antOthers: 'M4 4h16v16H4z M12 8v8 M8 12h8',
  // Secciones
  person: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M4 21a8 8 0 0 1 16 0',
  clipboard:
    'M9 3h6v3H9z M8 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2 M12 10v5 M9.5 12.5h5',
  history: 'M9 4a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M3 20a6 6 0 0 1 12 0 M16 8h5 M16 12h5 M17 16h4',
  systems: 'M3 12h4l2-4 3 8 2-4h7',
  target: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16 M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7 M12 1v4 M12 19v4 M1 12h4 M19 12h4',
  evaluation: 'M6 3v5a4 4 0 0 0 8 0V3 M10 12v3a5 5 0 0 0 10 0v-2 M20 9.5a1.75 1.75 0 1 0 0 3.5a1.75 1.75 0 1 0 0-3.5',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M15.5 15.5 21 21',
  diagnosis:
    'M9 3h6v3H9z M8 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2 M9 13.5l2 2 4-4',
  lotus:
    'M12 6c2 2 3 4.5 3 7s-1 4-3 5c-2-1-3-2.5-3-5s1-5 3-7z M9.4 9.6C7.4 9 5 9.5 3 11c.5 4 4 7 9 7 M14.6 9.6c2-.6 4.4-.1 6.4 1.4-.5 4-4 7-9 7',
  objectives: 'M11 5a7 7 0 1 0 8 8 M11 9a3 3 0 1 0 4 4 M12 12l8-8 M17 4h3v3',
  plan: 'M6 2.5h8l4 4V21a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 21z M14 2.5V7h4 M9 12h6 M9 15.5h6 M9 19h4',
  money: 'M3 7h18v10H3z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M6 10v4 M18 10v4',
  calendar: 'M4 6h16v15H4z M4 10h16 M8 3v5 M16 3v5',
  pencil: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  // Tablero premium
  home: 'M3 10.5 12 3l9 7.5 M5 9v11h5v-6h4v6h5V9',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  file: 'M6 2.5h8l4 4V21a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 21z M14 2.5V7h4 M9 13h6 M9 17h6',
  chart: 'M3 3v18h18 M7 15l4-4 3 3 5-6',
  settings:
    'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'M6 6l12 12 M18 6 6 18',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 21h16',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M12 7a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
  idCard: 'M3 5h18v14H3z M8 9a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M5 16.5a3.5 3.5 0 0 1 6 0 M14 10h4 M14 14h3',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7v5l3 2',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  pain: 'M12 21.5c-4.5-2.8-8-6.3-8-10.5A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 8 3c0 4.2-3.5 7.7-8 10.5z M10 11l2 2-2 2 2 2',
  mobility: 'M9 4.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M10.5 8v5l-3 7 M10.5 13l3 7 M7 10.5c2-1.5 5-1.5 7 0 M17 6a6 6 0 0 1 2.5 6',
  strength: 'M6.5 6.5v11 M17.5 6.5v11 M3 9.5v5 M21 9.5v5 M6.5 12h11',
  posture: 'M12 2.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M12 6.5v8 M8 9.5h8 M12 14.5l-3 7 M12 14.5l3 7',
  gait: 'M7 16.5c-1.4 0-2.5-1.6-2.5-4S5.6 7 7 7s2.5 2.5 2.5 5-1.1 4.5-2.5 4.5z M5.5 19.5h3 M17 11.5c-1.4 0-2.5-1.6-2.5-4S15.6 2 17 2s2.5 2.5 2.5 5-1.1 4.5-2.5 4.5z M15.5 14.5h3',
  balance: 'M12 3v18 M5 21h14 M5 7h14 M5 7l-3 7a3 3 0 0 0 6 0z M19 7l-3 7a3 3 0 0 0 6 0z',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
  note: 'M4 4h16v12l-4 4H4z M16 20v-4h4 M8 9h8 M8 13h5',
  brain: 'M12 5a3 3 0 0 0-5.8-1A3 3 0 0 0 4 8a3 3 0 0 0-1 5.5A3.5 3.5 0 0 0 7 19a3 3 0 0 0 5 1z M12 5a3 3 0 0 1 5.8-1A3 3 0 0 1 20 8a3 3 0 0 1 1 5.5A3.5 3.5 0 0 1 17 19a3 3 0 0 1-5 1z M12 5v15',
  heart: 'M12 20.5s-7.5-4.6-9.3-9.2A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 9.3 4.7c-1.8 4.6-9.3 9.2-9.3 9.2z',
  shield: 'M12 3 4.5 6v6c0 4.4 3.2 8.2 7.5 9 4.3-.8 7.5-4.6 7.5-9V6z M9 12l2 2 4-4',
  message: 'M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z M8 8h8 M8 12h5',
  stethoscope: 'M5 3v5a4 4 0 0 0 8 0V3 M9 12v3a5 5 0 0 0 10 0v-2 M19 9.5a1.75 1.75 0 1 0 0 3.5a1.75 1.75 0 1 0 0-3.5',
  chevronRight: 'M9 6l6 6-6 6',
  printer: 'M6 9V3h12v6 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v7H6z',
};

/** `<app-physio-icon name="target" badge />`: ícono suelto o dentro del distintivo azul con aro dorado. */
@Component({
  selector: 'app-physio-icon',
  host: { 'aria-hidden': 'true', '[class.badge]': 'badge()' },
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path [attr.d]="d()" />
    </svg>
  `,
  styles: `
    :host { display: inline-grid; place-items: center; width: 22px; height: 22px; flex: 0 0 auto; color: #1b365d; }
    svg { width: 100%; height: 100%; }
    :host(.badge) { width: 34px; height: 34px; padding: 7px; border-radius: 50%; background: #1b365d; color: #fff; box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px #c59b27; }
    @media print { :host(.badge) { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `,
})
export class PhysioIcon {
  readonly name = input.required<string>();
  readonly badge = input(false, { transform: (v: boolean | '') => v !== false });
  readonly d = computed(() => ICONS[this.name()] ?? '');
}
