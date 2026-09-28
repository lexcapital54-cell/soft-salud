import { Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ALL_TOOLS,
  BRACKET_TYPES,
  CONDITION_TOOLS,
  ORTHO_APPLIANCES,
  ORTHO_CONDITION_TOOLS,
  ORTHO_DEVICE_TOOLS,
  ORTHO_MOVEMENT_TOOLS,
  ORTHO_OCCLUSION_TOOLS,
  ORTHO_PLAN_PHASES,
  ORTHO_TOOLS,
  DECIDUOUS_LOWER,
  DECIDUOUS_UPPER,
  DentalTool,
  DentalToolDef,
  DentistryContent,
  MARK_TOOLS,
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  SURFACE_LABELS,
  SURFACE_TOOLS,
  SurfaceState,
  ToothCondition,
  ToothMark,
  ToothRecord,
  ToothSurface,
  dentalToolColor,
  dentalToolLabel,
} from './dentistry.models';

type Position = 'top' | 'bottom' | 'left' | 'right' | 'center';
type Mode = 'SELECT' | 'PAINT' | 'ERASE' | 'NOTE';
type ViewKind = 'COMPLETA' | 'MAXILAR' | 'MANDIBULA' | 'OCLUSAL';
type Dentition = 'PERMANENTE' | 'TEMPORAL' | 'MIXTA';
type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar';

interface ToothShape {
  viewBox: string;
  width: number;
  crown: string;
  roots: string[];
  canals: string[];
  detail?: string;
  crownLeft: number;
  crownRight: number;
}

interface Row {
  teeth: number[];
  upper: boolean;
  small?: boolean;
}

const SQUARE: Record<Position, string> = {
  top: '0,0 36,0 26,10 10,10',
  bottom: '10,26 26,26 36,36 0,36',
  left: '0,0 10,10 10,26 0,36',
  right: '36,0 36,36 26,26 26,10',
  center: '10,10 26,10 26,26 10,26',
};
const POSITIONS: Position[] = ['top', 'bottom', 'left', 'right', 'center'];

/** Siluetas dibujadas con la raíz arriba (maxilar); la mandíbula se refleja en vertical. */
const SHAPES: Record<ToothKind, ToothShape> = {
  incisor: {
    viewBox: '10 0 30 100',
    width: 30,
    crown: 'M14 56 C14 78 16 92 20 96 C23 98 27 98 30 96 C34 92 36 78 36 56 Z',
    roots: ['M16 57 C17 35 20 16 25 4 C30 16 33 35 34 57 Z'],
    canals: ['M25 12 L25 62'],
    crownLeft: 14,
    crownRight: 36,
  },
  canine: {
    viewBox: '10 0 30 100',
    width: 30,
    crown: 'M13 54 C12 74 17 90 25 99 C33 90 38 74 37 54 Z',
    roots: ['M16 55 C17 30 21 10 25 0 C29 10 33 30 34 55 Z'],
    canals: ['M25 8 L25 62'],
    crownLeft: 13,
    crownRight: 37,
  },
  premolar: {
    viewBox: '9 0 32 100',
    width: 32,
    crown: 'M12 56 C11 80 14 92 19 95 C22 97 28 97 31 95 C36 92 39 80 38 56 Z',
    roots: ['M16 57 C17 36 21 16 25 6 C29 16 33 36 34 57 Z'],
    canals: ['M25 14 L25 62'],
    detail: 'M18 89 Q25 83 32 89',
    crownLeft: 12,
    crownRight: 38,
  },
  molar: {
    viewBox: '3 0 44 100',
    width: 44,
    crown: 'M5 56 C4 80 7 93 14 96 C20 99 30 99 36 96 C43 93 46 80 45 56 Z',
    roots: [
      'M8 57 C8 38 10 20 15 8 C19 22 21 40 22 57 Z',
      'M20 57 C21 42 23 28 25 18 C27 28 29 42 30 57 Z',
      'M28 57 C29 40 31 22 35 8 C40 20 42 38 42 57 Z',
    ],
    canals: ['M15 16 L16 62', 'M35 16 L34 62'],
    detail: 'M11 90 Q18 84 25 90 Q32 84 39 90',
    crownLeft: 5,
    crownRight: 45,
  },
};

const MODES: Array<{ key: Mode; label: string; icon: string }> = [
  { key: 'SELECT', label: 'Seleccionar', icon: 'M5 3 L5 17 L9 13 L12 19 L14 18 L11 12 L16 12 Z' },
  { key: 'PAINT', label: 'Pintar', icon: 'M4 16 L4 20 L8 20 L18 10 L14 6 Z M15 5 L19 9 L21 7 L17 3 Z' },
  { key: 'ERASE', label: 'Borrar', icon: 'M3 15 L10 8 L17 15 L13 19 L7 19 Z M10 8 L14 4 L21 11 L17 15' },
  { key: 'NOTE', label: 'Agregar nota', icon: 'M5 3 H15 L19 7 V21 H5 Z M8 10 H16 M8 14 H16 M8 18 H13' },
];

const VIEWS: Array<{ key: ViewKind; label: string; icon: string }> = [
  { key: 'COMPLETA', label: 'Vista completa', icon: 'M12 5 C9 2 4 3 4 8 C4 12 6 14 7 20 C8 22 10 21 10 18 C10 16 11 15 12 15 C13 15 14 16 14 18 C14 21 16 22 17 20 C18 14 20 12 20 8 C20 3 15 2 12 5 Z' },
  { key: 'MAXILAR', label: 'Solo maxilar', icon: 'M4 17 C4 9 8 5 12 5 C16 5 20 9 20 17 M7 17 C7 11 9 8 12 8 C15 8 17 11 17 17' },
  { key: 'MANDIBULA', label: 'Solo mandíbula', icon: 'M4 7 C4 15 8 19 12 19 C16 19 20 15 20 7 M7 7 C7 13 9 16 12 16 C15 16 17 13 17 7' },
  { key: 'OCLUSAL', label: 'Vista oclusal', icon: 'M5 19 C5 9 8 5 12 5 C16 5 19 9 19 19 M9 17 A1.5 1.5 0 1 0 9 16.9 M15 17 A1.5 1.5 0 1 0 15 16.9 M12 9 A1.5 1.5 0 1 0 12 8.9' },
];

type LegendIcon =
  | 'dot'
  | 'x'
  | 'triangle'
  | 'bracket'
  | 'band'
  | 'wire'
  | 'ring'
  | 'pocket'
  | 'arrows'
  | 'fistula'
  | 'bolt'
  | 'star'
  | 'tooth'
  | 'temporal'
  | 'circle'
  | 'super'
  | 'lig-e'
  | 'lig-m'
  | 'hook'
  | 'chain'
  | 'spring'
  | 'button'
  | 'tube'
  | 'tad'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-right'
  | 'rotate'
  | 'ibeam'
  | 'midline'
  | 'crossbite'
  | 'openbite'
  | 'overbite'
  | 'midshift'
  | 'crowding'
  | 'diastema'
  | 'nospace'
  | 'space'
  | 'bracket-ceramic'
  | 'bracket-self'
  | 'aligner'
  | 'expander'
  | 'lingual'
  | 'retainer';

interface LegendItem {
  key?: string;
  label: string;
  color: string;
  icon: LegendIcon;
}

const LEGEND: LegendItem[] = [
  { label: 'Caries', color: '#e53935', icon: 'dot' },
  { label: 'Brackets', color: '#1d4ed8', icon: 'bracket' },
  { label: 'Obturación', color: '#1e63d6', icon: 'dot' },
  { label: 'Arco ortodóntico', color: '#10306b', icon: 'wire' },
  { label: 'Endodoncia', color: '#f5b301', icon: 'dot' },
  { label: 'Bandas', color: '#1d4ed8', icon: 'band' },
  { label: 'Corona', color: '#8e24aa', icon: 'dot' },
  { label: 'Separador', color: '#7c3aed', icon: 'ring' },
  { label: 'Prótesis', color: '#16a34a', icon: 'dot' },
  { label: 'Lesión periodontal', color: '#e11d48', icon: 'pocket' },
  { label: 'Implante', color: '#64748b', icon: 'dot' },
  { label: 'Movilidad', color: '#0b3a6e', icon: 'arrows' },
  { label: 'Sellante', color: '#14b8a6', icon: 'dot' },
  { label: 'Fístula', color: '#db2777', icon: 'fistula' },
  { label: 'Fractura', color: '#f97316', icon: 'dot' },
  { label: 'Trauma', color: '#1e3a8a', icon: 'bolt' },
  { label: 'Diente ausente', color: '#6b7280', icon: 'x' },
  { label: 'Otra observación', color: '#0f172a', icon: 'star' },
  { label: 'Extracción indicada', color: '#dc2626', icon: 'x' },
  { label: 'Diente incluido', color: '#475569', icon: 'triangle' },
];

type QuickKey = 'CARIES' | 'RESTAURACION' | 'BRACKET' | 'NOTE';

const QUICK_ACTIONS: Array<{ key: QuickKey; label: string; icon: string }> = [
  { key: 'CARIES', label: 'Agregar caries', icon: 'M12 3 A9 9 0 1 0 12.01 3 Z M9 9 L15 15 M15 9 L9 15' },
  { key: 'RESTAURACION', label: 'Agregar obturación', icon: 'M12 3 C8 3 5 6 5 10 C5 15 9 21 12 21 C15 21 19 15 19 10 C19 6 16 3 12 3 Z M9 10 H15 V14 H9 Z' },
  { key: 'BRACKET', label: 'Agregar bracket', icon: 'M4 7 H20 V17 H4 Z M4 12 H20 M9 7 V17 M15 7 V17' },
  { key: 'NOTE', label: 'Agregar nota', icon: 'M5 4 H14 L19 9 V20 H5 Z M14 4 V9 H19 M8 13 H16 M8 16 H13' },
];

const LEGEND_BY_LABEL = new Map(LEGEND.map((l) => [l.label, l]));

/** Convenciones del odontograma de ortodoncia, agrupadas como en la plantilla impresa. */
const ORTHO_LEGEND: Array<{ title: string; items: LegendItem[] }> = [
  {
    title: 'Piezas dentales',
    items: [
      { key: 'PRESENTE', label: 'Diente presente', color: '#94a3b8', icon: 'tooth' },
      { key: 'AUSENTE', label: 'Diente ausente', color: '#6b7280', icon: 'x' },
      { key: 'EXTRACCION_INDICADA', label: 'Extracción indicada', color: '#dc2626', icon: 'x' },
      { key: 'INCLUIDO', label: 'Diente incluido', color: '#1d4ed8', icon: 'circle' },
      { key: 'ERUPCION', label: 'Diente en erupción', color: '#1d4ed8', icon: 'triangle' },
      { key: 'SUPERNUMERARIO', label: 'Diente supernumerario', color: '#0f766e', icon: 'super' },
      { key: 'TEMPORAL', label: 'Diente temporal', color: '#64748b', icon: 'temporal' },
    ],
  },
  {
    title: 'Ortodoncia',
    items: [
      { key: 'BRACKET', label: 'Bracket', color: '#1d4ed8', icon: 'bracket' },
      { key: 'ARCO', label: 'Arco ortodóntico', color: '#10306b', icon: 'wire' },
      { key: 'LIGADURA_ELASTICA', label: 'Ligadura elástica', color: '#ec4899', icon: 'lig-e' },
      { key: 'LIGADURA_METALICA', label: 'Ligadura metálica', color: '#6b7280', icon: 'lig-m' },
      { key: 'GANCHO', label: 'Gancho', color: '#0f172a', icon: 'hook' },
      { key: 'CADENA', label: 'Cadena elástica', color: '#7c3aed', icon: 'chain' },
      { key: 'RESORTE', label: 'Resorte', color: '#0891b2', icon: 'spring' },
      { key: 'BOTON', label: 'Botón / Stop', color: '#0f172a', icon: 'button' },
      { key: 'TUBO', label: 'Tubo molar', color: '#475569', icon: 'tube' },
      { key: 'BANDA', label: 'Bandas', color: '#1d4ed8', icon: 'band' },
      { key: 'SEPARADOR', label: 'Separador', color: '#7c3aed', icon: 'ring' },
    ],
  },
  {
    title: 'Tipo de maloclusión / movimiento',
    items: [
      { key: 'PROTRUSION', label: 'Protrusión', color: '#dc2626', icon: 'arrow-up' },
      { key: 'RETRUSION', label: 'Retrusión', color: '#dc2626', icon: 'arrow-down' },
      { key: 'EXPANSION', label: 'Expansión', color: '#2563eb', icon: 'arrow-left' },
      { key: 'CONTRACCION', label: 'Contracción', color: '#2563eb', icon: 'arrow-right' },
      { key: 'ROTACION', label: 'Rotación', color: '#0f172a', icon: 'rotate' },
      { key: 'INTRUSION', label: 'Intrusión', color: '#dc2626', icon: 'ibeam' },
      { key: 'EXTRUSION', label: 'Extrusión', color: '#16a34a', icon: 'ibeam' },
      { key: 'MIDLINE', label: 'Línea media', color: '#5b8fc7', icon: 'midline' },
    ],
  },
  {
    title: 'Problemas dentales',
    items: [
      { key: 'CARIES', label: 'Caries', color: '#e53935', icon: 'dot' },
      { key: 'RESTAURACION', label: 'Obturación', color: '#1e63d6', icon: 'dot' },
      { key: 'SELLANTE', label: 'Sellante', color: '#14b8a6', icon: 'dot' },
      { key: 'FRACTURA', label: 'Fractura', color: '#f97316', icon: 'dot' },
      { key: 'ENDODONCIA', label: 'Endodoncia', color: '#f5b301', icon: 'dot' },
      { key: 'CORONA', label: 'Corona', color: '#8e24aa', icon: 'dot' },
      { key: 'PROTESIS', label: 'Prótesis fija', color: '#16a34a', icon: 'dot' },
      { key: 'PROTESIS_REMOVIBLE', label: 'Prótesis removible', color: '#0284c7', icon: 'dot' },
      { key: 'IMPLANTE', label: 'Implante', color: '#64748b', icon: 'dot' },
      { key: 'TRAUMA', label: 'Trauma', color: '#1e3a8a', icon: 'bolt' },
      { key: 'MOVILIDAD', label: 'Movilidad', color: '#0b3a6e', icon: 'arrows' },
      { key: 'FISTULA', label: 'Fístula', color: '#db2777', icon: 'fistula' },
      { key: 'LESION', label: 'Lesión periodontal', color: '#e11d48', icon: 'pocket' },
      { key: 'OTRO', label: 'Otra observación', color: '#0f172a', icon: 'star' },
    ],
  },
  {
    title: 'Tipo de aparato',
    items: [
      { key: 'BT_METALICO', label: 'Brackets metálicos', color: '#94a3b8', icon: 'bracket' },
      { key: 'BT_CERAMICO', label: 'Brackets cerámicos', color: '#94a3b8', icon: 'bracket-ceramic' },
      { key: 'BT_AUTOLIGADO', label: 'Brackets autoligables', color: '#475569', icon: 'bracket-self' },
      { key: 'AP_ALINEADOR', label: 'Alineador', color: '#0ea5e9', icon: 'aligner' },
      { key: 'AP_EXPANSOR', label: 'Expansor palatino', color: '#334155', icon: 'expander' },
      { key: 'TAD', label: 'Mini tornillo (TAD)', color: '#0f766e', icon: 'tad' },
      { key: 'AP_ARCO_LINGUAL', label: 'Arco lingual', color: '#334155', icon: 'lingual' },
      { key: 'AP_RETENEDOR', label: 'Retenedor', color: '#16a34a', icon: 'retainer' },
    ],
  },
  {
    title: 'Otras convenciones',
    items: [
      { key: 'MORDIDA_CRUZADA', label: 'Mordida cruzada', color: '#b45309', icon: 'crossbite' },
      { key: 'MORDIDA_ABIERTA', label: 'Mordida abierta', color: '#0369a1', icon: 'openbite' },
      { key: 'SOBREMORDIDA', label: 'Sobremordida', color: '#9a3412', icon: 'overbite' },
      { key: 'LINEA_MEDIA', label: 'Desviación de línea media', color: '#1e40af', icon: 'midshift' },
      { key: 'APINAMIENTO', label: 'Apiñamiento', color: '#9333ea', icon: 'crowding' },
      { key: 'DIASTEMA', label: 'Diastema', color: '#0d9488', icon: 'diastema' },
      { key: 'AUSENCIA_ESPACIO', label: 'Ausencia de espacio', color: '#be123c', icon: 'nospace' },
      { key: 'ESPACIO', label: 'Espacio en tratamiento', color: '#0369a1', icon: 'space' },
    ],
  },
];

