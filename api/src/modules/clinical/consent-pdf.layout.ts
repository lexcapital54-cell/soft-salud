import type { Content, DynamicContent, StyleDictionary } from 'pdfmake/interfaces';

/** Carta (612 pt). 2 cm ≈ 56.7 pt; arriba y abajo se deja espacio para encabezado y pie. */
export const CONSENT_PAGE_SIZE = 'LETTER';
export const CONSENT_PAGE_MARGINS: [number, number, number, number] = [57, 78, 57, 62];

export type ConsentPdfBrand = {
  clinicName: string;
  clinicNit?: string | null;
  clinicHabilitationCode?: string | null;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  documentCode: string;
  documentVersion: number;
};

export function brandIdLine(brand: ConsentPdfBrand): string {
  return [
    brand.clinicNit ? `NIT ${brand.clinicNit}` : null,
    brand.clinicHabilitationCode ? `REPS ${brand.clinicHabilitationCode}` : null,
    brand.clinicAddress,
    brand.clinicPhone,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Encabezado institucional repetido en todas las páginas. */
export function consentPdfHeader(brand: ConsentPdfBrand): DynamicContent {
  return () => ({
    margin: [57, 24, 57, 0],
    stack: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: brand.clinicName, style: 'headerClinic' },
              { text: brandIdLine(brand) || ' ', style: 'headerMeta' },
            ],
          },
          {
            width: 'auto',
            alignment: 'right',
            stack: [
              { text: 'DOCUMENTO SELLADO', style: 'sealBadge' },
              {
                text: `${brand.documentCode} · v${brand.documentVersion}`,
                style: 'headerMeta',
              },
            ],
          },
        ],
      },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 498, y2: 0, lineWidth: 1, lineColor: '#0D7377' },
        ],
        margin: [0, 6, 0, 0],
      },
    ],
  });
}

/** Pie con trazabilidad corta y numeración «Página X de Y». */
export function consentPdfFooter(hash: string, consentId: string): DynamicContent {
  return (currentPage: number, pageCount: number) => ({
    margin: [57, 14, 57, 0],
    columns: [
      {
        width: '*',
        text: `SHA-256 ${hash.slice(0, 32)}… · ID ${consentId.slice(0, 8)} · HABILISALUD`,
        style: 'footerMeta',
      },
      {
        width: 'auto',
        text: `Página ${currentPage} de ${pageCount}`,
        style: 'footerMeta',
        alignment: 'right',
      },
    ],
  });
}

export function sectionTitle(text: string): Content {
  return { text, style: 'section', margin: [0, 14, 0, 6] };
}

export function signatureBlock(opts: {
  label: string;
  image?: string | null;
  name: string;
  stamp: string;
}): Content {
  const image = opts.image
    ? opts.image.startsWith('data:')
      ? opts.image
      : `data:image/png;base64,${opts.image}`
    : null;
  return {
    unbreakable: true,
    stack: [
      { text: opts.label, style: 'muted', margin: [0, 0, 0, 6] },
      image
        ? { image, fit: [200, 80], margin: [0, 0, 0, 4] }
        : { text: '(Sin firma registrada)', style: 'muted', margin: [0, 28, 0, 12] },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.8, lineColor: '#9ca3af' },
        ],
      },
      { text: opts.name, style: 'signName', margin: [0, 4, 0, 0] },
      { text: opts.stamp, style: 'muted' },
    ],
  };
}

export const CONSENT_PDF_STYLES: StyleDictionary = {
  headerClinic: { fontSize: 11, bold: true, color: '#003D4C' },
  headerMeta: { fontSize: 8, color: '#6b7280' },
  sealBadge: { fontSize: 8, bold: true, color: '#003D4C', characterSpacing: 0.6 },
  footerMeta: { fontSize: 7.5, color: '#6b7280' },
  title: { fontSize: 13, bold: true, color: '#003D4C', alignment: 'center', margin: [0, 0, 0, 4] },
  section: { fontSize: 11, bold: true, color: '#0D7377' },
  muted: { fontSize: 8.5, color: '#6b7280' },
  signName: { fontSize: 9, bold: true, color: '#1f2937' },
  footerNote: { fontSize: 8, color: '#6b7280', italics: true },
  body: { fontSize: 10, alignment: 'justify', margin: [0, 0, 0, 6] },
  heading: { fontSize: 11, bold: true, color: '#003D4C', margin: [0, 8, 0, 4] },
  detailTitle: { fontSize: 10, bold: true, color: '#003D4C', margin: [0, 6, 0, 3] },
};
