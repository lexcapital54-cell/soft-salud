import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (
  fonts: Record<string, unknown>,
) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.EventEmitter & {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    end: () => void;
  };
};
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Patient } from '@prisma/client';
import type { OrthoEpicrisisSummary } from './ortho-epicrisis';

export interface EpicrisisProvider {
  name: string;
  address?: string | null;
  phone?: string | null;
  nit?: string | null;
  habilitationCode?: string | null;
}

export interface EpicrisisProfessional {
  fullName: string;
  professionalCard?: string | null;
  signatureBase64?: string | null;
}

const COLOR = { title: '#0B5563', accent: '#1B998B', muted: '#5B7178', line: '#CBD5E1' };

@Injectable()
export class OrthoEpicrisisPdfService {
  private readonly logger = new Logger(OrthoEpicrisisPdfService.name);
  private readonly printer = new PdfPrinter({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  });

  build(input: {
    provider: EpicrisisProvider;
    patient: Patient;
    professional: EpicrisisProfessional;
    summary: OrthoEpicrisisSummary;
    recordCode: string;
  }): Promise<Buffer> {
    return this.render(this.document(input));
  }

  fileName(patient: Patient) {
    const last = (patient.lastName || 'paciente').replace(/\s+/g, '_');
    return `Epicrisis_ortodoncia_${last}_${patient.documentNumber || 'sin-doc'}.pdf`.replace(/[^\w.-]+/g, '_');
  }

  private document({
    provider,
    patient,
    professional,
    summary: s,
    recordCode,
  }: {
    provider: EpicrisisProvider;
    patient: Patient;
    professional: EpicrisisProfessional;
    summary: OrthoEpicrisisSummary;
    recordCode: string;
  }): TDocumentDefinitions {
    const day = (d?: Date | string | null) =>
      d ? new Date(d).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long' }) : '—';
    const patientName = [patient.firstName, patient.middleName, patient.lastName, patient.secondLastName]
      .filter(Boolean)
      .join(' ');
    const age = patient.birthDate
      ? Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / (365.25 * 86_400_000))
      : null;
    const habilitation = [
      provider.nit ? `NIT ${provider.nit}` : 'NIT: sin registrar',
      provider.habilitationCode
        ? `Código de habilitación REPS ${provider.habilitationCode}`
        : 'Código de habilitación REPS: sin registrar',
    ].join('   ·   ');
    const contact = [provider.address, provider.phone && `Tel. ${provider.phone}`].filter(Boolean).join('   ·   ');