const ORTHO_LEGEND_BY_KEY = new Map(ORTHO_LEGEND.flatMap((g) => g.items).map((l) => [l.key!, l]));

const TOOL_BY_KEY = new Map(ALL_TOOLS.map((t) => [t.key as string, t]));
const tools = (...keys: string[]) =>
  keys.map((k) => (k === 'PROTESIS' ? { ...TOOL_BY_KEY.get(k)!, label: 'Prótesis fija' } : TOOL_BY_KEY.get(k)!));

/** Secciones del menú del diente en ortodoncia; las superficies van entre la segunda y la tercera. */
const ORTHO_POP_TOP = [
  { title: 'Piezas dentales', tools: tools('AUSENTE', 'EXTRACCION_INDICADA', 'INCLUIDO', 'ERUPCION', 'SUPERNUMERARIO', 'TEMPORAL'), healthy: true, arch: false },
  {
    title: 'Problemas dentales',
    tools: tools('ENDODONCIA', 'CORONA', 'PROTESIS', 'PROTESIS_REMOVIBLE', 'IMPLANTE', 'TRAUMA', 'MOVILIDAD', 'FISTULA', 'LESION', 'OTRO'),
    healthy: false,
    arch: false,
  },
];
const ORTHO_POP_BOTTOM = [
  {
    title: 'Ortodoncia',
    tools: tools('BRACKET', ...ORTHO_DEVICE_TOOLS.map((t) => t.key as string), 'BANDA', 'SEPARADOR'),
    healthy: false,
    arch: true,
  },
  { title: 'Tipo de maloclusión / movimiento', tools: ORTHO_MOVEMENT_TOOLS, healthy: false, arch: false },
  { title: 'Otras convenciones', tools: ORTHO_OCCLUSION_TOOLS, healthy: false, arch: false },
];

const MOVEMENT_KEYS = new Set<string>(ORTHO_MOVEMENT_TOOLS.map((t) => t.key));
const OCCLUSION_KEYS = new Set<string>(ORTHO_OCCLUSION_TOOLS.map((t) => t.key));
const ORTHO_ONLY_KEYS = new Set<string>(ORTHO_TOOLS.map((t) => t.key));

const BRACKET_STYLES: Record<string, { fill: string; stroke: string; slot: string; clip?: boolean }> = {
  METALICO: { fill: '#94a3b8', stroke: '#64748b', slot: '#334155' },
  CERAMICO: { fill: '#f8fafc', stroke: '#94a3b8', slot: '#94a3b8' },
  AUTOLIGADO: { fill: '#475569', stroke: '#334155', slot: '#e2e8f0', clip: true },
};
const DEFAULT_BRACKET = { fill: '#1d4ed8', stroke: '#1d4ed8', slot: '#bfdbfe', clip: false };

const ORTHO_MARKS = new Set<string>(['BRACKET', 'BANDA', 'SEPARADOR']);
const ORTHO_LEGEND_ICONS = new Set<LegendIcon>(['bracket', 'band', 'wire', 'ring']);

/** Silueta del logo (muela). */
const LOGO_PATH =
  'M20 7 C14 2 4 2 3 12 C2 20 6 26 8 34 C9 40 13 42 14 36 C15 30 17 27 20 27 C23 27 25 30 26 36 C27 42 31 40 32 34 C34 26 38 20 37 12 C36 2 26 2 20 7 Z';

const DENTITIONS: Array<{ key: Dentition; label: string }> = [
  { key: 'PERMANENTE', label: 'Permanente' },
  { key: 'TEMPORAL', label: 'Temporal' },
  { key: 'MIXTA', label: 'Mixta' },
];

const PERMANENT_NAMES: Record<number, string> = {
  1: 'Incisivo central',
  2: 'Incisivo lateral',
  3: 'Canino',
  4: 'Primer premolar',
  5: 'Segundo premolar',
  6: 'Primer molar',
  7: 'Segundo molar',
  8: 'Tercer molar',
};
const DECIDUOUS_NAMES: Record<number, string> = {
  1: 'Incisivo central temporal',
  2: 'Incisivo lateral temporal',
  3: 'Canino temporal',
  4: 'Primer molar temporal',
  5: 'Segundo molar temporal',
};
const QUADRANT_NAMES: Record<number, string> = {
  1: 'superior derecho',
  2: 'superior izquierdo',
  3: 'inferior izquierdo',
  4: 'inferior derecho',
  5: 'superior derecho',
  6: 'superior izquierdo',
  7: 'inferior izquierdo',
  8: 'inferior derecho',
};

/** Prioridad del color en la vista oclusal. */
const OCCLUSAL_PRIORITY: DentalTool[] = [
  'AUSENTE',
  'EXTRACCION_INDICADA',
  'IMPLANTE',
  'PROTESIS',
  'PROTESIS_REMOVIBLE',
  'CORONA',
  'CARIES',
  'ENDODONCIA',
  'RESTAURACION',
  'FRACTURA',
  'SELLANTE',
];

