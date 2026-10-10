import { AesAnnotation, AesShape, isProcedureMark, markKind, markStatus } from '../aesthetic-tracking.models';

/** Símbolo del marcador: el color nunca es la única diferencia entre procedimientos. */
export type MarkSymbol = 'circle' | 'diamond' | 'square' | 'hexagon' | 'triangle' | 'pentagon' | 'star' | 'ring';

export interface ProcedureStyle {
  color: string;
  symbol: MarkSymbol;
}

/** Identidad visual por tipo de procedimiento; los tipos nuevos sin estilo usan el gris. */
export const PROCEDURE_STYLES: Record<string, ProcedureStyle> = {
  TOXINA: { color: '#8B5CC8', symbol: 'circle' },
  ACIDO_HIALURONICO: { color: '#3A6FD0', symbol: 'diamond' },
  RADIESSE: { color: '#4C9A5E', symbol: 'square' },
  BIOESTIMULADOR: { color: '#C9961E', symbol: 'hexagon' },
  HILOS: { color: '#D9578A', symbol: 'triangle' },
  SKINBOOSTER: { color: '#2FA8BC', symbol: 'pentagon' },
  MESOTERAPIA: { color: '#2A8C80', symbol: 'ring' },
  PRP: { color: '#B5532F', symbol: 'pentagon' },
  LASER: { color: '#DD6A3A', symbol: 'star' },
  ENERGIA: { color: '#A8553A', symbol: 'hexagon' },
  PEELING: { color: '#8A7564', symbol: 'diamond' },
  MICRONEEDLING: { color: '#5F6F82', symbol: 'ring' },
};

const OTHER: ProcedureStyle = { color: '#778394', symbol: 'square' };

export function procedureStyle(type: string | undefined): ProcedureStyle {
  return (type && PROCEDURE_STYLES[type]) || OTHER;
}

/** Color y símbolo de una marca según su tipo (procedimiento, hallazgo, evento o nota). */
export function markStyle(a: AesAnnotation): ProcedureStyle {
  if (isProcedureMark(a)) return a.procType ? procedureStyle(a.procType) : { color: markKind(a.kind).color, symbol: 'circle' };
  if (a.kind === 'EVENTO') return { color: markKind('EVENTO').color, symbol: 'triangle' };
  if (a.kind === 'NOTA') return { color: markKind('NOTA').color, symbol: 'circle' };
  return { color: markKind('HALLAZGO').color, symbol: 'square' };
}

/** Texto oscuro o blanco según la luminancia del fondo, para contraste AA en el número. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (1.05 / (l + 0.05)) >= 4.5 ? '#ffffff' : '#19252E';
}

export type FacialTool =
  | 'select'
  | 'hand'
  | 'point'
  | 'zone'
  | 'line'
  | 'arrow'
  | 'freehand'
  | 'ellipse'
  | 'rect'
  | 'polygon'
  | 'text'
  | 'eraser';

export const FACIAL_TOOLS: Array<{ key: FacialTool; label: string; hint: string; shape?: AesShape }> = [
  { key: 'select', label: 'Seleccionar', hint: 'Seleccione o mueva una marca (Mayús para varias)' },
  { key: 'hand', label: 'Mover vista', hint: 'Arrastre para desplazar el rostro' },
  { key: 'point', label: 'Punto', hint: 'Toque el rostro para crear un punto', shape: 'point' },
  { key: 'zone', label: 'Zona', hint: 'Toque una región para marcarla completa', shape: 'zone' },
  { key: 'line', label: 'Línea', hint: 'Arrastre para trazar una línea', shape: 'line' },
  { key: 'arrow', label: 'Flecha', hint: 'Arrastre para trazar una flecha', shape: 'arrow' },
  { key: 'freehand', label: 'Trazo libre', hint: 'Dibuje con el mouse, lápiz o dedo', shape: 'freehand' },
  { key: 'ellipse', label: 'Círculo', hint: 'Arrastre para trazar un círculo u óvalo', shape: 'ellipse' },
  { key: 'rect', label: 'Rectángulo', hint: 'Arrastre para trazar un rectángulo', shape: 'rect' },
  { key: 'polygon', label: 'Contorno', hint: 'Toque los vértices; cierre con doble toque o Enter', shape: 'polygon' },
  { key: 'text', label: 'Texto', hint: 'Toque donde quiere la etiqueta', shape: 'text' },
  { key: 'eraser', label: 'Borrar', hint: 'Toque una marca en borrador para quitarla' },
];

/** Íconos de línea propios de las herramientas (viewBox 24×24, misma familia que hab-icon). */
export const TOOL_ICONS: Record<FacialTool, string> = {
  select: 'M5 3l13 7-6 1.5L9 18z M12 11.5l5 6',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11 M11 10V4a1.5 1.5 0 0 1 3 0v6 M14 10V5.5a1.5 1.5 0 0 1 3 0V13 M8 12.5 6.6 11a1.6 1.6 0 0 0-2.4 2.1L8 18.5A6 6 0 0 0 13 21h1a5 5 0 0 0 5-5v-5a1.5 1.5 0 0 0-2-1.4',
  point: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3',
  zone: 'M12 3c5 0 8 3.5 8 8.5S16 21 12 21s-8-4.5-8-9.5S7 3 12 3z M8 10h8 M7 14h10',
  line: 'M5 19 19 5',
  arrow: 'M5 19 19 5 M10 5h9v9',
  freehand: 'M3 17c3-6 5-9 7-6s1 7 4 5 4-7 7-9',
  ellipse: 'M12 5c5 0 9 3.1 9 7s-4 7-9 7-9-3.1-9-7 4-7 9-7z',
  rect: 'M4 6h16v12H4z',
  polygon: 'M12 3l8 6-3 10H7L4 9z',
  text: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  eraser: 'M16 3l5 5-11 11H5l-2-2z M9 9l6 6 M10 19h11',
};

