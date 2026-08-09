import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.ReadableStream & {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    end: () => void;
  };
};
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export type TrainingActaPdfInput = {
  clinicName: string;
  tema: string;
  fecha: string;
  capacitadorNombre: string;
  asistenteNombre: string;
  objetivo: string;
  periodLabel?: string | null;
  capacitadorSignatureBase64: string;
  asistenteSignatureBase64: string;
};

/**
 * Genera el PDF del acta de capacitación con los campos diligenciados y las
 * firmas (imagen) pegadas exactamente bajo las etiquetas "Firma Capacitador"
 * y "Firma Asistente".
 */
@Injectable()
export class TrainingActaPdfService {
  private readonly printer = new PdfPrinter({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  });

  async build(input: TrainingActaPdfInput): Promise<Buffer> {
    const capSig = this.toDataUrl(input.capacitadorSignatureBase64);
    const asiSig = this.toDataUrl(input.asistenteSignatureBase64);

    const dotted = (value: string): Content => ({
      text: value || '…………………………………………………………',
      margin: [0, 2, 0, 10],
      decoration: value ? undefined : 'underline',
    });

    const content: Content[] = [
      {
        text: 'ACTA DE CAPACITACIÓN — SG-SST',
        style: 'title',
        alignment: 'center',
        margin: [0, 0, 0, 4],
      },
      {
        text: input.clinicName,
        alignment: 'center',
        color: '#47656b',
        margin: [0, 0, 0, 16],
      },
      {
        text: 'Decreto 1072 de 2015 · Resolución 0312 de 2019',
        alignment: 'center',
        fontSize: 9,
        color: '#6a8085',
        margin: [0, 0, 0, 18],
      },

      { text: 'Tema', style: 'label' },
      dotted(input.tema),

      {
        columns: [
          {
            width: '*',
            stack: [{ text: 'Fecha', style: 'label' }, dotted(input.fecha)],
          },
          {
            width: '*',
            stack: [
              { text: 'Periodo', style: 'label' },
              dotted(input.periodLabel || '—'),
            ],
          },
        ],
        columnGap: 16,
      },

      { text: 'Capacitador (quien aprueba la capacitación)', style: 'label' },
      dotted(input.capacitadorNombre),

      { text: 'Persona evaluada / asistente', style: 'label' },
      dotted(input.asistenteNombre),

      { text: 'Objetivo de la capacitación', style: 'label' },
      {
        text: input.objetivo || '……………………………………………………………………………………',
        margin: [0, 2, 0, 18],
      },

      {
        text: 'Registro de asistencia y comprensión',
        style: 'section',
        margin: [0, 8, 0, 8],
      },
      {
        text:
          'Los abajo firmantes declaran haber recibido la capacitación en el tema indicado, ' +
          'haber comprendido su contenido y comprometerse a aplicar las medidas de Seguridad ' +
          'y Salud en el Trabajo en el consultorio.',
        fontSize: 10,
        color: '#17323a',
        margin: [0, 0, 0, 22],
      },

      {
        text: 'FIRMAS',
        style: 'section',
        alignment: 'center',
        margin: [0, 8, 0, 16],
      },

      {
        columns: [
          {
            width: '*',
            stack: this.signatureBlock(
              'Firma Capacitador',
              input.capacitadorNombre,
              capSig,
            ),
          },
          { width: 24, text: '' },
          {
            width: '*',
            stack: this.signatureBlock(
              'Firma Asistente / Evaluado',
              input.asistenteNombre,
              asiSig,
            ),
          },
        ],
      },

      {
        text:
          'Documento generado por HABILISALUD. Las firmas imagen quedan incrustadas en este PDF; ' +
          'la versión anterior del expediente se conserva en el histórico.',
        fontSize: 8,
        color: '#8f8f8f',
        margin: [0, 36, 0, 0],
      },
    ];

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageMargins: [48, 48, 48, 48],
      content,
      styles: {
        title: { fontSize: 14, bold: true, color: '#003d4c' },
        label: {
          fontSize: 9,
          bold: true,
          color: '#0d7377',
          margin: [0, 8, 0, 0],
        },
        section: { fontSize: 11, bold: true, color: '#003d4c' },
      },
      defaultStyle: { font: 'Helvetica', fontSize: 11, color: '#003d4c' },
    };

    return this.render(docDefinition);
  }

  private signatureBlock(
    title: string,
    name: string,
    signatureDataUrl: string,
  ): Content[] {
    return [
      {
        text: title,
        style: 'label',
        alignment: 'center',
        margin: [0, 0, 0, 8],
      },
      {
        image: signatureDataUrl,
        width: 160,
        height: 64,
        alignment: 'center',
        margin: [0, 0, 0, 4],
      },
      {
        canvas: [
          {
            type: 'line',
            x1: 20,
            y1: 0,
            x2: 200,
            y2: 0,
            lineWidth: 0.8,
            lineColor: '#003d4c',
          },
        ],
        alignment: 'center',
      },
      {
        text: name,
        alignment: 'center',
        fontSize: 10,
        margin: [0, 6, 0, 0],
      },
      {
        text: '…………………………………………',
        alignment: 'center',
        fontSize: 9,
        color: '#8f8f8f',
      },
    ];
  }

  private toDataUrl(raw: string) {
    const value = raw.trim();
    if (value.startsWith('data:image')) return value;
    return `data:image/png;base64,${value}`;
  }

  private render(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }
}