@Component({
  selector: 'app-dental-odontogram',
  imports: [FormsModule, NgTemplateOutlet],
  template: `
    <div class="odg">
      <svg class="odg-defs" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="odg-enamel" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#e9e2d2" />
            <stop offset="0.35" stop-color="#ffffff" />
            <stop offset="0.7" stop-color="#fbf8f1" />
            <stop offset="1" stop-color="#e2d8c3" />
          </linearGradient>
          <linearGradient id="odg-root" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#e3d3b1" />
            <stop offset="0.5" stop-color="#f7eedb" />
            <stop offset="1" stop-color="#d8c49c" />
          </linearGradient>
          <linearGradient id="odg-crown-purple" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#faf1ff" />
            <stop offset="1" stop-color="#dcc0f0" />
          </linearGradient>
          <linearGradient id="odg-crown-green" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f0fdf4" />
            <stop offset="1" stop-color="#b7f0cc" />
          </linearGradient>
          <linearGradient id="odg-crown-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f0f9ff" />
            <stop offset="1" stop-color="#b6e0f7" />
          </linearGradient>
        </defs>
      </svg>

      <header class="odg-head">
        <div class="odg-brand" [class.ortho]="orthoMode()">
          <svg viewBox="0 0 40 44" aria-hidden="true">
            <path [attr.d]="logoPath" fill="#0b3a6e" />
            <path d="M12 12 C12 8 16 7 19 9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.7" />
            @if (orthoMode()) {
              <path d="M5 19 H35" stroke="#fff" stroke-width="1.6" />
              <rect x="9" y="16" width="6" height="6" rx="1.2" fill="#fff" />
              <rect x="17" y="16" width="6" height="6" rx="1.2" fill="#fff" />
              <rect x="25" y="16" width="6" height="6" rx="1.2" fill="#fff" />
            }
          </svg>
          <div>
            <strong>ODONTOGRAMA</strong>
            <span>{{ specialtyLabel() }}</span>
          </div>
        </div>
        <p class="odg-print-meta">
          <span><b>Paciente:</b> {{ patientName() || '—' }}</span>
          <span><b>Edad:</b> {{ patientAge() || '—' }}</span>
          <span><b>Historia clínica:</b> {{ recordCode() || '—' }}</span>
          <span><b>Fecha:</b> {{ recordDate() || '—' }}</span>
        </p>
        @if (professionalName()) {
          <p class="odg-tagline">
            {{ professionalName() }}
            @if (professionalCard()) {
              <small>T.P. {{ professionalCard() }}</small>
            }
          </p>
        }
      </header>

      <div class="odg-body" [class.ortho]="orthoMode()">
        <div class="odg-left">
          <div class="odg-main" #mainArea>
            <div class="odg-chart">
              @if (view() !== 'OCLUSAL') {
                @for (row of rows(); track $index) {
                  <div class="odg-row" [class.upper]="row.upper" [class.small]="row.small">
                    @if ($first && row.upper) {
                      <span class="odg-jaw">MAXILAR<br />SUPERIOR</span>
                    }
                    @if ($last && !row.upper) {
                      <span class="odg-jaw bottom">MANDÍBULA<br />INFERIOR</span>
                    }
                    @for (tooth of row.teeth; track tooth; let i = $index) {
                      <div
                        class="odg-tooth"
                        [class.midline]="i === row.teeth.length / 2 - 1"
                        [class.selected]="selected() === tooth"
                      >
                        @if (row.upper) {
                          <button type="button" class="odg-num" [class.on]="selected() === tooth" [class.marked]="!!record(tooth)" (click)="onToothClick(tooth, $event)">{{ tooth }}</button>
                          @if (showSurfaces()) {
                            <ng-container *ngTemplateOutlet="squareTpl; context: { $implicit: tooth, small: row.small }" />
                          }
                        }
                        @if (orthoMode() && !row.upper) {
                          <ng-container *ngTemplateOutlet="badgesTpl; context: { $implicit: tooth }" />
                        }
                        <svg
                          class="odg-svg"
                          [attr.viewBox]="shape(tooth).viewBox"
                          [style.width.px]="shape(tooth).width * (row.small ? 0.8 : 1.18)"
                          [style.height.px]="row.small ? 80 : 118"
                          (click)="onToothClick(tooth, $event)"
                          [attr.aria-label]="'Diente ' + tooth"
                        >
                          <title>{{ tooth }} · {{ toothName(tooth) }}{{ summary(tooth) ? ' — ' + summary(tooth) : '' }}</title>
                          <g [attr.transform]="row.upper ? null : 'translate(0,100) scale(1,-1)'">
                            <g [attr.opacity]="has(tooth, 'AUSENTE') ? 0.75 : 1">
                              @if (has(tooth, 'IMPLANTE')) {
                                <rect x="20" y="10" width="10" height="46" rx="3" fill="#a3b1c2" stroke="#475569" />
                                @for (y of screwLines; track y) {
                                  <line x1="18" [attr.y1]="y" x2="32" [attr.y2]="y + 3" stroke="#475569" stroke-width="1.2" />
                                }
                              } @else {
                                @for (r of shape(tooth).roots; track $index) {
                                  <path [attr.d]="r" fill="url(#odg-root)" stroke="#b9a07a" stroke-width="0.8" />
                                }
                              }
                              <path
                                class="odg-crown"
                                [attr.d]="shape(tooth).crown"
                                [attr.fill]="crownFill(tooth)"
                                [attr.stroke]="crownStroke(tooth)"
                                [attr.stroke-width]="crownStroke(tooth) === '#b9a07a' ? 0.9 : 2.4"
                              />
                              <path [attr.d]="shape(tooth).crown" fill="none" class="odg-shine" />
                              @if (shape(tooth).detail) {
                                <path [attr.d]="shape(tooth).detail" fill="none" stroke="#d6c7a6" stroke-width="0.9" />
                              }
                              @if (has(tooth, 'ENDODONCIA')) {
                                @for (c of shape(tooth).canals; track $index) {
                                  <path [attr.d]="c" stroke="#f5b301" stroke-width="3.2" stroke-linecap="round" />
                                }
                              }
                              @for (dot of surfaceDots(tooth); track dot.surface) {
                                @if (dot.state === 'FRACTURA') {
                                  <path [attr.d]="'M' + (dot.x - 6) + ' ' + (dot.y - 3) + ' l4 5 l4 -5 l4 5'" fill="none" stroke="#f97316" stroke-width="2" />
                                } @else {
                                  <circle [attr.cx]="dot.x" [attr.cy]="dot.y" r="4.6" [attr.fill]="color(dot.state)" stroke="#fff" stroke-width="1" />
                                }
                              }
                              @if (hasMark(tooth, 'BANDA')) {
                                <rect [attr.x]="shape(tooth).crownLeft + 1" y="70" [attr.width]="shape(tooth).crownRight - shape(tooth).crownLeft - 2" height="11" rx="2" fill="rgba(29,78,216,0.18)" stroke="#1d4ed8" stroke-width="1.6" />
                              }
                              @if (hasAppliance('ALINEADOR') && !has(tooth, 'AUSENTE')) {
                                <path [attr.d]="shape(tooth).crown" fill="rgba(56,189,248,0.18)" stroke="#0ea5e9" stroke-width="1.6" transform="translate(25 77) scale(1.1) translate(-25 -77)" />
                              }
                              @if (archActive(row.upper) && !has(tooth, 'AUSENTE')) {
                                <line [attr.x1]="shape(tooth).crownLeft - 8" y1="74" [attr.x2]="shape(tooth).crownRight + 8" y2="74" stroke="#10306b" stroke-width="2" />
                                <circle cx="25" cy="74" r="3" fill="#10306b" />
                              }
                              @if (hasMark(tooth, 'CADENA')) {
                                @for (x of chainXs(tooth); track x) {
                                  <circle [attr.cx]="x" cy="74" r="2.6" fill="none" stroke="#7c3aed" stroke-width="1.8" />
                                }
                              }
                              @if (hasMark(tooth, 'RESORTE')) {
                                <path [attr.d]="springPath(tooth)" fill="none" stroke="#0891b2" stroke-width="1.7" stroke-linejoin="round" />
                              }
                              @if (hasMark(tooth, 'TUBO')) {
                                <rect x="16" y="68.5" width="18" height="11" rx="2" fill="#475569" />
                                <rect x="30.5" y="71" width="6" height="6" rx="1.2" fill="#fff" stroke="#475569" stroke-width="1.4" />
                              }
                              @if (hasMark(tooth, 'BRACKET')) {
                                <rect x="18.5" y="69" width="13" height="10" rx="2" [attr.fill]="bracketStyle().fill" [attr.stroke]="bracketStyle().stroke" stroke-width="0.8" />
                                <line x1="18.5" y1="74" x2="31.5" y2="74" [attr.stroke]="bracketStyle().slot" stroke-width="1.4" />
                                @if (bracketStyle().clip) {
                                  <rect x="21" y="71" width="8" height="6" rx="1" fill="none" stroke="#e2e8f0" stroke-width="1" />
                                }
                              }
                              @if (hasMark(tooth, 'LIGADURA_METALICA')) {
                                <rect x="15.5" y="65.5" width="19" height="17" rx="3.5" fill="none" stroke="#6b7280" stroke-width="1.8" />
                                <path d="M32 66.5 L37 61" stroke="#6b7280" stroke-width="1.8" stroke-linecap="round" />
                              }
                              @if (hasMark(tooth, 'LIGADURA_ELASTICA')) {
                                <rect x="17" y="67" width="16" height="14" rx="3" fill="none" stroke="#ec4899" stroke-width="2.4" />
                              }
                              @if (hasMark(tooth, 'GANCHO')) {
                                <path [attr.d]="hookPath(tooth)" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round" />
                              }
                              @if (hasMark(tooth, 'BOTON')) {
                                <rect x="22.5" y="83" width="5" height="9" rx="1.5" fill="#0f172a" stroke="#fff" stroke-width="0.8" />
                              }
                              @if (hasMark(tooth, 'TAD')) {
                                <g [attr.transform]="'translate(' + mesialX(tooth) + ' 0)'">
                                  <rect x="-3.5" y="49" width="7" height="4" rx="1" fill="#0f766e" />
                                  <path d="M0 49 L0 28 M-2.8 45 L2.8 43 M-2.8 40 L2.8 38 M-2.8 35 L2.8 33" fill="none" stroke="#0f766e" stroke-width="1.8" stroke-linecap="round" />
                                </g>
                              }
                              @if (hasMark(tooth, 'SEPARADOR')) {
                                <circle [attr.cx]="mesialX(tooth)" cy="64" r="4.5" fill="none" stroke="#7c3aed" stroke-width="2" />
                              }
                              @if (hasMark(tooth, 'LESION')) {
                                <path d="M14 58 Q14 35 25 31 Q36 35 36 58" fill="rgba(225,29,72,0.2)" stroke="#e11d48" stroke-width="2.4" stroke-linejoin="round" />
                              }
                              @if (hasMark(tooth, 'FISTULA')) {
                                <path d="M30 24 L38 18" stroke="#db2777" stroke-width="2.2" stroke-linecap="round" />
                                <circle cx="25" cy="26" r="5.5" fill="#fbcfe8" stroke="#db2777" stroke-width="2.2" />
                                <circle cx="25" cy="26" r="1.8" fill="#db2777" />
                              }
                              @if (hasMark(tooth, 'MOVILIDAD')) {
                                <path d="M14 63 H36 M14 63 l4.5 -3.5 M14 63 l4.5 3.5 M36 63 l-4.5 -3.5 M36 63 l-4.5 3.5" fill="none" stroke="#0b3a6e" stroke-width="2.6" stroke-linecap="round" />
                              }
                              @if (hasMark(tooth, 'TRAUMA')) {
                                <path d="M28 64 L19 79 H25 L22 93 L32 75 H26 Z" fill="#1e3a8a" stroke="#fff" stroke-width="1" stroke-linejoin="round" />
                              }
                              @if (hasMark(tooth, 'OTRO')) {
                                <path d="M25 3 L27.3 8.2 L33 8.8 L28.7 12.6 L30 18.2 L25 15.3 L20 18.2 L21.3 12.6 L17 8.8 L22.7 8.2 Z" fill="#0f172a" stroke="#fff" stroke-width="0.8" />
                              }
                            </g>
                            @if (has(tooth, 'TEMPORAL')) {
                              <path [attr.d]="shape(tooth).crown" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="4 3" />
                            }
                            @if (has(tooth, 'INCLUIDO')) {
                              @if (orthoMode()) {
                                <circle cx="25" cy="80" r="10" fill="rgba(255,255,255,0.4)" stroke="#1d4ed8" stroke-width="2.2" />
                              } @else {
                                <path d="M25 60 L39 88 L11 88 Z" fill="rgba(255,255,255,0.4)" stroke="#475569" stroke-width="2" stroke-linejoin="round" />
                              }
                            }
                            @if (has(tooth, 'ERUPCION')) {
                              <path d="M25 60 L39 88 L11 88 Z" fill="rgba(255,255,255,0.4)" stroke="#1d4ed8" stroke-width="2.2" stroke-linejoin="round" />
                            }
                            @if (has(tooth, 'SUPERNUMERARIO')) {
                              <circle cx="25" cy="80" r="10" fill="rgba(255,255,255,0.4)" stroke="#0f766e" stroke-width="2.2" />
                              <path d="M15 80 H35" stroke="#0f766e" stroke-width="2.2" />
                            }
                            @if (has(tooth, 'AUSENTE')) {
                              <circle cx="25" cy="80" r="10" fill="rgba(148,163,184,0.45)" stroke="#6b7280" stroke-width="1.6" />
                              <path d="M20 75 L30 85 M30 75 L20 85" stroke="#4b5563" stroke-width="2.2" stroke-linecap="round" />
                            }
                            @if (has(tooth, 'EXTRACCION_INDICADA')) {
                              <circle cx="25" cy="80" r="10" fill="rgba(220,38,38,0.12)" stroke="#dc2626" stroke-width="1.6" />
                              <path d="M20 75 L30 85 M30 75 L20 85" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" />
                            }
                          </g>
                          @for (m of movementMarks(tooth); track m; let i = $index; let n = $count) {
                            <g [attr.transform]="moveTransform(row.upper, i, n)">
                              @switch (m) {
                                @case ('PROTRUSION') {
                                  <path d="M12 28 V4 M5 11 L12 3 L19 11" fill="none" stroke="#dc2626" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
                                }
                                @case ('RETRUSION') {
                                  <path d="M12 2 V26 M5 19 L12 27 L19 19" fill="none" stroke="#dc2626" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
                                }
                                @case ('EXPANSION') {
                                  <path d="M23 15 H2 M9 8 L1.5 15 L9 22" fill="none" stroke="#2563eb" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
                                }
                                @case ('CONTRACCION') {
                                  <path d="M1 15 H22 M15 8 L22.5 15 L15 22" fill="none" stroke="#2563eb" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
                                }
                                @case ('ROTACION') {
                                  <path d="M19 9 A9 9 0 1 0 21 17 M20.5 3.5 L19.2 9.4 L13.4 8.2" fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                                }
                                @case ('INTRUSION') {
                                  <path d="M12 3 V27 M5 3 H19 M5 27 H19" fill="none" stroke="#dc2626" stroke-width="3.2" stroke-linecap="round" />
                                }
                                @case ('EXTRUSION') {
                                  <path d="M12 3 V27 M5 3 H19 M5 27 H19" fill="none" stroke="#16a34a" stroke-width="3.2" stroke-linecap="round" />
                                }
                              }
                            </g>
                          }
                        </svg>
                        @if (orthoMode() && row.upper) {
                          <ng-container *ngTemplateOutlet="badgesTpl; context: { $implicit: tooth }" />
                        }
                        @if (!row.upper) {
                          @if (showSurfaces()) {
                            <ng-container *ngTemplateOutlet="squareTpl; context: { $implicit: tooth, small: row.small }" />
                          }
                          <button type="button" class="odg-num" [class.on]="selected() === tooth" [class.marked]="!!record(tooth)" (click)="onToothClick(tooth, $event)">{{ tooth }}</button>
                        }
                      </div>
                    }
                  </div>
                  @if (showOcclusalBetween() && isLastUpper($index)) {
                    <ng-container *ngTemplateOutlet="occlusal" />
                  }
                }
              }
              @if (view() === 'OCLUSAL') {
                <ng-container *ngTemplateOutlet="occlusal" />
              }
            </div>

            <ng-template #squareTpl let-tooth let-small="small">
              <svg class="odg-square" [class.small]="small" viewBox="-2 -2 40 40" [attr.aria-label]="'Superficies ' + tooth">
                @for (pos of positions; track pos) {
                  <polygon
                    [attr.points]="square(pos)"
                    [attr.fill]="surfaceFill(tooth, pos)"
                    stroke="#9fb3c8"
                    stroke-width="1.1"
                    stroke-linejoin="round"
                    (click)="onSurfaceClick(tooth, pos, $event)"
                  >
                    <title>{{ tooth }} · {{ surfaceTitle(tooth, pos) }}</title>
                  </polygon>
                }
              </svg>
            </ng-template>

            <ng-template #badgesTpl let-tooth>
              <div class="odg-badges" (click)="onToothClick(tooth, $event)">
                @for (b of occlusionMarks(tooth); track b.key) {
                  <span class="odg-ico" [title]="b.label"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: b }" /></span>
                }
              </div>
            </ng-template>

            <ng-template #occlusal>
              <div class="odg-occlusal" [class.large]="view() === 'OCLUSAL'">
                @for (arch of occlusalArches(); track arch.label; let last = $last) {
                  @if (!last || occlusalArches().length === 1) {
                    <span class="odg-arch-label">{{ arch.label }}</span>
                  }
                  <div class="odg-arch">
                    <svg viewBox="0 0 240 150" [attr.aria-label]="arch.label">
                      @for (t of arch.teeth; track t.tooth) {
                        <g class="odg-occ-tooth" (click)="onToothClick(t.tooth, $event)">
                          <ellipse
                            [attr.cx]="t.x"
                            [attr.cy]="t.y"
                            [attr.rx]="t.r * 0.8"
                            [attr.ry]="t.r"
                            [attr.transform]="'rotate(' + t.a + ' ' + t.x + ' ' + t.y + ')'"
                            [attr.fill]="occlusalFill(t.tooth)"
                            [attr.stroke]="selected() === t.tooth ? '#16a34a' : '#64748b'"
                            [attr.stroke-width]="selected() === t.tooth ? 2.4 : 1.1"
                          >
                            <title>{{ t.tooth }} · {{ toothName(t.tooth) }}{{ summary(t.tooth) ? ' — ' + summary(t.tooth) : '' }}</title>
                          </ellipse>
                          <ellipse
                            [attr.cx]="t.x"
                            [attr.cy]="t.y"
                            [attr.rx]="t.r * 0.36"
                            [attr.ry]="t.r * 0.46"
                            [attr.transform]="'rotate(' + t.a + ' ' + t.x + ' ' + t.y + ')'"
                            fill="none"
                            stroke="#b8c4d3"
                            stroke-width="0.8"
                            pointer-events="none"
                          />
                          @if (has(t.tooth, 'AUSENTE') || has(t.tooth, 'EXTRACCION_INDICADA')) {
                            <path
                              [attr.d]="'M' + (t.x - t.r * 0.55) + ' ' + (t.y - t.r * 0.55) + ' L' + (t.x + t.r * 0.55) + ' ' + (t.y + t.r * 0.55) + ' M' + (t.x + t.r * 0.55) + ' ' + (t.y - t.r * 0.55) + ' L' + (t.x - t.r * 0.55) + ' ' + (t.y + t.r * 0.55)"
                              [attr.stroke]="has(t.tooth, 'AUSENTE') ? '#374151' : '#fff'"
                              stroke-width="1.6"
                              pointer-events="none"
                            />
                          }
                          @if (view() === 'OCLUSAL') {
                            <text [attr.x]="t.x" [attr.y]="t.labelY" text-anchor="middle" class="odg-occ-num">{{ t.tooth }}</text>
                          }
                        </g>
                      }
                      @if (arch.upper && hasAppliance('EXPANSOR') && arch.geo.expander; as ex) {
                        <path [attr.d]="ex.arms" fill="none" stroke="#334155" stroke-width="2.2" stroke-linecap="round" />
                        <rect [attr.x]="ex.x - 14" [attr.y]="ex.y - 10" width="28" height="20" rx="4" fill="#e2e8f0" stroke="#334155" stroke-width="1.6" />
                        <circle [attr.cx]="ex.x" [attr.cy]="ex.y" r="3.5" fill="#fff" stroke="#334155" stroke-width="1.4" />
                        <path [attr.d]="'M' + (ex.x - 2) + ' ' + ex.y + ' H' + (ex.x + 2)" stroke="#334155" stroke-width="1.2" />
                      }
                      @if (!arch.upper && hasAppliance('ARCO_LINGUAL') && arch.geo.lingual) {
                        <path [attr.d]="arch.geo.lingual" fill="none" stroke="#334155" stroke-width="2.2" stroke-linecap="round" />
                      }
                      @if (hasAppliance('RETENEDOR') && arch.geo.retainer) {
                        <path [attr.d]="arch.geo.retainer" fill="none" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round" />
                      }
                    </svg>
                  </div>
                  @if (last && occlusalArches().length > 1) {
                    <span class="odg-arch-label">{{ arch.label }}</span>
                  }
                }
              </div>
            </ng-template>

            @if (selected(); as tooth) {
              @if (popoverOpen()) {
                <div class="odg-pop-backdrop" (click)="closePopover()"></div>
                <div class="odg-pop" [style.left.px]="popLeft()" [style.top.px]="popTop()" role="dialog" aria-modal="true">
                  <div class="odg-pop-head">
                    <span class="odg-pop-num">{{ tooth }}</span>
                    <div>
                      <strong>Diente {{ tooth }}</strong>
                      <span>{{ toothName(tooth) }}</span>
                    </div>
                    <button type="button" class="odg-x" (click)="closePopover()" aria-label="Cerrar">×</button>
                  </div>
                  <p class="odg-pop-sum">{{ summary(tooth) || 'Sano, sin hallazgos' }}</p>
                  @if (!disabled()) {
                    <div class="odg-quick">
                      @for (q of quickActions(); track q.key) {
                        <button type="button" class="odg-quick-btn" [class.on]="quickActive(tooth, q.key)" (click)="quick(tooth, q.key)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="q.icon" /></svg>
                          {{ q.label }}
                        </button>
                      }
                    </div>
                    @if (orthoMode()) {
                      @for (sec of orthoPopTop; track sec.title) {
                        <ng-container *ngTemplateOutlet="popSecTpl; context: { $implicit: sec, tooth: tooth }" />
                      }
                    } @else {
                    <p class="odg-pop-title">Estado del diente</p>
                    <div class="odg-chips">
                      <button type="button" class="odg-chip" [class.on]="!record(tooth)" (click)="setHealthy(tooth)">
                        <span class="dot" style="background:#fff"></span>Sano
                      </button>
                      @for (t of conditionTools; track t.key) {
                        <button type="button" class="odg-chip" [class.on]="has(tooth, $any(t.key))" (click)="toggleCondition(tooth, $any(t.key))">
                          <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor(t) }" /></span>{{ t.label }}
                        </button>
                      }
                    </div>
                    }
                    <p class="odg-pop-title">Superficies <span>elija el hallazgo y toque la superficie</span></p>
                    <div class="odg-pop-surfaces">
                      <div class="odg-chips">
                        @for (t of surfaceTools; track t.key) {
                          <button type="button" class="odg-chip" [class.on]="popSurfaceTool() === t.key" (click)="popSurfaceTool.set($any(t.key))">
                            <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor(t) }" /></span>{{ t.label }}
                          </button>
                        }
                      </div>
                      <svg class="odg-square big" viewBox="-2 -2 40 40">
                        @for (pos of positions; track pos) {
                          <polygon
                            [attr.points]="square(pos)"
                            [attr.fill]="surfaceFill(tooth, pos)"
                            stroke="#475569"
                            stroke-width="0.8"
                            (click)="toggleSurface(tooth, pos, popSurfaceTool())"
                          >
                            <title>{{ surfaceTitle(tooth, pos) }}</title>
                          </polygon>
                        }
                        <text x="18" y="7.5" class="sq-l">{{ surfaceLetter(tooth, 'top') }}</text>
                        <text x="18" y="33.5" class="sq-l">{{ surfaceLetter(tooth, 'bottom') }}</text>
                        <text x="5" y="20.5" class="sq-l">{{ surfaceLetter(tooth, 'left') }}</text>
                        <text x="31" y="20.5" class="sq-l">{{ surfaceLetter(tooth, 'right') }}</text>
                        <text x="18" y="20.5" class="sq-l">{{ surfaceLetter(tooth, 'center') }}</text>
                      </svg>
                    </div>
                    @if (orthoMode()) {
                      @for (sec of orthoPopBottom; track sec.title) {
                        <ng-container *ngTemplateOutlet="popSecTpl; context: { $implicit: sec, tooth: tooth }" />
                      }
                    } @else {
                    <p class="odg-pop-title">Marcas y aparatología</p>
                    <div class="odg-chips">
                      @for (t of markTools(); track t.key) {
                        <button type="button" class="odg-chip" [class.on]="hasMark(tooth, $any(t.key))" (click)="toggleMark(tooth, $any(t.key))">
                          <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor(t) }" /></span>{{ t.label }}
                        </button>
                      }
                      @if (showOrthoMarks()) {
                        <button
                          type="button"
                          class="odg-chip"
                          [class.on]="archActive(isUpperTooth(tooth))"
                          [title]="'Aplica a toda la arcada ' + (isUpperTooth(tooth) ? 'superior' : 'inferior')"
                          (click)="toggleArch(isUpperTooth(tooth) ? 'upper' : 'lower', !archActive(isUpperTooth(tooth)))"
                        >
                          <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor({ label: 'Arco ortodóntico', color: '#10306b' }) }" /></span>Arco ortodóntico ({{ isUpperTooth(tooth) ? 'sup.' : 'inf.' }})
                        </button>
                      }
                    </div>
                    }
                  }
                  <ng-template #popSecTpl let-sec let-tooth="tooth">
                    <p class="odg-pop-title">{{ sec.title }}</p>
                    <div class="odg-chips">
                      @if (sec.healthy) {
                        <button type="button" class="odg-chip" [class.on]="!record(tooth)" (click)="setHealthy(tooth)">
                          <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor({ key: 'PRESENTE', label: 'Sano', color: '#94a3b8' }) }" /></span>Sano
                        </button>
                      }
                      @for (t of sec.tools; track t.key) {
                        <button type="button" class="odg-chip" [class.on]="toolOn(tooth, t)" (click)="toggleTool(tooth, t)">
                          <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor(t) }" /></span>{{ t.label }}
                        </button>
                      }
                      @if (sec.arch) {
                        <button
                          type="button"
                          class="odg-chip"
                          [class.on]="archActive(isUpperTooth(tooth))"
                          [title]="'Aplica a toda la arcada ' + (isUpperTooth(tooth) ? 'superior' : 'inferior')"
                          (click)="toggleArch(isUpperTooth(tooth) ? 'upper' : 'lower', !archActive(isUpperTooth(tooth)))"
                        >
                          <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor({ key: 'ARCO', label: 'Arco ortodóntico', color: '#10306b' }) }" /></span>Arco ortodóntico ({{ isUpperTooth(tooth) ? 'sup.' : 'inf.' }})
                        </button>
                      }
                    </div>
                  </ng-template>
                  <label class="odg-note">
                    Nota del diente
                    <input
                      [ngModel]="record(tooth)?.note || ''"
                      (ngModelChange)="setNote(tooth, $event)"
                      [readonly]="disabled()"
                      placeholder="Ej. sensibilidad al frío, fractura de cúspide…"
                    />
                  </label>
                  @if (!disabled()) {
                    <div class="odg-pop-actions">
                      <button type="button" class="odg-link danger" (click)="clearTooth(tooth)">Borrar hallazgos del diente</button>
                      <button type="button" class="odg-btn" (click)="closePopover()">Listo</button>
                    </div>
                  }
                </div>
              }
            }
          </div>

          <div class="odg-cards" [class.ortho]="orthoMode()">
            @if (orthoMode()) {
              <section class="odg-card" [class.odg-empty]="!data().orthoChart.planPhases.length">
                <h4><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 H16 V6 H8 Z M6 5 H4 V21 H20 V5 H18 M8 11 L10 13 L14 9 M8 17 H16" /></svg>Plan de tratamiento</h4>
                <div class="odg-checks">
                  @for (p of planPhases; track p.key) {
                    <label class="odg-check">
                      <input type="checkbox" [checked]="data().orthoChart.planPhases.includes(p.key)" [disabled]="disabled()" (change)="togglePlanPhase(p.key)" />
                      {{ p.label }}
                    </label>
                  }
                </div>
              </section>
              <section class="odg-card" [class.odg-empty]="!data().orthoChart.bracketType && !data().orthoChart.appliances.length">
                <h4><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12 H21 M6 9 H10 V15 H6 Z M14 9 H18 V15 H14 Z" /></svg>Tipo de aparato</h4>
                <div class="odg-apps">
                  @for (b of bracketTypes; track b.key) {
                    <button type="button" class="odg-chip" [class.on]="data().orthoChart.bracketType === b.key" [disabled]="disabled()" (click)="setBracketType(b.key)">
                      <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor({ key: 'BT_' + b.key, label: b.label, color: '#94a3b8' }) }" /></span>{{ b.label }}
                    </button>
                  }
                  @for (a of appliances; track a.key) {
                    <button type="button" class="odg-chip" [class.on]="hasAppliance(a.key)" [disabled]="disabled()" (click)="toggleAppliance(a.key)">
                      <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor({ key: 'AP_' + a.key, label: a.label, color: '#334155' }) }" /></span>{{ a.label }}
                    </button>
                  }
                </div>
              </section>
            }
            <section class="odg-card" [class.odg-empty]="!data().odontogramNotes?.trim()">
              <h4><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3 H15 L19 7 V21 H5 Z M8 10 H16 M8 14 H16 M8 18 H13" /></svg>Notas</h4>
              <textarea
                class="odg-card-body"
                rows="3"
                [ngModel]="data().odontogramNotes"
                (ngModelChange)="setOdontogramNotes($event)"
                [readonly]="disabled()"
                placeholder="Observaciones generales del odontograma…"
              ></textarea>
            </section>
          </div>
          @if (orthoMode()) {
            <section class="odg-card odg-legend-wide">
              <h4>Convenciones</h4>
              <div class="odg-legend-groups">
                @for (g of orthoLegend; track g.title) {
                  <div class="odg-legend-group">
                    <h5>{{ g.title }}</h5>
                    <ul class="odg-legend one">
                      @for (item of g.items; track item.key) {
                        <li>
                          <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor(item) }" /></span>
                          {{ item.label }}
                        </li>
                      }
                    </ul>
                  </div>
                }
              </div>
            </section>
          }
        </div>

        <aside class="odg-side">
          @if (!orthoMode()) {
            <section class="odg-side-legend">
              <h4>Convenciones</h4>
              <ul class="odg-legend">
                @for (item of legend(); track item.label) {
                  <li>
                    <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: item }" /></span>
                    {{ item.label }}
                  </li>
                }
              </ul>
            </section>
          }
            <ng-template #legendIco let-item>
                    @switch (item.icon) {
                      @case ('dot') {
                        <span class="lg-dot" [style.background]="item.color" [style.box-shadow]="'0 0 0 3px ' + item.color + '33'"></span>
                      }
                      @case ('x') {
                        <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" [attr.fill]="item.color + '33'" [attr.stroke]="item.color" stroke-width="1.4" /><path d="M6.5 6.5 L13.5 13.5 M13.5 6.5 L6.5 13.5" [attr.stroke]="item.color" stroke-width="1.8" stroke-linecap="round" /></svg>
                      }
                      @case ('triangle') {
                        <svg viewBox="0 0 20 20"><path d="M10 3 L18 17 H2 Z" fill="none" [attr.stroke]="item.color" stroke-width="1.6" stroke-linejoin="round" /></svg>
                      }
                      @case ('bracket') {
                        <svg viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" rx="2.5" [attr.fill]="item.color" /><path d="M3 10 H17" stroke="#dbeafe" stroke-width="1.6" /></svg>
                      }
                      @case ('band') {
                        <svg viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" rx="2" fill="none" [attr.stroke]="item.color" stroke-width="2.2" /><path d="M7 10 H13" [attr.stroke]="item.color" stroke-width="2" /></svg>
                      }
                      @case ('wire') {
                        <svg viewBox="0 0 20 20"><path d="M1 10 H19" [attr.stroke]="item.color" stroke-width="2" /><circle cx="5" cy="10" r="2" [attr.fill]="item.color" /><circle cx="15" cy="10" r="2" [attr.fill]="item.color" /></svg>
                      }
                      @case ('ring') {
                        <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" fill="none" [attr.stroke]="item.color" stroke-width="2.2" /></svg>
                      }
                      @case ('pocket') {
                        <svg viewBox="0 0 20 20"><path d="M3 18 Q3 5 10 3 Q17 5 17 18" [attr.fill]="item.color + '33'" [attr.stroke]="item.color" stroke-width="2" stroke-linejoin="round" /></svg>
                      }
                      @case ('arrows') {
                        <svg viewBox="0 0 20 20"><path d="M2 10 H18 M2 10 l4 -3.5 M2 10 l4 3.5 M18 10 l-4 -3.5 M18 10 l-4 3.5" fill="none" [attr.stroke]="item.color" stroke-width="2.2" stroke-linecap="round" /></svg>
                      }
                      @case ('fistula') {
                        <svg viewBox="0 0 20 20"><path d="M13 8 L18 4" [attr.stroke]="item.color" stroke-width="2" stroke-linecap="round" /><circle cx="9" cy="11" r="5.5" fill="#fbcfe8" [attr.stroke]="item.color" stroke-width="2" /><circle cx="9" cy="11" r="1.8" [attr.fill]="item.color" /></svg>
                      }
                      @case ('bolt') {
                        <svg viewBox="0 0 20 20"><path d="M11.5 1.5 L4.5 11 H9.5 L8 18.5 L15.5 8.5 H10.5 Z" [attr.fill]="item.color" /></svg>
                      }
                      @case ('star') {
                        <svg viewBox="0 0 20 20"><path d="M10 1.8 L12.4 7 L18 7.6 L13.8 11.4 L15 17 L10 14.1 L5 17 L6.2 11.4 L2 7.6 L7.6 7 Z" [attr.fill]="item.color" /></svg>
                      }
                      @case ('tooth') {
                        <svg viewBox="0 0 20 20"><path [attr.d]="toothIcon" fill="#fff" [attr.stroke]="item.color" stroke-width="1.4" stroke-linejoin="round" /></svg>
                      }
                      @case ('temporal') {
                        <svg viewBox="0 0 20 20"><path [attr.d]="toothIcon" fill="none" [attr.stroke]="item.color" stroke-width="1.5" stroke-dasharray="2.2 1.6" transform="translate(10 10) scale(0.85) translate(-10 -10)" /></svg>
                      }
                      @case ('circle') {
                        <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" fill="none" [attr.stroke]="item.color" stroke-width="2" /></svg>
                      }
                      @case ('super') {
                        <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" fill="none" [attr.stroke]="item.color" stroke-width="1.8" /><path d="M3.5 10 H16.5" [attr.stroke]="item.color" stroke-width="1.8" /></svg>
                      }
                      @case ('lig-e') {
                        <svg viewBox="0 0 20 20"><rect x="6" y="7" width="8" height="6" rx="1.2" fill="#94a3b8" /><rect x="3.5" y="4.5" width="13" height="11" rx="2.5" fill="none" [attr.stroke]="item.color" stroke-width="2.2" /></svg>
                      }
                      @case ('lig-m') {
                        <svg viewBox="0 0 20 20"><rect x="2" y="7.5" width="16" height="5" rx="2" [attr.fill]="item.color" /><path d="M6 7.5 L8 12.5 M10 7.5 L12 12.5 M14 7.5 L16 12.5" stroke="#e5e7eb" stroke-width="1" /></svg>
                      }
                      @case ('hook') {
                        <svg viewBox="0 0 20 20"><path d="M8 18 V8 Q8 3 12.5 3 Q16 3 16 6.5" fill="none" [attr.stroke]="item.color" stroke-width="2.2" stroke-linecap="round" /></svg>
                      }
                      @case ('chain') {
                        <svg viewBox="0 0 20 20">@for (x of [3, 7.7, 12.3, 17]; track x) {<circle [attr.cx]="x" cy="10" r="2.3" fill="none" [attr.stroke]="item.color" stroke-width="1.7" />}</svg>
                      }
                      @case ('spring') {
                        <svg viewBox="0 0 20 20"><path d="M1 10 L3 6 L5 14 L7 6 L9 14 L11 6 L13 14 L15 6 L17 14 L19 10" fill="none" [attr.stroke]="item.color" stroke-width="1.6" stroke-linejoin="round" /></svg>
                      }
                      @case ('button') {
                        <svg viewBox="0 0 20 20"><rect x="7.5" y="3" width="5" height="14" rx="1.5" [attr.fill]="item.color" /></svg>
                      }
                      @case ('tube') {
                        <svg viewBox="0 0 20 20"><rect x="2" y="6.5" width="12" height="7" rx="1.5" [attr.fill]="item.color" /><rect x="12.5" y="7.5" width="5.5" height="5" rx="1" fill="#fff" [attr.stroke]="item.color" stroke-width="1.6" /></svg>
                      }
                      @case ('tad') {
                        <svg viewBox="0 0 20 20"><rect x="6" y="2" width="8" height="3.5" rx="1" [attr.fill]="item.color" /><path d="M10 5.5 V18 M7.5 8 L12.5 9.5 M7.5 11 L12.5 12.5 M7.5 14 L12.5 15.5" fill="none" [attr.stroke]="item.color" stroke-width="1.6" stroke-linecap="round" /></svg>
                      }
                      @case ('arrow-up') {
                        <svg viewBox="0 0 20 20"><path d="M10 18 V3 M4.5 8.5 L10 3 L15.5 8.5" fill="none" [attr.stroke]="item.color" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      }
                      @case ('arrow-down') {
                        <svg viewBox="0 0 20 20"><path d="M10 2 V17 M4.5 11.5 L10 17 L15.5 11.5" fill="none" [attr.stroke]="item.color" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      }
                      @case ('arrow-left') {
                        <svg viewBox="0 0 20 20"><path d="M18 10 H3 M8.5 4.5 L3 10 L8.5 15.5" fill="none" [attr.stroke]="item.color" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      }
                      @case ('arrow-right') {
                        <svg viewBox="0 0 20 20"><path d="M2 10 H17 M11.5 4.5 L17 10 L11.5 15.5" fill="none" [attr.stroke]="item.color" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      }
                      @case ('rotate') {
                        <svg viewBox="0 0 20 20"><path d="M15.5 6 A6.5 6.5 0 1 0 16.8 11.5 M16.3 1.8 L15.6 6.3 L11.2 5.6" fill="none" [attr.stroke]="item.color" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      }
                      @case ('ibeam') {
                        <svg viewBox="0 0 20 20"><path d="M10 3 V17 M6 3 H14 M6 17 H14" fill="none" [attr.stroke]="item.color" stroke-width="2.6" stroke-linecap="round" /></svg>
                      }
                      @case ('midline') {
                        <svg viewBox="0 0 20 20"><path d="M10 1 V19" [attr.stroke]="item.color" stroke-width="2" stroke-dasharray="3 2" /></svg>
                      }
                      @case ('crossbite') {
                        <svg viewBox="0 0 20 20"><path d="M2 6 Q10 15 18 6 M2 14 Q10 5 18 14" fill="none" [attr.stroke]="item.color" stroke-width="1.9" stroke-linecap="round" /></svg>
                      }
                      @case ('openbite') {
                        <svg viewBox="0 0 20 20"><path d="M2 4 Q10 9 18 4 M2 16 Q10 11 18 16" fill="none" [attr.stroke]="item.color" stroke-width="1.9" stroke-linecap="round" /><path d="M10 8.5 V11.5" [attr.stroke]="item.color" stroke-width="1.4" stroke-dasharray="1.2 1" /></svg>
                      }
                      @case ('overbite') {
                        <svg viewBox="0 0 20 20"><rect x="5.5" y="8" width="9" height="10" rx="2.5" fill="#fff" [attr.stroke]="item.color" stroke-width="1.5" /><rect x="4.5" y="2" width="11" height="11" rx="2.5" [attr.fill]="item.color + '40'" [attr.stroke]="item.color" stroke-width="1.8" /></svg>
                      }
                      @case ('midshift') {
                        <svg viewBox="0 0 20 20"><path d="M7 2 V18" stroke="#94a3b8" stroke-width="1.6" /><path d="M13 2 V18" [attr.stroke]="item.color" stroke-width="1.8" stroke-dasharray="2.5 1.8" /><path d="M8 10 H12 M10.3 8.3 L12 10 L10.3 11.7" fill="none" [attr.stroke]="item.color" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      }
                      @case ('crowding') {
                        <svg viewBox="0 0 20 20"><rect x="2.5" y="4.5" width="7.5" height="11" rx="3" fill="#fff" [attr.stroke]="item.color" stroke-width="1.6" transform="rotate(-14 6.2 10)" /><rect x="9.5" y="4.5" width="7.5" height="11" rx="3" fill="#fff" [attr.stroke]="item.color" stroke-width="1.6" transform="rotate(14 13.2 10)" /></svg>
                      }
                      @case ('diastema') {
                        <svg viewBox="0 0 20 20"><rect x="1" y="4" width="6" height="12" rx="2.5" fill="#fff" [attr.stroke]="item.color" stroke-width="1.6" /><rect x="13" y="4" width="6" height="12" rx="2.5" fill="#fff" [attr.stroke]="item.color" stroke-width="1.6" /><path d="M8.5 10 H11.5" [attr.stroke]="item.color" stroke-width="1.6" stroke-linecap="round" /></svg>
                      }
                      @case ('nospace') {
                        <svg viewBox="0 0 20 20"><path d="M1 10 H7.5 M5 7.5 L7.5 10 L5 12.5 M19 10 H12.5 M15 7.5 L12.5 10 L15 12.5 M10 4 V16" fill="none" [attr.stroke]="item.color" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      }
                      @case ('space') {
                        <svg viewBox="0 0 20 20"><path d="M3 10 H17" [attr.stroke]="item.color" stroke-width="1.8" stroke-dasharray="2.4 1.8" /><path d="M3 5 V15 M17 5 V15" [attr.stroke]="item.color" stroke-width="1.8" stroke-linecap="round" /></svg>
                      }
                      @case ('bracket-ceramic') {
                        <svg viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" rx="2.5" fill="#f8fafc" [attr.stroke]="item.color" stroke-width="1.4" /><path d="M3 10 H17" [attr.stroke]="item.color" stroke-width="1.4" /></svg>
                      }
                      @case ('bracket-self') {
                        <svg viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" rx="2.5" [attr.fill]="item.color" /><rect x="6" y="7" width="8" height="6" rx="1" fill="none" stroke="#e2e8f0" stroke-width="1.2" /><path d="M3 10 H6 M14 10 H17" stroke="#e2e8f0" stroke-width="1.2" /></svg>
                      }
                      @case ('aligner') {
                        <svg viewBox="0 0 20 20"><path d="M2.5 5 Q2.5 16 10 17 Q17.5 16 17.5 5 L13.5 5 Q13.5 12.5 10 13 Q6.5 12.5 6.5 5 Z" [attr.fill]="item.color + '33'" [attr.stroke]="item.color" stroke-width="1.5" stroke-linejoin="round" /></svg>
                      }
                      @case ('expander') {
                        <svg viewBox="0 0 20 20"><path d="M1 10 H5 M15 10 H19" [attr.stroke]="item.color" stroke-width="1.8" stroke-linecap="round" /><rect x="5" y="5.5" width="10" height="9" rx="2" fill="#e2e8f0" [attr.stroke]="item.color" stroke-width="1.5" /><circle cx="10" cy="10" r="2" fill="#fff" [attr.stroke]="item.color" stroke-width="1.2" /></svg>
                      }
                      @case ('lingual') {
                        <svg viewBox="0 0 20 20"><path d="M4 4 V9 Q4 17 10 17 Q16 17 16 9 V4" fill="none" [attr.stroke]="item.color" stroke-width="1.9" /><rect x="1.8" y="1.8" width="4.4" height="4" rx="1" [attr.fill]="item.color" /><rect x="13.8" y="1.8" width="4.4" height="4" rx="1" [attr.fill]="item.color" /></svg>
                      }
                      @case ('retainer') {
                        <svg viewBox="0 0 20 20"><path d="M3 3 Q3 17 10 17 Q17 17 17 3" fill="none" [attr.stroke]="item.color" stroke-width="2" stroke-linecap="round" /><path d="M6.5 6 Q6.5 13 10 13 Q13.5 13 13.5 6" fill="none" [attr.stroke]="item.color" stroke-width="1.2" stroke-dasharray="1.8 1.4" /></svg>
                      }
                    }
            </ng-template>
          @if (!disabled()) {
            <section>
              <h4>Herramientas</h4>
              <div class="odg-tools">
                @for (m of modes; track m.key) {
                  <button type="button" class="odg-tool" [class.on]="mode() === m.key" (click)="setMode(m.key)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="m.icon" /></svg>{{ m.label }}
                  </button>
                }
              </div>
              @if (mode() === 'PAINT') {
                <div class="odg-palette">
                  @for (t of allTools(); track t.key) {
                    <button
                      type="button"
                      class="odg-swatch"
                      [class.on]="paintTool() === t.key"
                      [title]="t.label"
                      (click)="paintTool.set(t.key)"
                    >
                      <span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor(t) }" /></span>
                    </button>
                  }
                </div>
                <p class="odg-hint strong">Pintando: {{ toolLabel(paintTool()) }}</p>
              } @else {
                <p class="odg-hint">{{ modeHint() }}</p>
              }
            </section>
          }
          <section>
            <h4>Tipos de vista</h4>
            <div class="odg-tools">
              @for (v of views; track v.key) {
                <button type="button" class="odg-tool" [class.on]="view() === v.key" (click)="view.set(v.key)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="v.icon" /></svg>{{ v.label }}
                </button>
              }
            </div>
            <div class="odg-seg">
              @for (d of dentitions; track d.key) {
                <button type="button" [class.on]="dentition() === d.key" (click)="setDentition(d.label)">{{ d.label }}</button>
              }
            </div>
            <label class="odg-check">
              <input type="checkbox" [checked]="showSurfaces()" (change)="showSurfaces.set($any($event.target).checked)" />
              Mostrar cuadros de superficies
            </label>
            @if (showOrthoMarks() || data().orthoArches.upper || data().orthoArches.lower) {
              <label class="odg-check">
                <input type="checkbox" [checked]="data().orthoArches.upper" [disabled]="disabled()" (change)="toggleArch('upper', $any($event.target).checked)" />
                Arco ortodóntico superior
              </label>
              <label class="odg-check">
                <input type="checkbox" [checked]="data().orthoArches.lower" [disabled]="disabled()" (change)="toggleArch('lower', $any($event.target).checked)" />
                Arco ortodóntico inferior
              </label>
            }
          </section>
          <section>
            <h4>Acciones</h4>
            <div class="odg-actions">
              @if (!disabled()) {
                <button type="button" class="odg-action primary" (click)="onSave()">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3 H16 L21 8 V21 H3 V3 Z M7 3 V9 H15 V3 M7 21 V14 H17 V21" /></svg>
                  {{ savedFlash() ? 'Guardado ✓' : 'Guardar' }}
                </button>
              }
              <button type="button" class="odg-action" (click)="print()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8 V3 H17 V8 M6 17 H3 V9 H21 V17 H18 M7 14 H17 V21 H7 Z" /></svg>
                Imprimir
              </button>
            </div>
          </section>
        </aside>
      </div>

      <div class="odg-summary">
        <span class="odg-cop" title="Dientes cariados, obturados y perdidos (permanentes)">
          <strong>COP-D</strong> C {{ cop().c }} · O {{ cop().o }} · P {{ cop().p }} = {{ cop().c + cop().o + cop().p }}
        </span>
        @if (ceo().c + ceo().e + ceo().o > 0) {
          <span class="odg-cop" title="Dientes temporales cariados, con extracción indicada y obturados">
            <strong>ceo-d</strong> c {{ ceo().c }} · e {{ ceo().e }} · o {{ ceo().o }} = {{ ceo().c + ceo().e + ceo().o }}
          </span>
        }
        @for (c of counts(); track c.label) {
          <span class="odg-count"><span class="odg-ico"><ng-container *ngTemplateOutlet="legendIco; context: { $implicit: legendFor(c) }" /></span>{{ c.label }}: {{ c.value }}</span>
        }
      </div>

      <footer class="odg-foot">
        <span class="odg-foot-brand">
          <svg viewBox="0 0 40 44" aria-hidden="true"><path [attr.d]="logoPath" fill="none" stroke="#fff" stroke-width="2.4" /></svg>
          @if (orthoMode()) {
            Ortodoncia <i>|</i> Estética <i>|</i> Función <i>|</i> Salud oral
          } @else {
            {{ specialtyLabel() }} <i>|</i> Precisión en cada detalle
          }
        </span>
        <em>Tu sonrisa, nuestro propósito</em>
      </footer>
    </div>
  `,
  styles: `
    :host { display: block; container-type: inline-size; --ink: #0b3a6e; --ink2: #10306b; --soft: #eaf2fb; --line: #d5e2f0; --bg: #f1f6fb; }
    .odg-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
    .odg { position: relative; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: linear-gradient(160deg, #f7fafd 0%, #eaf1f8 100%); box-shadow: 0 12px 34px rgba(11, 58, 110, 0.1); color: #1e293b; }
    .odg-head { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 12px 28px; padding: 16px 22px; background: rgba(255, 255, 255, 0.75); border-bottom: 1px solid var(--line); }
    .odg-brand { display: flex; gap: 12px; align-items: center; padding-right: 26px; border-right: 1px solid var(--line); }
    .odg-brand svg { width: 42px; height: 46px; }
    .odg-brand strong { display: block; font-size: 30px; font-weight: 800; letter-spacing: 0.02em; color: var(--ink); line-height: 1; }
    .odg-brand span { display: block; margin-top: 4px; font-size: 14px; color: var(--ink); }
    .odg-brand.ortho span { margin-top: 2px; font-size: 30px; font-weight: 800; line-height: 1; letter-spacing: 0.03em; text-transform: uppercase; color: #4a9fd8; }
    .odg-brand i, .odg-foot i { font-style: normal; opacity: 0.5; margin: 0 6px; }
    .odg-print-meta { display: none; margin: 0; gap: 6px 22px; flex-wrap: wrap; font-size: 13px; color: #1e293b; }
    .odg-print-meta b { color: var(--ink); }
    .odg-tagline { justify-self: end; margin: 0; font-size: 16px; font-weight: 700; line-height: 1.25; color: var(--ink); text-align: right; }
    .odg-tagline small { display: block; font-size: 12.5px; font-weight: 500; color: #475569; }
    .odg-body { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; padding: 14px; }
    .odg-badges { display: flex; flex-wrap: wrap; justify-content: center; align-content: center; gap: 2px; min-height: 19px; max-width: 62px; cursor: pointer; }
    .odg-badges .odg-ico, .odg-badges .odg-ico svg { width: 19px; height: 19px; }
    .odg-count .odg-ico, .odg-count .odg-ico svg { width: 15px; height: 15px; }
    .odg-count .lg-dot { width: 10px; height: 10px; }
    .odg-legend-groups { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 12px; }
    .odg-legend-group h5 { margin: 0 0 7px; padding-bottom: 5px; border-bottom: 1px solid var(--line); font-size: 10.5px; font-weight: 800; color: var(--ink); text-transform: uppercase; letter-spacing: 0.03em; }
    .odg-legend.one { grid-template-columns: 1fr; gap: 6px; font-size: 12px; }
    .odg-legend.one .odg-ico, .odg-legend.one .odg-ico svg { width: 19px; height: 19px; }
    .odg-legend.one .lg-dot { width: 13px; height: 13px; }
    .odg-legend-wide .odg-legend-groups { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 22px; }
    .odg-legend-wide .odg-legend.one { grid-template-columns: 1fr 1fr; gap: 7px 10px; }
    .odg-cards.ortho { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .odg-checks { display: flex; flex-direction: column; gap: 9px; padding: 4px 2px; }
    .odg-checks .odg-check { font-size: 13px; }
    .odg-apps { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .odg-apps .odg-chip { padding: 6px 8px; font-size: 12px; }
    .odg-apps .odg-chip:disabled { cursor: default; }
    .odg-left { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .odg-main { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: center; overflow-x: auto; padding: 14px 10px; background: rgba(255, 255, 255, 0.82); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 4px 16px rgba(11, 58, 110, 0.05); }
    .odg-chart { position: relative; width: max-content; min-width: 100%; margin: 0 auto; padding: 0 104px; box-sizing: border-box; }
    .odg-chart::before { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; border-left: 2px dashed #9ec1e6; pointer-events: none; }
    .odg-jaw { position: absolute; left: -96px; top: 50%; transform: translateY(-50%); width: 84px; padding: 8px 10px; border-radius: 6px; background: linear-gradient(90deg, #dbe8f6, #eef4fb); color: var(--ink); font-size: 11.5px; font-weight: 800; line-height: 1.25; letter-spacing: 0.02em; }
    .odg-row { position: relative; display: flex; justify-content: center; align-items: flex-end; min-width: max-content; }
    .odg-row:not(.upper) { align-items: flex-start; }
    .odg-row.small { margin: 6px 0; }
    .odg-tooth { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 2px 1px; border-radius: 50%; }
    .odg-tooth.midline { margin-right: 26px; }
    .odg-tooth.selected::before { content: ''; position: absolute; left: 50%; top: 50%; width: 92px; height: 92px; transform: translate(-50%, -42%); border-radius: 50%; background: radial-gradient(circle, rgba(74, 222, 128, 0.45) 0%, rgba(74, 222, 128, 0.22) 50%, rgba(74, 222, 128, 0) 72%); box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.25); pointer-events: none; }
    .odg-row:not(.upper) .odg-tooth.selected::before { transform: translate(-50%, -58%); }
    .odg-svg { position: relative; cursor: pointer; display: block; transition: transform 0.15s ease; }
    .odg-tooth:hover .odg-svg { transform: scale(1.04); }
    .odg-crown { filter: drop-shadow(0 1.5px 1.5px rgba(60, 45, 20, 0.22)); }
    .odg-shine { stroke: rgba(255, 255, 255, 0.95); stroke-width: 1.8; stroke-dasharray: 16 400; stroke-dashoffset: -8; stroke-linecap: round; }
    .odg-num { position: relative; width: 30px; height: 30px; border: none; border-radius: 50%; background: none; font-size: 14px; font-weight: 600; color: #334155; cursor: pointer; padding: 0; }
    .odg-num.marked { color: var(--ink); font-weight: 800; }
    .odg-num.on { background: #4ade80; color: #fff; font-weight: 800; box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.3); }
    .odg-square { width: 24px; height: 24px; cursor: pointer; }
    .odg-square.small { width: 19px; height: 19px; }
    .odg-square.big { width: 150px; height: 150px; }
    .odg-square polygon:hover { opacity: 0.7; }
    .sq-l { font-size: 4.2px; font-weight: 700; fill: #334155; text-anchor: middle; pointer-events: none; }
    .odg-occlusal { position: relative; display: flex; align-items: center; justify-content: center; gap: 28px; margin: 14px 0; }
    .odg-occlusal.large { gap: 40px; margin: 24px 0; }
    .odg-arch svg { display: block; width: 230px; height: 144px; overflow: visible; }
    .odg-occlusal.large .odg-arch svg { width: 360px; height: 225px; }
    .odg-arch-label { padding: 8px 14px; border-radius: 6px; background: linear-gradient(90deg, #dbe8f6, #eef4fb); color: var(--ink); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; text-align: center; max-width: 110px; }
    .odg-occ-tooth { cursor: pointer; }
    .odg-occ-tooth:hover ellipse:first-child { stroke: var(--ink); stroke-width: 1.8; }
    .odg-occ-num { font-size: 7px; fill: var(--ink); font-weight: 700; pointer-events: none; }

    .odg-pop-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(11, 58, 110, 0.08); }
    .odg-pop { position: fixed; z-index: 1001; width: 480px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow-y: auto; box-sizing: border-box; background: #fff; border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 22px 55px rgba(11, 58, 110, 0.25); padding: 16px 18px; animation: odg-pop-in 0.14s ease-out; }
    @keyframes odg-pop-in { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: none; } }
    .odg-pop-head { display: flex; align-items: center; gap: 12px; }
    .odg-pop-num { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #4ade80; color: #fff; font-weight: 800; font-size: 16px; box-shadow: 0 0 0 5px rgba(74, 222, 128, 0.25); flex: none; }
    .odg-pop-head div { flex: 1; }
    .odg-pop-head strong { display: block; font-size: 18px; color: var(--ink); }
    .odg-pop-head span { font-size: 13px; color: #64748b; }
    .odg-x { border: none; background: #f1f5f9; color: #475569; width: 32px; height: 32px; border-radius: 50%; font-size: 22px; line-height: 1; cursor: pointer; }
    .odg-x:hover { background: #e2e8f0; }
    .odg-pop-sum { margin: 12px 0; padding: 8px 12px; font-size: 13px; color: var(--ink); background: var(--soft); border-radius: 8px; }
    .odg-quick { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 6px; border: 1px solid var(--line); border-radius: 10px; }
    .odg-quick-btn { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: none; border-radius: 8px; background: none; font-size: 14px; font-weight: 600; color: #1e293b; cursor: pointer; text-align: left; }
    .odg-quick-btn:hover { background: var(--soft); }
    .odg-quick-btn.on { background: var(--soft); color: var(--ink); }
    .odg-quick-btn svg { width: 20px; height: 20px; fill: none; stroke: var(--ink); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; flex: none; }
    .odg-pop-title { margin: 14px 0 8px; font-size: 12px; font-weight: 700; color: var(--ink); text-transform: uppercase; letter-spacing: 0.05em; }
    .odg-pop-title span { margin-left: 6px; font-weight: 500; text-transform: none; letter-spacing: 0; color: #64748b; }
    .odg-pop-surfaces { display: flex; gap: 16px; align-items: center; }
    .odg-pop-surfaces .odg-chips { flex: 1; grid-template-columns: 1fr; }
    .odg-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 6px; }
    .odg-chip { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 8px 12px; font-size: 13px; text-align: left; cursor: pointer; color: #1e293b; }
    .odg-chip:hover { border-color: #9ec1e6; background: #f6f9fd; }
    .odg-chip.on { border-color: var(--ink); background: var(--soft); font-weight: 600; box-shadow: inset 0 0 0 1px var(--ink); }
    .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(15, 23, 42, 0.2); flex: none; }
    .odg-chip .dot { width: 14px; height: 14px; }
    .odg-note { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; font-size: 12px; font-weight: 700; color: var(--ink); text-transform: uppercase; letter-spacing: 0.05em; }
    .odg-note input { font: inherit; font-size: 14px; font-weight: 400; text-transform: none; letter-spacing: 0; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
    .odg-note input:focus, .odg-card textarea:focus { outline: none; border-color: var(--ink); box-shadow: 0 0 0 3px rgba(11, 58, 110, 0.12); }
    .odg-pop-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
    .odg-link { border: none; background: none; cursor: pointer; font-size: 13px; text-decoration: underline; color: var(--ink); padding: 0; }
    .odg-link.danger { color: #b91c1c; }
    .odg-btn { border: none; background: var(--ink); color: #fff; border-radius: 8px; padding: 9px 22px; font-size: 14px; cursor: pointer; font-weight: 600; }

    .odg-cards { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .odg-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: rgba(255, 255, 255, 0.85); border: 1px solid var(--line); border-radius: 12px; }
    .odg-card h4, .odg-side h4 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 12.5px; font-weight: 800; color: var(--ink); text-transform: uppercase; letter-spacing: 0.04em; }
    .odg-card h4 svg { width: 20px; height: 20px; fill: none; stroke: var(--ink); stroke-width: 1.7; stroke-linejoin: round; stroke-linecap: round; }
    .odg-card-body { flex: 1; min-height: 70px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: #fff; font: inherit; font-size: 13px; color: #1e293b; resize: vertical; box-sizing: border-box; }
    .odg-card-body p { margin: 0 0 4px; }
    .odg-card-body .muted { color: #64748b; font-size: 12.5px; }
    .odg-side { display: flex; flex-direction: column; gap: 12px; }
    .odg-side section { display: flex; flex-direction: column; gap: 10px; padding: 12px; background: rgba(255, 255, 255, 0.85); border: 1px solid var(--line); border-radius: 12px; }
    .odg-legend { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 11px 10px; font-size: 13.5px; font-weight: 500; color: #1e293b; }
    .odg-legend li { display: flex; align-items: center; gap: 9px; line-height: 1.2; }
    .odg-legend .odg-ico, .odg-legend .odg-ico svg { width: 26px; height: 26px; }
    .odg-legend .lg-dot { width: 17px; height: 17px; }
    .odg-ico { display: grid; place-items: center; width: 20px; height: 20px; flex: none; }
    .odg-ico svg { width: 20px; height: 20px; }
    .lg-dot { width: 13px; height: 13px; border-radius: 50%; }
    .odg-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .odg-tool { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--line); background: #fff; border-radius: 6px; padding: 8px 10px; font-size: 12.5px; cursor: pointer; color: var(--ink); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05); }
    .odg-tool:hover { background: #f5f9fd; }
    .odg-tool svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; flex: none; }
    .odg-tool.on { background: var(--ink2); color: #fff; border-color: var(--ink2); }
    .odg-hint { margin: 0; font-size: 11.5px; color: #64748b; }
    .odg-hint.strong { color: var(--ink); font-weight: 700; }
    .odg-palette { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; padding: 8px; background: #fff; border-radius: 8px; box-shadow: 0 4px 14px rgba(11, 58, 110, 0.12); }
    .odg-swatch { display: grid; place-items: center; width: 100%; aspect-ratio: 1; border-radius: 6px; border: 1px solid var(--line); background: #fff; cursor: pointer; padding: 0; }
    .odg-swatch .odg-ico, .odg-swatch .odg-ico svg { width: 17px; height: 17px; }
    .odg-swatch .lg-dot { width: 12px; height: 12px; }
    .odg-swatch:hover { transform: scale(1.12); }
    .odg-swatch.on { box-shadow: 0 0 0 2px var(--ink); transform: scale(1.12); }
    .odg-seg { display: flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
    .odg-seg button { flex: 1; border: none; background: #fff; padding: 6px 2px; font-size: 11.5px; cursor: pointer; color: var(--ink); }
    .odg-seg button.on { background: var(--soft); font-weight: 700; }
    .odg-check { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 0; }
    .odg-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .odg-action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 8px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); font-size: 12.5px; font-weight: 600; cursor: pointer; }
    .odg-action svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
    .odg-action.primary { background: var(--ink2); border-color: var(--ink2); color: #fff; }

    .odg-summary { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 14px 12px; font-size: 12px; }
    .odg-cop, .odg-count { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: #fff; border: 1px solid var(--line); }
    .odg-cop { background: var(--soft); }
    .odg-cop strong { color: var(--ink); }
    .odg-foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 22px; background: linear-gradient(90deg, #0b3a6e, #123f7a); color: #fff; font-size: 12.5px; }
    .odg-foot-brand { display: inline-flex; align-items: center; gap: 12px; }
    .odg-foot-brand svg { width: 24px; height: 26px; }
    .odg-foot em { font-family: Georgia, 'Times New Roman', serif; font-size: 16px; }
    @container (max-width: 1150px) {
      .odg-head { grid-template-columns: 1fr; }
      .odg-brand { border-right: none; }
      .odg-tagline { display: none; }
    }
    @container (max-width: 980px) {
      .odg-body { grid-template-columns: 1fr; }
      .odg-cards.ortho { grid-template-columns: 1fr; }
      .odg-legend-wide .odg-legend-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .odg-side { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    }
    @container (max-width: 560px) {
      .odg-pop-surfaces { flex-direction: column; align-items: stretch; }
      .odg-square.big { align-self: center; }
    }
    @media print {
      .odg-pop, .odg-pop-backdrop, .odg-side > section:not(.odg-side-legend), .odg-card.odg-empty { display: none !important; }
      .odg-head { grid-template-columns: auto 1fr auto; }
      .odg-brand { border-right: 1px solid var(--line); }
      .odg-print-meta { display: flex; }
      .odg-tagline { display: block; }
      .odg-body { grid-template-columns: minmax(0, 1fr) 260px; }
      .odg-body.ortho { grid-template-columns: 1fr; }
      .odg-body.ortho .odg-side { display: none; }
      .odg-cards.ortho { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .odg-legend-wide .odg-legend-groups { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .odg-side { display: flex; }
      .odg-card textarea { border: none; resize: none; padding: 0; min-height: 0; }
      .odg { box-shadow: none; break-inside: avoid; }
    }
  `,
})
export class DentalOdontogram implements OnDestroy {
  readonly data = input.required<DentistryContent>();
  readonly disabled = input(false);
  readonly patientName = input('');
  readonly patientAge = input('');
  readonly recordCode = input('');
  readonly recordDate = input('');
  readonly professionalName = input('');
  readonly professionalCard = input('');
  readonly orthoMarks = input(true);
  readonly specialtyLabel = input('Odontología General');
  /** Consultorio de ortodoncia: convenciones, menú del diente y tarjetas propias de la especialidad. */
  readonly orthoMode = input(false);
  readonly changed = output<void>();
  /** Pide a la historia guardar el borrador. */
  readonly save = output<void>();

