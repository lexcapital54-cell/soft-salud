/** Minúsculas y sin tildes: «depresion» encuentra «depresión». */
export function foldText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** «f411», «F41.1», «f4» → prefijo de código con el punto en su lugar («F41.1», «F4»); null si no parece un código. */
export function cieCodePrefix(query: string): string | null {
  const raw = query.replace(/[\s.]/g, '').toUpperCase();
  if (!/^[A-Z]\d{0,2}([\dX])?$/.test(raw) || (raw.length === 1 && query.trim().length > 1)) return null;
  return raw.length > 3 ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw;
}

/**
 * Siglas y palabras clave de uso clínico → prefijos CIE-10 que deben aparecer primero.
 * Solo orientan la búsqueda; el profesional elige el código.
 */
const CIE_KEYWORDS: Record<string, string[]> = {
  tdah: ['F90'],
  tda: ['F90'],
  hiperactividad: ['F90'],
  tag: ['F41.1'],
  ansiedad: ['F41', 'F40', 'F93'],
  panico: ['F41.0'],
  fobia: ['F40'],
  tept: ['F43.1'],
  estres: ['F43', 'Z73.3'],
  adaptacion: ['F43.2'],
  duelo: ['F43.2', 'Z63.4'],
  toc: ['F42'],
  obsesivo: ['F42', 'F60.5'],
  tea: ['F84'],
  autismo: ['F84'],
  asperger: ['F84.5'],
  depresion: ['F32', 'F33', 'F34.1', 'F41.2'],
  distimia: ['F34.1'],
  bipolar: ['F31'],
  tab: ['F31'],
  tlp: ['F60.3'],
  limite: ['F60.3'],
  borderline: ['F60.3'],
  personalidad: ['F60'],
  esquizofrenia: ['F20'],
  psicosis: ['F23', 'F29'],
  insomnio: ['F51.0', 'G47.0'],
  sueno: ['F51', 'G47'],
  anorexia: ['F50.0'],
  bulimia: ['F50.2'],
  alimentaria: ['F50'],
  alcohol: ['F10'],
  cannabis: ['F12'],
  marihuana: ['F12'],
  cocaina: ['F14'],
  tabaco: ['F17'],
  consumo: ['F1'],
  sustancias: ['F1'],
  suicida: ['R45.8', 'X6', 'X7', 'X80', 'X81', 'X82', 'X83', 'X84'],
  autolesion: ['X6', 'X7', 'X80', 'X81', 'X82', 'X83', 'X84'],
  oposicionista: ['F91.3'],
  conducta: ['F91'],
  aprendizaje: ['F81'],
  lenguaje: ['F80'],
  enuresis: ['F98.0'],
  encopresis: ['F98.1'],
  tics: ['F95'],
  demencia: ['F00', 'F01', 'F03'],
  pareja: ['Z63.0'],
  familia: ['Z63'],
  violencia: ['T74', 'Y07'],
  maltrato: ['T74'],
  abuso: ['T74', 'F1'],
  caries: ['K02'],
  gingivitis: ['K05.0', 'K05.1'],
  periodontitis: ['K05.2', 'K05.3'],
  maloclusion: ['K07'],
  lumbalgia: ['M54.5'],
  cervicalgia: ['M54.2'],
};

interface CieLike {
  code: string;
  description: string;
}

/** Fila con su texto ya normalizado (se calcula una vez al cargar el catálogo). */
export type IndexedCie<T extends CieLike> = T & { _code: string; _desc: string };

export function indexCie<T extends CieLike>(rows: T[]): IndexedCie<T>[] {
  return rows.map((r) => ({ ...r, _code: r.code.replace(/\./g, '').toUpperCase(), _desc: foldText(r.description) }));
}

/**
 * Búsqueda por relevancia: 1) inicio del código, 2) siglas/palabras clave, 3) descripción que
 * empieza por lo escrito, 4) descripción que contiene todas las palabras (en cualquier orden).
 */
export function rankCie<T extends CieLike>(rows: IndexedCie<T>[], query: string | undefined, take: number): T[] {
  const q = (query || '').trim();
  if (!q) return rows.slice(0, take);
  const prefix = cieCodePrefix(q)?.replace('.', '');
  const folded = foldText(q);
  const words = folded.split(/\s+/).filter(Boolean);
  const keywordCodes = (match: (key: string, word: string) => boolean) =>
    words.flatMap((w) =>
      Object.entries(CIE_KEYWORDS)
        .filter(([k]) => match(k, w))
        .flatMap(([, codes]) => codes.map((c) => c.replace('.', ''))),
    );
  const exactKeyword = words.length === 1 ? keywordCodes((k, w) => k === w) : [];
  const partialKeyword = keywordCodes((k, w) => k === w || (w.length >= 4 && k.startsWith(w)));

  const scored: Array<{ row: IndexedCie<T>; score: number }> = [];
  for (const row of rows) {
    let score = -1;
    if (prefix && row._code.startsWith(prefix)) score = 0;
    else if (exactKeyword.some((p) => row._code.startsWith(p)))
      score = 1 + exactKeyword.findIndex((p) => row._code.startsWith(p)) / 100;
    else if (words.every((w) => row._desc.includes(w))) score = row._desc.startsWith(words[0]) ? 2 : 3;
    else if (partialKeyword.some((p) => row._code.startsWith(p))) score = 4;
    else if (row._code.includes(folded.replace(/[\s.]/g, '').toUpperCase())) score = 5;
    if (score >= 0) scored.push({ row, score });
  }
  scored.sort((a, b) => a.score - b.score || a.row._code.localeCompare(b.row._code));
  return scored.slice(0, take).map(({ row }) => {
    const { _code: _c, _desc: _d, ...rest } = row;
    return rest as unknown as T;
  });
}
