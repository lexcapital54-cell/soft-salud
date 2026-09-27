import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.EventEmitter & {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    end: () => void;
  };
};
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  ClinicalNoteFormat,
  ClinicSpecialty,
  Encounter,
  Patient,
  User,
} from '@prisma/client';

type EncounterPdfRow = Encounter & {
  patient: Patient;
  professional: Pick<User, 'id' | 'fullName' | 'professionalCard' | 'email'>;
  clinicalRecord: {
    id: string;
    status: string;
    noteFormat: ClinicalNoteFormat;
    content: unknown;
    signedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    evolutions: Array<{
      id: string;
      signedAt: Date | null;
      clinicalAttentionDate?: Date | null;
      content: unknown;
      author: { fullName: string; professionalCard: string | null };
    }>;
  } | null;
  diagnoses: Array<{
    cieCode: string;
    description: string | null;
    type: string | null;
    isPrimary: boolean;
  }>;
  procedures: Array<{
    cupsCode: string;
    description: string | null;
    quantity: number | null;
  }>;
};

/** Firma del paciente para el PDF (contenido de la HC o consentimiento sellado). */
export type PatientSignatureInfo = {
  image: string;
  signerName?: string | null;
  signerRole?: string | null;
  signedAt?: Date | string | null;
};

type ClinicInfo = {
  name: string;
  address?: string | null;
  phone?: string | null;
  specialty?: ClinicSpecialty | string | null;
};

/** Paleta del membrete de psicología. */
const PSI_THEME = {
  title: '#2A1F1C',
  accent: '#C48B7E',
  rose: '#E1B7AD',
  gold: '#C9A46A',
  muted: '#7A6A66',
  body: '#1a1a1a',
};

/** Paleta HC-FT-001 (fisioterapia — plantilla azul). */
const FT_THEME = {
  title: '#004A8C',
  accent: '#0072CE',
  rose: '#0072CE',
  gold: '#004A8C',
  muted: '#5A6F85',
  body: '#1a1a1a',
  light: '#E1F0FF',
};

/** Paleta HabiliSALUD genérica (otras especialidades). */
const DEFAULT_THEME = {
  title: '#003D4C',
  accent: '#0D7377',
  rose: '#0D7377',
  gold: '#0D7377',
  muted: '#64748b',
  body: '#1a1a1a',
};

@Injectable()
export class HcePdfService {
  private readonly logger = new Logger(HcePdfService.name);
  private readonly printer: InstanceType<typeof PdfPrinter>;
  private membreteCache: { left: string } | null = null;

  constructor() {
    this.printer = new PdfPrinter({
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    });
  }

  async buildPdfBuffer(
    encounter: EncounterPdfRow,
    clinic: ClinicInfo,
    patientSignature?: PatientSignatureInfo | null,
  ): Promise<Buffer> {
    const specialty = this.resolveSpecialty(encounter, clinic);
    const images =
      specialty === ClinicSpecialty.PSYCHOLOGY
        ? this.loadMembreteImages()
        : null;
    const doc = this.buildDocument(encounter, clinic, specialty, images, patientSignature ?? null);
    return this.renderBuffer(doc);
  }

  suggestedFileName(encounter: EncounterPdfRow): string {
    const doc = encounter.patient.documentNumber || 'sin-doc';
    const code = encounter.externalCode || encounter.id.slice(0, 8);
    const last = (encounter.patient.lastName || 'paciente').replace(/\s+/g, '_');
    return `HC_${last}_${doc}_${code}.pdf`.replace(/[^\w.-]+/g, '_');
  }

  private resolveSpecialty(
    encounter: EncounterPdfRow,
    clinic: ClinicInfo,
  ): ClinicSpecialty | string {
    return (
      clinic.specialty ||
      encounter.specialtySnapshot ||
      ClinicSpecialty.PSYCHOLOGY
    );
  }

  private themeFor(specialty: ClinicSpecialty | string) {
    if (specialty === ClinicSpecialty.PSYCHOLOGY) return PSI_THEME;
    if (specialty === ClinicSpecialty.PHYSIOTHERAPY) return FT_THEME;
    return DEFAULT_THEME;
  }