  @ViewChild('mainArea') private mainArea?: ElementRef<HTMLElement>;
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly positions = POSITIONS;
  readonly modes = MODES;
  readonly views = VIEWS;
  readonly dentitions = DENTITIONS;
  readonly surfaceTools = SURFACE_TOOLS;
  readonly conditionTools = CONDITION_TOOLS;
  /** Con la consulta de ortodoncia (o si el odontograma ya tiene aparatología) se ofrecen brackets, bandas y separadores. */
  readonly showOrthoMarks = computed(() => {
    this.version();
    if (this.orthoMarks()) return true;
    if (this.data().orthoArches.upper || this.data().orthoArches.lower) return true;
    return Object.values(this.data().odontogram).some((r) => r?.marks?.some((m) => ORTHO_MARKS.has(m)));
  });
  readonly markTools = computed(() => (this.showOrthoMarks() ? MARK_TOOLS : MARK_TOOLS.filter((t) => !ORTHO_MARKS.has(t.key))));
  readonly allTools = computed(() => {
    if (this.orthoMode()) return ALL_TOOLS;
    return ALL_TOOLS.filter((t) => !ORTHO_ONLY_KEYS.has(t.key) && (this.showOrthoMarks() || !ORTHO_MARKS.has(t.key)));
  });
  readonly orthoLegend = ORTHO_LEGEND;
  readonly orthoPopTop = ORTHO_POP_TOP;
  readonly orthoPopBottom = ORTHO_POP_BOTTOM;
  readonly planPhases = ORTHO_PLAN_PHASES;
  readonly bracketTypes = BRACKET_TYPES;
  readonly appliances = ORTHO_APPLIANCES;
  readonly toothIcon =
    'M10 4 C7 2 3 3 3 7 C3 10 5 12 5.5 16 C6 18.5 8 18 8.2 15.5 C8.4 13.5 9 12.5 10 12.5 C11 12.5 11.6 13.5 11.8 15.5 C12 18 14 18.5 14.5 16 C15 12 17 10 17 7 C17 3 13 2 10 4 Z';