export type FacialLayer = 'base' | 'regions' | 'planned' | 'performed' | 'findings' | 'drawings' | 'labels' | 'callouts';

export const FACIAL_LAYERS: Array<{ key: FacialLayer; label: string }> = [
  { key: 'base', label: 'Rostro base' },
  { key: 'regions', label: 'Regiones anatómicas' },
  { key: 'planned', label: 'Procedimientos planeados' },
  { key: 'performed', label: 'Procedimientos realizados' },
  { key: 'findings', label: 'Hallazgos y eventos' },
  { key: 'drawings', label: 'Notas y trazos' },
  { key: 'labels', label: 'Numeración' },
  { key: 'callouts', label: 'Rótulos de regiones' },
];

export type FaceSex = 'F' | 'M';
export type FaceFamily = 'frontal' | 'oblicua' | 'perfil';

/**
 * Rostros de referencia (personas ficticias, sin marcas) y su ubicación en el viewBox 200×260.
 * El desplazamiento alinea ojos, labios y mentón con la geometría de facial-regions.ts.
 */
export const FACE_PHOTOS: Record<FaceSex, Record<FaceFamily, { src: string; x: number; y: number; bg: string }>> = {
  F: {
    frontal: { src: 'facial-map/mujer-frontal.jpg', x: -2, y: 0, bg: '#F0EBE7' },
    oblicua: { src: 'facial-map/mujer-oblicua.jpg', x: 0, y: 0, bg: '#EEE9E5' },
    perfil: { src: 'facial-map/mujer-perfil.jpg', x: 0, y: 0, bg: '#F0EBE7' },
  },
  M: {
    frontal: { src: 'facial-map/hombre-frontal.jpg', x: -2.5, y: 0.5, bg: '#EEE9E5' },
    oblicua: { src: 'facial-map/hombre-oblicua.jpg', x: -7.3, y: 0.8, bg: '#ECE7E3' },
    perfil: { src: 'facial-map/hombre-perfil.jpg', x: -16.9, y: -5.2, bg: '#ECE7E3' },
  },
};

/** Alto de la foto en unidades del lienzo (ancho 200, proporción 3:4). */
export const FACE_PHOTO_H = 266.67;

export function faceSexFrom(sexAtBirth: string | null | undefined): FaceSex {
  return /^m/i.test(sexAtBirth ?? '') ? 'M' : 'F';
}

export function layerOf(a: AesAnnotation): FacialLayer {
  const status = markStatus(a);
  if (status) return status === 'PLANEADO' ? 'planned' : 'performed';
  if (a.kind === 'NOTA') return 'drawings';
  return 'findings';
}