    const body: Content[] = [
      { text: provider.name, fontSize: 15, bold: true, color: COLOR.title, alignment: 'center' },
      { text: habilitation, fontSize: 8.5, color: COLOR.muted, alignment: 'center', margin: [0, 2, 0, 0] },
      ...(contact ? [{ text: contact, fontSize: 8.5, color: COLOR.muted, alignment: 'center' as const }] : []),
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: COLOR.accent }],
        margin: [0, 8, 0, 8],
      },
      { text: 'EPICRISIS — CIERRE DE TRATAMIENTO DE ORTODONCIA', fontSize: 12.5, bold: true, alignment: 'center' },
      {
        text: `Historia clínica ${recordCode || '—'}   ·   Generada el ${day(new Date())}`,
        fontSize: 8.5,
        color: COLOR.muted,
        alignment: 'center',
        margin: [0, 2, 0, 6],
      },

      this.band('Datos del paciente'),
      this.grid([
        ['Nombre', patientName],
        ['Documento', [patient.documentType, patient.documentNumber].filter(Boolean).join(' ')],
        ['Fecha de nacimiento', patient.birthDate ? `${day(patient.birthDate)}${age !== null ? ` (${age} años)` : ''}` : ''],
        ['Sexo', patient.sexAtBirth || ''],
        ['EPS / régimen', [patient.eps, patient.regime].filter(Boolean).join(' · ')],
        ['Teléfono', patient.phone || ''],
      ]),

      this.band('Diagnóstico inicial'),
      s.initialDiagnoses.length
        ? {
            table: {
              widths: [60, '*', 60],
              body: [
                [this.th('CIE-10'), this.th('Descripción'), this.th('Tipo')],
                ...s.initialDiagnoses.map((d) => [
                  { text: d.code, fontSize: 9, bold: true },
                  { text: d.description, fontSize: 9 },
                  { text: d.primary ? 'Principal' : 'Relacionado', fontSize: 9 },
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 6],
          }
        : { text: 'Sin diagnósticos CIE-10 registrados en la historia.', fontSize: 9, italics: true, margin: [0, 0, 0, 6] },
      this.grid([
        ['Diagnóstico ortodóntico', s.orthoDiagnosis],
        ['Clase esquelética', s.skeletalClass],
      ]),

      this.band('Resumen del tratamiento'),
      this.grid([
        ['Fecha de inicio (instalación)', day(s.startDate)],
        ['Fecha final (retiro)', s.endDate ? day(s.endDate) : s.startDate ? 'En curso' : '—'],
        ['Duración', s.months !== null ? `${String(s.months).replace('.', ',')} meses` : '—'],
        ['Controles registrados', String(s.controls)],
        ['Última fase', s.lastPhase],
        ['Aparatología', s.appliance],
        ['Extracciones', s.extractions],
        ['Objetivos', s.objectives],
      ]),
      ...(s.cups.length
        ? [
            { text: 'Procedimientos (CUPS)', fontSize: 9.5, bold: true, color: COLOR.title, margin: [0, 2, 0, 2] as [number, number, number, number] },
            {
              table: {
                widths: [60, '*', 50],
                body: [
                  [this.th('CUPS'), this.th('Descripción'), this.th('Veces')],
                  ...s.cups.map((c) => [
                    { text: c.code, fontSize: 9, bold: true },
                    { text: c.description, fontSize: 9 },
                    { text: String(c.count), fontSize: 9, alignment: 'center' as const },
                  ]),
                ],
              },
              layout: 'lightHorizontalLines',
              margin: [0, 0, 0, 6] as [number, number, number, number],
            },
          ]
        : []),

      this.band('Estado de los retenedores'),
      this.grid([
        ['Estado', s.retention.status],
        ['Último control de retención', s.retention.lastControl ? day(s.retention.lastControl) : '—'],
        ['Plan de retención', s.retention.plan],
      ]),

      ...(s.closure.caseStatus || s.closure.treatmentResult
        ? [
            this.band('Resultado del tratamiento'),
            this.grid([
              ['Fecha de cierre', s.closure.closedAt ? day(`${s.closure.closedAt}T12:00:00`) : ''],
              ['Estado del caso', s.closure.caseStatus],
              ['Resultado', s.closure.treatmentResult],
            ]),
          ]
        : []),

      {
        columns: [this.signatureBox('Profesional tratante', professional.signatureBase64, [
          professional.fullName,
          professional.professionalCard ? `T.P. ${professional.professionalCard}` : '',
        ]), this.signatureBox('Paciente o acudiente', null, [
          patientName,
          [patient.documentType, patient.documentNumber].filter(Boolean).join(' '),
        ])],
        columnGap: 30,
        margin: [0, 28, 0, 0],
        unbreakable: true,
      },
      {
        text:
          'Documento generado a partir de la historia clínica electrónica y de las notas de evolución firmadas, que no se modifican. ' +
          'Las correcciones posteriores se registran como notas aclaratorias.',
        fontSize: 7.5,
        color: COLOR.muted,
        italics: true,
        margin: [0, 18, 0, 0],
      },
    ];

    return {
      pageSize: 'LETTER',
      pageMargins: [48, 40, 48, 48],
      defaultStyle: { font: 'Helvetica', fontSize: 9.5, color: '#1a1a1a' },
      info: { title: `Epicrisis de ortodoncia — ${patientName}` },
      footer: (current: number, total: number) => ({
        columns: [
          { text: provider.name, fontSize: 7.5, color: COLOR.muted },
          { text: `Página ${current} de ${total}`, fontSize: 7.5, color: COLOR.muted, alignment: 'right' },
        ],
        margin: [48, 12, 48, 0],
      }),
      content: body,
    };
  }

  private band(title: string): Content {
    return {
      table: {
        widths: ['*'],
        body: [[{ text: title.toUpperCase(), bold: true, color: '#FFFFFF', fontSize: 9.5, fillColor: COLOR.title, margin: [8, 4, 8, 4] }]],
      },
      layout: 'noBorders',
      margin: [0, 8, 0, 4],
    };
  }

  private th(text: string): TableCell {
    return { text, bold: true, fontSize: 8.5, color: COLOR.title };
  }

  private grid(rows: Array<[string, string]>): Content {
    return {
      table: {
        widths: ['34%', '66%'],
        body: rows.map(([label, value]) => [
          { text: label, bold: true, fontSize: 9, color: COLOR.title },
          { text: value || '—', fontSize: 9 },
        ]),
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 4],
    };
  }

  private signatureBox(title: string, image: string | null | undefined, lines: string[]): Content {
    return {
      stack: [
        image && image.startsWith('data:image')
          ? { image, fit: [180, 60], alignment: 'center', margin: [0, 0, 0, 2] }
          : { text: ' ', margin: [0, 0, 0, 60] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 240, y2: 0, lineWidth: 0.8, lineColor: COLOR.line }] },
        { text: title, bold: true, fontSize: 9, margin: [0, 4, 0, 0] },
        ...lines.filter(Boolean).map((l) => ({ text: l, fontSize: 8.5, color: COLOR.muted })),
      ],
    };
  }

  private render(doc: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const chunks: Buffer[] = [];
        const pdf = this.printer.createPdfKitDocument(doc);
        pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
        pdf.on('error', (err: Error) => reject(err));
        pdf.end();
      } catch (error) {
        this.logger.error('Error generando la epicrisis', error);
        reject(error);
      }
    });
  }
}