  legendFor(tool: { key?: string; label: string; color: string }): LegendItem {
    const key = tool.key as string | undefined;
    if (this.orthoMode() && key) {
      const type = this.data().orthoChart.bracketType;
      if (key === 'BRACKET' && type) return { ...ORTHO_LEGEND_BY_KEY.get('BT_' + type)!, label: tool.label };
      const item = ORTHO_LEGEND_BY_KEY.get(key);
      if (item) return item;
    }
    return LEGEND_BY_LABEL.get(tool.label) ?? (key ? ORTHO_LEGEND_BY_KEY.get(key) : undefined) ?? { ...tool, icon: 'dot' };
  }

  readonly bracketStyle = computed(() => {
    this.version();
    return BRACKET_STYLES[this.data().orthoChart.bracketType] ?? DEFAULT_BRACKET;
  });

  hasAppliance(key: string) {
    this.version();
    return this.data().orthoChart.appliances.includes(key);
  }

  movementMarks(tooth: number) {
    return (this.record(tooth)?.marks || []).filter((m) => MOVEMENT_KEYS.has(m));
  }

  /** Ubica los símbolos de movimiento sobre la raíz, sin reflejarlos en la mandíbula; si hay varios se reducen en cuadrícula. */
  moveTransform(upper: boolean, i: number, n: number) {
    const baseY = upper ? 8 : 62;
    if (n === 1) return `translate(13 ${baseY})`;
    const s = 0.55;
    const cx = i % 2 ? 31 : 19;
    const cy = baseY + 8 + Math.floor(i / 2) * 15;
    return `translate(${cx - 12 * s} ${cy - 15 * s}) scale(${s})`;
  }