  private loadMembreteImages() {
    if (this.membreteCache) return this.membreteCache;
    const leftPath = this.resolveAsset('banner-left.png');
    this.membreteCache = {
      left: `data:image/png;base64,${fs.readFileSync(leftPath).toString('base64')}`,
    };
    return this.membreteCache;
  }

  private tryAsset(fileName: string) {
    const candidates = [
      path.join(process.cwd(), 'assets', 'hce-membrete', fileName),
      path.join(process.cwd(), 'api', 'assets', 'hce-membrete', fileName),
      path.join(__dirname, '..', '..', '..', 'assets', 'hce-membrete', fileName),
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
  }

  private resolveAsset(fileName: string) {
    const found = this.tryAsset(fileName);
    if (!found) {
      throw new Error(`Membrete no encontrado: ${fileName}`);
    }
    return found;
  }

  private buildDocument(
    encounter: EncounterPdfRow,
    clinic: ClinicInfo,
    specialty: ClinicSpecialty | string,
    images: { left: string } | null,
    patientSignature: PatientSignatureInfo | null,
  ): TDocumentDefinitions {
    const theme = this.themeFor(specialty);
    const isPsychology = specialty === ClinicSpecialty.PSYCHOLOGY;
    const patient = encounter.patient;
    const record = encounter.clinicalRecord;
    const content = (record?.content || {}) as Record<string, unknown>;
    const patientName = [patient.firstName, patient.lastName, patient.secondLastName]
      .filter(Boolean)
      .join(' ');
    const fmt = (d?: Date | string | null) =>
      d
        ? new Date(d).toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '—';

    const specialtyLabel =
      specialty === ClinicSpecialty.PHYSIOTHERAPY
        ? 'Historia clínica — Fisioterapia'
        : specialty === ClinicSpecialty.PSYCHOLOGY
          ? 'Historia clínica — Psicología'
          : 'Historia clínica';
    const isPhysio = specialty === ClinicSpecialty.PHYSIOTHERAPY;

    const body: Content[] = [
      {
        text: isPhysio ? 'HISTORIA CLÍNICA FISIOTERAPIA' : 'HISTORIA CLÍNICA',
        style: 'docTitle',
        alignment: 'center',
        margin: [0, 0, 0, 4],
      },
      {
        text:
          record?.noteFormat === ClinicalNoteFormat.SOAP
            ? 'Nota de evolución (SOAP)'
            : isPhysio
              ? 'HC-FT-001'
              : specialtyLabel,
        style: 'docSubtitle',
        alignment: 'center',
        margin: [0, 0, 0, 8],
      },
      this.metaTable(
        [
          ['Consecutivo', encounter.externalCode || '—'],
          ['Estado', record?.status === 'SIGNED' ? 'Sellada' : 'Borrador'],
          [
            'Fecha digitación',
            fmt((content.documentedAt as string) || record?.createdAt),
          ],
          ['Paciente', patientName],
          ['Documento', `${patient.documentType} ${patient.documentNumber}`],
          ['Profesional', encounter.professional.fullName],
          [
            'Tarjeta profesional',
            encounter.professional.professionalCard || '—',
          ],
          [
            'Modalidad',
            encounter.modality === 'VIRTUAL' ? 'Virtual' : 'Presencial',
          ],
          ['Servicio', encounter.serviceType || 'Consulta externa'],
          ['IPS / consultorio', clinic.name],
        ],
        theme.title,
      ),
    ];

    if (record?.noteFormat === ClinicalNoteFormat.SOAP) {
      const soap = (content.soap || {}) as Record<string, string>;
      body.push(
        this.section('Subjetivo', soap.subjective, theme.title),
        this.section('Objetivo', soap.objective, theme.title),
        this.section('Análisis', soap.assessment, theme.title),
        this.section('Plan', soap.plan, theme.title),
      );
    } else if (specialty === ClinicSpecialty.PHYSIOTHERAPY) {
      const care = (content.careMinimum || {}) as Record<string, unknown>;
      const physio = (content.physiotherapy || {}) as Record<string, unknown>;
      const assessment = (content.assessment || {}) as Record<string, unknown>;
      const band = { banded: true as const };
      body.push(
        this.section('Motivo de consulta', care.motive as string, theme.title, band),
        this.section(
          'Enfermedad actual',
          care.presentIllness as string,
          theme.title,
          band,
        ),
        this.section(
          'Diagnóstico fisioterapéutico',
          physio.physioDiagnosis as string,
          theme.title,
          band,
        ),
        this.section('Hallazgos', physio.findings as string, theme.title, band),
        this.section(
          'Objetivos del tratamiento',
          physio.treatmentObjectives as string,
          theme.title,
          band,
        ),
        this.section(
          'Plan de intervención',
          physio.interventionPlan as string,
          theme.title,
          band,
        ),
        this.section(
          'Impresión diagnóstica',
          assessment.impressionNarrative as string,
          theme.title,
          band,
        ),
      );
    } else {
      const care = (content.careMinimum || {}) as Record<string, unknown>;
      const mental = (content.mentalExam || {}) as Record<string, string>;
      const assessment = (content.assessment || {}) as Record<string, unknown>;
      body.push(
        this.section('Motivo de consulta', care.motive as string, theme.title),
        this.section(
          'Enfermedad actual',
          care.presentIllness as string,
          theme.title,
        ),
        this.section('Antecedentes', care.antecedents as string, theme.title),
        this.section(
          'Revisión por sistemas',
          care.systemsReview as string,
          theme.title,
        ),
        ...this.mentalExamSections(mental, theme.title),
        this.section(
          'Impresión diagnóstica',
          assessment.impressionNarrative as string,
          theme.title,
        ),
        this.section(
          'Observaciones',
          assessment.observations as string,
          theme.title,
        ),
        this.section(
          'Plan de manejo',
          Array.isArray(assessment.managementPlan)
            ? (assessment.managementPlan as string[]).filter(Boolean).join('\n')
            : '',
          theme.title,
        ),
      );
    }

    if (encounter.diagnoses?.length) {
      body.push({
        text: 'Diagnósticos (CIE-10)',
        style: 'sectionTitle',
        alignment: 'center',
        margin: [0, 8, 0, 4],
      });
      body.push({
        table: {
          widths: ['18%', '*', '14%'],
          body: [
            ['Código', 'Descripción', 'Tipo'],
            ...encounter.diagnoses.map((d) => [
              d.cieCode,
              { text: d.description || '', alignment: 'justify' as const },
              d.isPrimary ? 'Principal' : d.type || '',
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      });
    }

    if (encounter.procedures?.length) {
      body.push({
        text: 'Procedimientos (CUPS)',
        style: 'sectionTitle',
        alignment: 'center',
        margin: [0, 6, 0, 4],
      });
      body.push({
        table: {
          widths: ['18%', '*', '10%'],
          body: [
            ['Código', 'Descripción', 'Cant.'],
            ...encounter.procedures.map((p) => [
              p.cupsCode,
              { text: p.description || '', alignment: 'justify' as const },
              String(p.quantity ?? 1),
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      });
    }

    if (record?.evolutions?.length) {
      body.push({
        text: 'Notas de evolución',
        style: 'sectionTitle',
        alignment: 'center',
        margin: [0, 8, 0, 6],
      });
      for (const ev of record.evolutions) {
        const evContent = (ev.content || {}) as Record<string, unknown>;
        const situation = String(evContent.currentSituation || '').trim();
        body.push({
          stack: [
            {
              text: `${(evContent.reason as string) || 'Evolución'} · Fecha de atención: ${fmt(ev.clinicalAttentionDate ?? ev.signedAt)}`,
              style: 'evolutionHead',
            },
            {
              text: `Registrado en el sistema: ${fmt(ev.signedAt)}`,
              style: 'muted',
            },
            ...(situation
              ? [
                  {
                    text: `Situación actual: ${situation}`,
                    style: 'body',
                    alignment: 'justify' as const,
                    margin: [0, 2, 0, 2] as [number, number, number, number],
                  },
                ]
              : []),
            {
              text: String(evContent.note || ''),
              style: 'body',
              alignment: 'justify',
              margin: [0, 2, 0, 8],
            },
            {
              text: `${ev.author.fullName}${ev.author.professionalCard ? ` · TP ${ev.author.professionalCard}` : ''}`,
              style: 'muted',
            },
          ],
          margin: [0, 0, 0, 10],
        });
      }
    }

    const signature = (content.signature || {}) as Record<string, unknown>;
    body.push({
      text: 'Firma profesional',
      style: 'sectionTitle',
      alignment: 'center',
      margin: [0, 10, 0, 6],
    });
    body.push(
      this.metaTable(
        [
          [
            'Profesional',
            String(signature.professionalName || encounter.professional.fullName),
          ],
          [
            'Tarjeta',
            String(
              signature.professionalCard ||
                encounter.professional.professionalCard ||
                '—',
            ),
          ],
          [
            'Fecha de sellado',
            fmt(record?.signedAt || (signature.signedAt as string)),
          ],
          [
            'Código verificación',
            String(signature.verificationCode || '—'),
          ],
        ],
        theme.title,
      ),
    );

    if (signature.signatureBase64) {
      const img = String(signature.signatureBase64);
      body.push({
        image: img.startsWith('data:') ? img : `data:image/png;base64,${img}`,
        width: 180,
        margin: [0, 8, 0, 0],
      });
    }

    body.push({
      text: 'Firma del paciente / acudiente',
      style: 'sectionTitle',
      alignment: 'center',
      margin: [0, 16, 0, 6],
    });
    if (patientSignature?.image) {
      const img = patientSignature.image;
      body.push(
        this.metaTable(
          [
            ['Firmante', String(patientSignature.signerName || patientName)],
            [
              'Calidad',
              patientSignature.signerRole === 'LEGAL_GUARDIAN'
                ? 'Acudiente / representante legal'
                : 'Paciente',
            ],
            ['Fecha de firma', fmt(patientSignature.signedAt ?? null)],
          ],
          theme.title,
        ),
      );
      body.push({
        image: img.startsWith('data:') ? img : `data:image/png;base64,${img}`,
        width: 180,
        margin: [0, 8, 0, 0],
      });
    } else {
      body.push({
        text: 'Firma del paciente pendiente de registro.',
        style: 'muted',
        alignment: 'center',
      });
    }

    const professionalName =
      String(signature.professionalName || '').trim() || encounter.professional.fullName;
    const header: TDocumentDefinitions['header'] =
      isPsychology && images
        ? () =>
            ({
              columns: [
                {
                  canvas: [
                    {
                      type: 'rect',
                      x: 0,
                      y: 0,
                      w: 14,
                      h: 70,
                      color: theme.rose,
                    },
                    {
                      type: 'rect',
                      x: 18,
                      y: 0,
                      w: 1.5,
                      h: 70,
                      color: theme.gold,
                    },
                  ],
                  width: 28,
                  margin: [0, 0, 8, 0],
                },
                {
                  text: professionalName,
                  fontSize: 11,
                  bold: true,
                  color: theme.title,
                  width: '*',
                  margin: [4, 12, 0, 0],
                },
              ],
              margin: [40, 12, 40, 0],
            }) as Content
        : () =>
            ({
              columns: [
                {
                  canvas: isPhysio
                    ? [
                        {
                          type: 'rect',
                          x: 0,
                          y: 0,
                          w: 14,
                          h: 56,
                          color: theme.title,
                        },
                        {
                          type: 'rect',
                          x: 18,
                          y: 0,
                          w: 1.5,
                          h: 56,
                          color: theme.accent,
                        },
                      ]
                    : [],
                  width: isPhysio ? 28 : 0,
                  margin: [0, 0, isPhysio ? 8 : 0, 0],
                },
                {
                  text: clinic.name,
                  style: 'docSubtitle',
                  color: theme.title,
                  margin: [0, isPhysio ? 14 : 10, 0, 0],
                },
                {
                  text: isPhysio ? 'HC-FT-001' : specialtyLabel,
                  alignment: 'right',
                  style: 'muted',
                  color: theme.accent,
                  margin: [0, isPhysio ? 16 : 12, 0, 0],
                },
              ],
              margin: [52, 14, 52, 0],
            }) as Content;

    return {
      pageSize: 'LETTER',
      pageMargins: [52, isPsychology ? 96 : 72, 52, 68],
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 10,
        lineHeight: 1.35,
        color: theme.body,
        alignment: 'justify',
      },
      images: images
        ? {
            membreteLeft: images.left,
          }
        : {},
      header,
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: `${clinic.name}${clinic.phone ? ` · ${clinic.phone}` : ''}`,
            style: 'footer',
          },
          {
            text: `Página ${currentPage} de ${pageCount}`,
            alignment: 'right',
            style: 'footer',
          },
        ],
        margin: [52, 6, 52, 14],
      }),
      content: body,
      styles: {
        docTitle: {
          fontSize: 14,
          bold: true,
          color: theme.title,
          alignment: 'center',
        },
        docSubtitle: {
          fontSize: 10,
          color: theme.accent,
          alignment: 'center',
        },
        sectionTitle: {
          fontSize: 11,
          bold: true,
          color: theme.title,
          alignment: 'center',
        },
        evolutionHead: {
          fontSize: 10,
          bold: true,
          color: theme.title,
          alignment: 'center',
        },
        body: { fontSize: 10, alignment: 'justify' },
        muted: { fontSize: 8, color: theme.muted, alignment: 'center' },
        footer: { fontSize: 8, color: theme.muted },
      },
    };
  }

  /**
   * Examen mental una sola vez. Al guardar, la HC copia la descripción libre
   * (`narrative`) en `appearance` para RDA: un texto ya impreso no se repite.
   */
  private mentalExamSections(mental: Record<string, string>, titleColor: string): Content[] {
    const normalize = (v?: string | null) => (v || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const fields: Array<[string, string | undefined]> = [
      ['Examen mental', mental.narrative],
      ['Examen mental — aspecto', mental.appearance],
      ['Examen mental — conducta', mental.behavior],
      ['Examen mental — lenguaje', mental.speech],
      ['Examen mental — estado de ánimo', mental.mood],
      ['Examen mental — afecto', mental.affect],
      ['Examen mental — pensamiento', mental.thought],
      ['Examen mental — percepción', mental.perception],
      ['Examen mental — juicio', mental.judgment],
      ['Examen mental — insight', mental.insight],
    ];
    const printed = new Set<string>();
    const sections: Content[] = [];
    for (const [title, value] of fields) {
      const key = normalize(value);
      if (!key || printed.has(key)) continue;
      printed.add(key);
      sections.push(this.section(title, value, titleColor));
    }
    return sections;
  }

  private section(
    title: string,
    text?: string | null,
    titleColor = '#003D4C',
    options?: { banded?: boolean },
  ): Content {
    const value = (text || '').trim();
    if (!value) return { text: '' };
    if (options?.banded) {
      return {
        stack: [
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    text: title.toUpperCase(),
                    bold: true,
                    color: '#FFFFFF',
                    fontSize: 10,
                    fillColor: titleColor,
                    margin: [8, 5, 8, 5],
                  },
                ],
              ],
            },
            layout: 'noBorders',
            margin: [0, 8, 0, 3] as [number, number, number, number],
          },
          {
            text: value,
            style: 'body',
            alignment: 'justify',
            margin: [0, 0, 0, 6] as [number, number, number, number],
          },
        ],
        unbreakable: false,
      };
    }
    return {
      stack: [
        {
          text: title,
          fontSize: 11,
          bold: true,
          color: titleColor,
          alignment: 'center',
          margin: [0, 8, 0, 3] as [number, number, number, number],
        },
        {
          text: value,
          style: 'body',
          alignment: 'justify',
          margin: [0, 0, 0, 6] as [number, number, number, number],
        },
      ],
      unbreakable: false,
    };
  }

  private metaTable(rows: string[][], labelColor = '#003D4C'): Content {
    return {
      table: {
        widths: ['32%', '68%'],
        body: rows.map(([label, value]) => [
          {
            text: label,
            bold: true,
            color: labelColor,
            fontSize: 9,
            alignment: 'left',
          },
          { text: value || '—', fontSize: 9, alignment: 'justify' as const },
        ]),
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 6] as [number, number, number, number],
    };
  }

  private renderBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const chunks: Buffer[] = [];
        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', (err: Error) => reject(err));
        pdfDoc.end();
      } catch (error) {
        this.logger.error('Error generando PDF HCE', error);
        reject(error);
      }
    });
  }
}