  occlusionMarks(tooth: number): LegendItem[] {
    return (this.record(tooth)?.marks || []).filter((m) => OCCLUSION_KEYS.has(m)).map((m) => ORTHO_LEGEND_BY_KEY.get(m)!);
  }

  chainXs(tooth: number) {
    const s = this.shape(tooth);
    const out: number[] = [];
    for (let x = s.crownLeft - 2; x <= s.crownRight + 2; x += 5.5) out.push(Math.round(x * 10) / 10);
    return out;
  }

  springPath(tooth: number) {
    const s = this.shape(tooth);
    const x0 = s.crownLeft - 5;
    const x1 = s.crownRight + 5;
    let d = `M${x0} 74`;
    let up = true;
    for (let x = x0 + 2.5; x < x1; x += 2.5) {
      d += ` L${x} ${up ? 70 : 78}`;
      up = !up;
    }
    return `${d} L${x1} 74`;
  }

  hookPath(tooth: number) {
    const x = this.shape(tooth).crownRight - 5;
    return `M${x - 4} 70 H${x} V62 Q${x} 58 ${x - 4} 58`;
  }

  toolOn(tooth: number, tool: DentalToolDef) {
    return tool.scope === 'condition' ? this.has(tooth, tool.key as ToothCondition) : this.hasMark(tooth, tool.key as ToothMark);
  }

  toggleTool(tooth: number, tool: DentalToolDef) {
    if (tool.scope === 'condition') this.toggleCondition(tooth, tool.key as ToothCondition);
    else this.toggleMark(tooth, tool.key as ToothMark);
  }

  togglePlanPhase(key: string) {
    if (this.disabled()) return;
    const chart = this.data().orthoChart;
    chart.planPhases = chart.planPhases.includes(key)
      ? chart.planPhases.filter((k) => k !== key)
      : ORTHO_PLAN_PHASES.map((p) => p.key).filter((k) => k === key || chart.planPhases.includes(k));
    this.bump();
  }

  setBracketType(key: string) {
    if (this.disabled()) return;
    const chart = this.data().orthoChart;
    chart.bracketType = chart.bracketType === key ? '' : key;
    this.bump();
  }

  toggleAppliance(key: string) {
    if (this.disabled()) return;
    const chart = this.data().orthoChart;
    chart.appliances = chart.appliances.includes(key)
      ? chart.appliances.filter((k) => k !== key)
      : ORTHO_APPLIANCES.map((a) => a.key).filter((k) => k === key || chart.appliances.includes(k));
    this.bump();
  }
  readonly legend = computed(() => (this.showOrthoMarks() ? LEGEND : LEGEND.filter((l) => !ORTHO_LEGEND_ICONS.has(l.icon))));
  readonly quickActions = computed(() => (this.showOrthoMarks() ? QUICK_ACTIONS : QUICK_ACTIONS.filter((q) => q.key !== 'BRACKET')));
  readonly logoPath = LOGO_PATH;
  readonly showSurfaces = signal(false);
  readonly savedFlash = signal(false);
  readonly screwLines = [16, 24, 32, 40, 48];
  private popAnchor: Element | null = null;

  readonly mode = signal<Mode>('SELECT');
  readonly paintTool = signal<DentalTool>('CARIES');
  readonly popSurfaceTool = signal<SurfaceState>('CARIES');
  readonly view = signal<ViewKind>('COMPLETA');
  /** Dentición registrada en el examen intraoral («Permanente», «Temporal» o «Mixta»). */
  readonly dentitionLabel = input('');
  /** En solo lectura se puede cambiar la vista sin tocar la historia. */
  private readonly viewDentition = signal<Dentition | null>(null);
  readonly dentition = computed<Dentition>(
    () =>
      this.viewDentition() ??
      DENTITIONS.find((d) => d.label === this.dentitionLabel())?.key ??
      'PERMANENTE',
  );
  readonly selected = signal<number | null>(null);
  readonly popoverOpen = signal(false);
  readonly popLeft = signal(0);
  readonly popTop = signal(0);
  /** Se incrementa en cada cambio para recalcular los contadores. */
  private readonly version = signal(0);

  readonly rows = computed<Row[]>(() => {
    const view = this.view();
    const dentition = this.dentition();
    const upper: Row[] = [];
    const lower: Row[] = [];
    if (dentition !== 'TEMPORAL') upper.push({ teeth: PERMANENT_UPPER, upper: true });
    if (dentition !== 'PERMANENTE') {
      upper.push({ teeth: DECIDUOUS_UPPER, upper: true, small: dentition === 'MIXTA' });
      lower.push({ teeth: DECIDUOUS_LOWER, upper: false, small: dentition === 'MIXTA' });
    }
    if (dentition !== 'TEMPORAL') lower.push({ teeth: PERMANENT_LOWER, upper: false });
    if (view === 'MAXILAR') return upper;
    if (view === 'MANDIBULA') return lower;
    return [...upper, ...lower];
  });

  readonly occlusalArches = computed(() => {
    const view = this.view();
    const dentition = this.dentition();
    const temporal = dentition === 'TEMPORAL';
    const out: Array<ReturnType<DentalOdontogram['buildArch']>> = [];
    if (view !== 'MANDIBULA') {
      out.push(this.buildArch('Vista oclusal superior', temporal ? DECIDUOUS_UPPER : PERMANENT_UPPER, true));
    }
    if (view !== 'MAXILAR') {
      out.push(this.buildArch('Vista oclusal inferior', temporal ? DECIDUOUS_LOWER : PERMANENT_LOWER, false));
    }
    return out;
  });

  readonly cop = computed(() => {
    this.version();
    let c = 0;
    let o = 0;
    let p = 0;
    for (const [key, rec] of Object.entries(this.data().odontogram)) {
      const quadrant = Math.floor(Number(key) / 10);
      if (quadrant > 4) continue;
      const surfaces = Object.values(rec.surfaces || {});
      const conditions = rec.conditions || [];
      if (conditions.includes('AUSENTE') || conditions.includes('EXTRACCION_INDICADA')) p++;
      else if (surfaces.includes('CARIES')) c++;
      else if (surfaces.includes('RESTAURACION') || conditions.includes('CORONA')) o++;
    }
    return { c, o, p };
  });

  readonly ceo = computed(() => {
    this.version();
    let c = 0;
    let e = 0;
    let o = 0;
    for (const [key, rec] of Object.entries(this.data().odontogram)) {
      const quadrant = Math.floor(Number(key) / 10);
      if (quadrant < 5) continue;
      const surfaces = Object.values(rec.surfaces || {});
      const conditions = rec.conditions || [];
      if (conditions.includes('EXTRACCION_INDICADA')) e++;
      else if (surfaces.includes('CARIES')) c++;
      else if (surfaces.includes('RESTAURACION') || conditions.includes('CORONA')) o++;
    }
    return { c, e, o };
  });

  readonly counts = computed(() => {
    this.version();
    const tally = new Map<string, number>();
    for (const rec of Object.values(this.data().odontogram)) {
      const found = new Set<string>([
        ...Object.values(rec.surfaces || {}).filter(Boolean) as string[],
        ...(rec.conditions || []),
        ...(rec.marks || []),
      ]);
      for (const key of found) tally.set(key, (tally.get(key) || 0) + 1);
    }
    return ALL_TOOLS.filter((t) => tally.get(t.key)).map((t) => ({
      key: t.key as string,
      label: t.label,
      color: t.color,
      value: tally.get(t.key) || 0,
    }));
  });

  square(pos: Position) {
    return SQUARE[pos];
  }

  color(key: string) {
    return dentalToolColor(key);
  }

  toolLabel(key: string) {
    return dentalToolLabel(key);
  }

  modeHint() {
    switch (this.mode()) {
      case 'ERASE':
        return 'Toque un diente para borrar todos sus hallazgos.';
      case 'NOTE':
        return 'Toque un diente para escribir una nota.';
      default:
        return 'Toque un diente para ver y registrar su estado.';
    }
  }

  kind(tooth: number): ToothKind {
    const quadrant = Math.floor(tooth / 10);
    const pos = tooth % 10;
    if (quadrant >= 5) return pos <= 2 ? 'incisor' : pos === 3 ? 'canine' : 'molar';
    if (pos <= 2) return 'incisor';
    if (pos === 3) return 'canine';
    if (pos <= 5) return 'premolar';
    return 'molar';
  }

  shape(tooth: number): ToothShape {
    return SHAPES[this.kind(tooth)];
  }

  toothName(tooth: number) {
    const quadrant = Math.floor(tooth / 10);
    const pos = tooth % 10;
    const names = quadrant >= 5 ? DECIDUOUS_NAMES : PERMANENT_NAMES;
    return `${names[pos] || 'Diente'} ${QUADRANT_NAMES[quadrant] || ''}`.trim();
  }

  isLastUpper(index: number) {
    const rows = this.rows();
    return rows[index]?.upper && !rows[index + 1]?.upper;
  }

  showOcclusalBetween() {
    return this.view() === 'COMPLETA';
  }

  isUpperTooth(tooth: number) {
    return [1, 2, 5, 6].includes(Math.floor(tooth / 10));
  }

  archActive(upper: boolean) {
    const arches = this.data().orthoArches;
    return upper ? !!arches?.upper : !!arches?.lower;
  }

  record(tooth: number): ToothRecord | undefined {
    this.version();
    return this.data().odontogram[String(tooth)];
  }

  has(tooth: number, condition: ToothCondition) {
    return !!this.record(tooth)?.conditions?.includes(condition);
  }

  hasMark(tooth: number, mark: ToothMark) {
    return !!this.record(tooth)?.marks?.includes(mark);
  }

  /** Superficie anatómica según cuadrante: arriba es vestibular en el maxilar y lingual en la mandíbula. */
  private surfaceAt(tooth: number, pos: Position): ToothSurface {
    const quadrant = Math.floor(tooth / 10);
    const upper = [1, 2, 5, 6].includes(quadrant);
    const patientRight = [1, 4, 5, 8].includes(quadrant);
    switch (pos) {
      case 'top':
        return upper ? 'V' : 'L';
      case 'bottom':
        return upper ? 'L' : 'V';
      case 'left':
        return patientRight ? 'D' : 'M';
      case 'right':
        return patientRight ? 'M' : 'D';
      default:
        return 'O';
    }
  }

  surfaceLetter(tooth: number, pos: Position) {
    return this.surfaceAt(tooth, pos);
  }

  surfaceTitle(tooth: number, pos: Position) {
    const surface = this.surfaceAt(tooth, pos);
    const state = this.record(tooth)?.surfaces?.[surface];
    return `${SURFACE_LABELS[surface]}${state ? ` — ${dentalToolLabel(state)}` : ''}`;
  }

  surfaceFill(tooth: number, pos: Position) {
    const rec = this.record(tooth);
    if (rec?.conditions?.includes('AUSENTE')) return '#e5e7eb';
    const state = rec?.surfaces?.[this.surfaceAt(tooth, pos)];
    return state ? dentalToolColor(state) : '#ffffff';
  }

  mesialX(tooth: number) {
    const quadrant = Math.floor(tooth / 10);
    const s = this.shape(tooth);
    return [1, 4, 5, 8].includes(quadrant) ? s.crownRight - 2 : s.crownLeft + 2;
  }

  /** Puntos de color sobre la corona anatómica para los hallazgos por superficie. */
  surfaceDots(tooth: number) {
    const rec = this.record(tooth);
    if (!rec?.surfaces || rec.conditions?.includes('AUSENTE')) return [];
    const s = this.shape(tooth);
    const mesialRight = [1, 4, 5, 8].includes(Math.floor(tooth / 10));
    const coords: Record<ToothSurface, [number, number]> = {
      O: [25, 90],
      V: [25, 76],
      L: [25, 64],
      M: [mesialRight ? s.crownRight - 5 : s.crownLeft + 5, 78],
      D: [mesialRight ? s.crownLeft + 5 : s.crownRight - 5, 78],
    };
    return (Object.entries(rec.surfaces) as Array<[ToothSurface, SurfaceState]>)
      .filter(([, state]) => !!state)
      .map(([surface, state]) => ({ surface, state, x: coords[surface][0], y: coords[surface][1] }));
  }

  crownFill(tooth: number) {
    if (this.has(tooth, 'PROTESIS')) return 'url(#odg-crown-green)';
    if (this.has(tooth, 'PROTESIS_REMOVIBLE')) return 'url(#odg-crown-sky)';
    if (this.has(tooth, 'CORONA')) return 'url(#odg-crown-purple)';
    return 'url(#odg-enamel)';
  }

  crownStroke(tooth: number) {
    if (this.has(tooth, 'PROTESIS')) return '#16a34a';
    if (this.has(tooth, 'PROTESIS_REMOVIBLE')) return '#0284c7';
    if (this.has(tooth, 'CORONA')) return '#8e24aa';
    return '#b9a07a';
  }

  quickActive(tooth: number, key: QuickKey) {
    const rec = this.record(tooth);
    if (key === 'BRACKET') return !!rec?.marks?.includes('BRACKET');
    if (key === 'NOTE') return !!(rec?.note || '').trim();
    return !!rec?.surfaces && Object.values(rec.surfaces).includes(key);
  }

  quick(tooth: number, key: QuickKey) {
    if (key === 'BRACKET') this.toggleMark(tooth, 'BRACKET');
    else if (key === 'NOTE') {
      document.querySelector<HTMLInputElement>('.odg-pop .odg-note input')?.focus();
    } else {
      this.popSurfaceTool.set(key);
      this.toggleSurfaceBySurface(tooth, 'O', key);
    }
  }

  setOdontogramNotes(value: string) {
    if (this.disabled()) return;
    this.data().odontogramNotes = value;
    this.changed.emit();
  }

  setDentition(label: string) {
    if (this.disabled()) {
      this.viewDentition.set(DENTITIONS.find((d) => d.label === label)?.key ?? null);
      return;
    }
    this.viewDentition.set(null);
    if (this.data().intraoral.dentition === label) return;
    this.data().intraoral.dentition = label;
    this.changed.emit();
  }

  onSave() {
    this.save.emit();
    this.savedFlash.set(true);
    setTimeout(() => this.savedFlash.set(false), 2200);
  }

  /** Imprime solo el odontograma en una ventana aparte. */
  print() {
    this.closePopover();
    const host = this.hostRef.nativeElement;
    const clone = host.cloneNode(true) as HTMLElement;
    // El valor escrito en un textarea no viaja en el HTML clonado.
    const sources = host.querySelectorAll('textarea');
    clone.querySelectorAll('textarea').forEach((t, i) => (t.textContent = sources[i]?.value ?? ''));
    const win = window.open('', '_blank', 'width=1300,height=900');
    if (!win) return;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((n) => n.outerHTML)
      .join('');
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Odontograma</title>${styles}` +
        `<style>@page{size:A4 landscape;margin:8mm}` +
        `html,body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
        `app-dental-odontogram{display:block;width:1280px}</style>` +
        `</head><body>${clone.outerHTML}</body></html>`,
    );
    win.document.close();
    win.onload = () => {
      // Área imprimible de A4 horizontal con márgenes de 8 mm, en píxeles CSS.
      const page = { width: 1060, height: 730 };
      const el = win.document.querySelector('app-dental-odontogram') as HTMLElement | null;
      if (el) {
        const zoom = Math.min(1, page.width / el.scrollWidth, page.height / el.scrollHeight);
        win.document.documentElement.style.zoom = String(zoom);
      }
      win.focus();
      win.print();
    };
  }

  occlusalFill(tooth: number) {
    const rec = this.record(tooth);
    if (!rec) return '#ffffff';
    const found = new Set<string>([...(rec.conditions || []), ...(Object.values(rec.surfaces || {}) as string[])]);
    const top = OCCLUSAL_PRIORITY.find((k) => found.has(k));
    if (top === 'AUSENTE') return '#e5e7eb';
    return top ? dentalToolColor(top) : '#ffffff';
  }

  summary(tooth: number) {
    const rec = this.record(tooth);
    if (!rec) return '';
    const parts: string[] = [];
    for (const c of rec.conditions || []) parts.push(dentalToolLabel(c));
    for (const [surface, state] of Object.entries(rec.surfaces || {})) {
      if (state) parts.push(`${dentalToolLabel(state)} ${surface}`);
    }
    for (const m of rec.marks || []) parts.push(dentalToolLabel(m));
    if ((rec.note || '').trim()) parts.push(`Nota: ${rec.note!.trim()}`);
    return parts.join(' · ');
  }

  private buildArch(label: string, teeth: number[], upper: boolean) {
    const widths = teeth.map((t) => {
      const k = this.kind(t);
      return k === 'molar' ? 1.45 : k === 'premolar' ? 1.1 : k === 'canine' ? 1 : 0.9;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    const cx = 120;
    const rx = 100;
    const ry = 118;
    const cy = upper ? 138 : 12;
    let acc = 0;
    const points = teeth.map((tooth, i) => {
      const mid = acc + widths[i] / 2;
      acc += widths[i];
      const theta = Math.PI - (mid / total) * Math.PI;
      const x = cx + rx * Math.cos(theta);
      const y = upper ? cy - ry * Math.sin(theta) : cy + ry * Math.sin(theta);
      const r = 6.9 * widths[i];
      const labelY = upper ? y + r + 7 : y - r - 2.5;
      const deg = (theta * 180) / Math.PI;
      const a = Math.round(upper ? 90 - deg : deg - 90);
      return { tooth, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r, a, labelY, theta };
    });

    // Aparatos por lingual/palatino: se trazan sobre una elipse interior a la arcada.
    const at = (theta: number, inset: number) => {
      const px = cx + (rx - inset) * Math.cos(theta);
      const py = upper ? cy - (ry - inset) * Math.sin(theta) : cy + (ry - inset) * Math.sin(theta);
      return `${Math.round(px * 10) / 10} ${Math.round(py * 10) / 10}`;
    };
    const pair = (...positions: number[]) => {
      for (const pos of positions) {
        const found = points.filter((p) => p.tooth % 10 === pos);
        if (found.length === 2) return [found[0].theta, found[1].theta] as const;
      }
      return null;
    };
    const curve = (range: readonly [number, number] | null, inset: number) => {
      if (!range) return '';
      const steps = 24;
      const parts: string[] = [];
      for (let i = 0; i <= steps; i++) parts.push(at(range[0] + ((range[1] - range[0]) * i) / steps, inset));
      return `M${parts.join(' L')}`;
    };
    const molars = pair(6, 5);
    const center = { x: cx, y: upper ? cy - ry * 0.5 : cy + ry * 0.5 };
    const geo = {
      lingual: curve(molars, 22),
      retainer: curve(pair(3), 17),
      expander: molars
        ? { x: center.x, y: center.y, arms: `M${at(molars[0], 14)} L${center.x} ${center.y} M${at(molars[1], 14)} L${center.x} ${center.y}` }
        : null,
    };
    return { label, upper, teeth: points, geo };
  }

  setMode(mode: Mode) {
    this.mode.set(mode);
    if (mode !== 'SELECT' && mode !== 'NOTE') this.closePopover();
  }

  onToothClick(tooth: number, event: Event) {
    event.stopPropagation();
    this.selected.set(tooth);
    const mode = this.disabled() ? 'SELECT' : this.mode();
    if (mode === 'ERASE') {
      this.clearTooth(tooth);
      return;
    }
    if (mode === 'PAINT') {
      const tool = this.paintTool();
      if (SURFACE_TOOLS.some((t) => t.key === tool)) this.toggleSurfaceBySurface(tooth, 'O', tool as SurfaceState);
      else this.applyTool(tooth, tool);
      return;
    }
    this.openPopover(event);
  }

  onSurfaceClick(tooth: number, pos: Position, event: Event) {
    event.stopPropagation();
    this.selected.set(tooth);
    const mode = this.disabled() ? 'SELECT' : this.mode();
    if (mode === 'PAINT') {
      const tool = this.paintTool();
      if (SURFACE_TOOLS.some((t) => t.key === tool)) this.toggleSurface(tooth, pos, tool as SurfaceState);
      else this.applyTool(tooth, tool);
      return;
    }
    if (mode === 'ERASE') {
      this.clearTooth(tooth);
      return;
    }
    this.openPopover(event);
  }

  private openPopover(event: Event) {
    this.popAnchor = event.currentTarget as Element | null;
    this.positionPopover();
    this.popoverOpen.set(true);
    document.addEventListener('scroll', this.onViewportChange, true);
    setTimeout(() => this.positionPopover());
    if (this.mode() === 'NOTE') {
      setTimeout(() => this.mainArea?.nativeElement.querySelector<HTMLInputElement>('.odg-note input')?.focus(), 30);
    }
  }

  /** Ubica el menú junto al diente, dentro de la ventana (arriba si no cabe abajo). */
  private positionPopover() {
    const target = this.popAnchor;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(480, vw - 24);
    const pop = this.mainArea?.nativeElement.querySelector<HTMLElement>('.odg-pop');
    const height = Math.min(pop?.offsetHeight || 520, vh - 24);
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - 12));
    let top = rect.bottom + 8;
    if (top + height > vh - 12) top = Math.max(12, Math.min(rect.top - height - 8, vh - height - 12));
    this.popLeft.set(left);
    this.popTop.set(top);
  }

  @HostListener('window:resize')
  onResize() {
    this.onViewportChange();
  }

  private readonly onViewportChange = () => {
    if (this.popoverOpen()) this.positionPopover();
  };

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.popoverOpen()) this.closePopover();
  }

  closePopover() {
    this.popoverOpen.set(false);
    this.popAnchor = null;
    document.removeEventListener('scroll', this.onViewportChange, true);
  }

  ngOnDestroy() {
    document.removeEventListener('scroll', this.onViewportChange, true);
  }

  private applyTool(tooth: number, tool: DentalTool) {
    if (tool === 'SANO') {
      this.setHealthy(tooth);
      return;
    }
    const def = TOOL_BY_KEY.get(tool);
    if (def?.scope === 'condition') this.toggleCondition(tooth, tool as ToothCondition);
    else if (def?.scope === 'mark') this.toggleMark(tooth, tool as ToothMark);
  }

  toggleCondition(tooth: number, condition: ToothCondition) {
    if (this.disabled()) return;
    const rec = this.copy(tooth);
    const set = new Set(rec.conditions || []);
    if (set.has(condition)) set.delete(condition);
    else if (condition === 'AUSENTE') {
      set.clear();
      set.add('AUSENTE');
      delete rec.surfaces;
    } else {
      set.delete('AUSENTE');
      set.add(condition);
    }
    rec.conditions = [...set];
    this.store(tooth, rec);
  }

  toggleMark(tooth: number, mark: ToothMark) {
    if (this.disabled()) return;
    const rec = this.copy(tooth);
    const set = new Set(rec.marks || []);
    if (set.has(mark)) set.delete(mark);
    else set.add(mark);
    rec.marks = [...set];
    this.store(tooth, rec);
  }

  toggleSurface(tooth: number, pos: Position, state: SurfaceState) {
    this.toggleSurfaceBySurface(tooth, this.surfaceAt(tooth, pos), state);
  }

  toggleSurfaceBySurface(tooth: number, surface: ToothSurface, state: SurfaceState) {
    if (this.disabled()) return;
    const rec = this.copy(tooth);
    if (rec.conditions?.includes('AUSENTE')) return;
    const surfaces = { ...(rec.surfaces || {}) };
    if (surfaces[surface] === state) delete surfaces[surface];
    else surfaces[surface] = state;
    rec.surfaces = surfaces;
    this.store(tooth, rec);
  }

  setHealthy(tooth: number) {
    if (this.disabled()) return;
    const note = this.record(tooth)?.note;
    this.store(tooth, note ? { note } : {});
  }

  clearTooth(tooth: number) {
    if (this.disabled()) return;
    delete this.data().odontogram[String(tooth)];
    this.bump();
  }

  setNote(tooth: number, note: string) {
    if (this.disabled()) return;
    const rec = this.copy(tooth);
    rec.note = note;
    this.store(tooth, rec);
  }

  toggleArch(which: 'upper' | 'lower', checked: boolean) {
    if (this.disabled()) return;
    this.data().orthoArches[which] = checked;
    this.bump();
  }

  private copy(tooth: number): ToothRecord {
    const rec = this.data().odontogram[String(tooth)] || {};
    return {
      ...rec,
      conditions: rec.conditions ? [...rec.conditions] : undefined,
      surfaces: rec.surfaces ? { ...rec.surfaces } : undefined,
      marks: rec.marks ? [...rec.marks] : undefined,
    };
  }

  private store(tooth: number, rec: ToothRecord) {
    const clean: ToothRecord = {};
    if (rec.conditions?.length) clean.conditions = rec.conditions;
    if (rec.surfaces && Object.keys(rec.surfaces).length) clean.surfaces = rec.surfaces;
    if (rec.marks?.length) clean.marks = rec.marks;
    if ((rec.note || '').trim() || (rec.note && this.popoverOpen())) clean.note = rec.note;
    const map = this.data().odontogram;
    if (Object.keys(clean).length) map[String(tooth)] = clean;
    else delete map[String(tooth)];
    this.bump();
  }

  private bump() {
    this.version.update((v) => v + 1);
    this.changed.emit();
  }
}
