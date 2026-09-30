import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (
  fonts: Record<string, unknown>,
) => {
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
import {
  DENTAL_ALLERGY_LABELS,
  DENTAL_CONSENT_LABELS,
  DENTAL_HABIT_LABELS,
  DENTAL_MEDICAL_CONDITION_LABELS,
  DENTAL_MEDICATION_GROUP_LABELS,
  DENTAL_ORDER_TYPE_LABELS,
  DENTAL_SERVICE_LABELS,
  DENTAL_SYMPTOM_LABELS,
  DENTAL_TOOTH_LABELS,
  DENTAL_TREATMENT_LABELS,
  DENTAL_TREATMENT_STATUS_LABELS,
  ORTHO_APPLIANCE_LABELS,
  ORTHO_BRACKET_LABELS,
  ORTHO_HABIT_LABELS,
  ORTHO_ELASTIC_LABELS,
  ORTHO_PLAN_PHASE_LABELS,
} from './dentistry-labels';

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

/** Paleta HC-ODO-001 (odontología — verde azulado). */
const ODO_THEME = {
  title: '#0B5563',
  accent: '#1B998B',
  rose: '#1B998B',
  gold: '#0B5563',
  muted: '#5B7178',
  body: '#1a1a1a',
};

const DENTAL_SURFACE_LABELS: Record<string, string> = {
  V: 'Vestibular',
  L: 'Lingual/Palatino',
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal/Incisal',
};

const DENTAL_SYSTEM_LABELS: Record<string, string> = {
  cardiovascular: 'Cardiovascular',
  respiratory: 'Respiratorio',
  gastrointestinal: 'Gastrointestinal',
  genitourinary: 'Genitourinario',
  endocrine: 'Endocrino',
  neurological: 'Neurológico',
  hematologic: 'Hematológico',
  musculoskeletal: 'Osteomuscular',
  skin: 'Piel y anexos',
  psychiatric: 'Mental / emocional',
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
    const doc = this.buildDocument(
      encounter,
      clinic,
      specialty,
      images,
      patientSignature ?? null,
    );
    return this.renderBuffer(doc);
  }

  suggestedFileName(encounter: EncounterPdfRow): string {
    const doc = encounter.patient.documentNumber || 'sin-doc';
    const code = encounter.externalCode || encounter.id.slice(0, 8);
    const last = (encounter.patient.lastName || 'paciente').replace(
      /\s+/g,
      '_',
    );
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
    if (specialty === ClinicSpecialty.DENTISTRY || specialty === ClinicSpecialty.ORTHODONTICS) return ODO_THEME;
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
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        'assets',
        'hce-membrete',
        fileName,
      ),
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
    const patientName = [
      patient.firstName,
      patient.lastName,
      patient.secondLastName,
    ]
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
        : specialty === ClinicSpecialty.DENTISTRY
          ? 'HC-ODO-001'
          : specialty === ClinicSpecialty.ORTHODONTICS
            ? 'HC-ORT-001'
            : specialty === ClinicSpecialty.PSYCHOLOGY
              ? 'Historia clínica — Psicología'
              : 'Historia clínica';
    const isPhysio = specialty === ClinicSpecialty.PHYSIOTHERAPY;
    const isOrthoClinic = specialty === ClinicSpecialty.ORTHODONTICS;
    const isDental = specialty === ClinicSpecialty.DENTISTRY || isOrthoClinic;
    const dental = (content.dentistry || {}) as Record<string, unknown>;
    const dentalService = [
      DENTAL_SERVICE_LABELS[String(dental.service || '')] || '',
      dental.includeOrtho && dental.service !== 'ORTODONCIA' ? DENTAL_SERVICE_LABELS['ORTODONCIA'] : '',
    ]
      .filter(Boolean)
      .join(' + ');

    const body: Content[] = [
      {
        text: isPhysio
          ? 'HISTORIA CLÍNICA FISIOTERAPIA'
          : isOrthoClinic
            ? 'HISTORIA CLÍNICA DE ORTODONCIA Y ODONTOGRAMA'
            : isDental
              ? 'HISTORIA CLÍNICA ODONTOLÓGICA Y ODONTOGRAMA'
              : 'HISTORIA CLÍNICA',
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
          [
            'Servicio',
            [encounter.serviceType || 'Consulta externa', dentalService]
              .filter(Boolean)
              .join(' — '),
          ],
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
        this.section(
          'Motivo de consulta',
          care.motive as string,
          theme.title,
          band,
        ),
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
    } else if (isDental) {
      body.push(...this.dentalSections(content, dental, theme.title));
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

    if (encounter.diagnoses?.length && !isDental) {
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
        const amends = evContent.amends as { signedAt?: string; verificationCode?: string } | undefined;
        const control = evContent.orthoControl as { cups?: Array<{ code: string; description: string }> } | undefined;
        const annexes = (evContent.attachments as Array<{ label: string }> | undefined) ?? [];
        const extra = [
          amends
            ? `Se refiere a la evolución del ${fmt(amends.signedAt)}${amends.verificationCode ? ` (${amends.verificationCode})` : ''}; el registro original no se modifica.`
            : '',
          control?.cups?.length ? `CUPS: ${control.cups.map((c) => `${c.code} ${c.description}`).join('; ')}` : '',
          annexes.length ? `Anexos: ${annexes.map((a) => a.label).join('; ')}` : '',
          evContent.verificationCode ? `Código de verificación: ${String(evContent.verificationCode)}` : '',
        ].filter(Boolean);
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
              margin: [0, 2, 0, extra.length ? 2 : 8],
            },
            ...extra.map((line, i) => ({
              text: line,
              style: 'muted',
              margin: [0, 0, 0, i === extra.length - 1 ? 6 : 0] as [number, number, number, number],
            })),
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
            String(
              signature.professionalName || encounter.professional.fullName,
            ),
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
          ['Código verificación', String(signature.verificationCode || '—')],
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
      String(signature.professionalName || '').trim() ||
      encounter.professional.fullName;
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
  private mentalExamSections(
    mental: Record<string, string>,
    titleColor: string,
  ): Content[] {
    const normalize = (v?: string | null) =>
      (v || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

  private dentalSections(
    content: Record<string, unknown>,
    dental: Record<string, unknown>,
    titleColor: string,
  ): Content[] {
    const band = { banded: true as const };
    const str = (v: unknown) =>
      typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
    const obj = (v: unknown) =>
      v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    const rows = (v: unknown) =>
      Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
    const lines = (pairs: Array<[string, unknown]>) =>
      pairs
        .filter(([, v]) => str(v))
        .map(([label, v]) => `${label}: ${str(v)}`)
        .join('\n');
    const flags = (v: unknown, labels: Record<string, string>) =>
      Object.entries(obj(v))
        .filter(([, on]) => on === true)
        .map(([k]) => labels[k] || k)
        .join(', ');
    const joinDash = (...v: unknown[]) => v.map(str).filter(Boolean).join(' — ');
    const table = (
      title: string,
      widths: string[],
      header: string[],
      data: string[][],
    ): Content => ({
      unbreakable: data.length <= 15,
      stack: [
        this.bandTitle(title, titleColor),
        {
          table: {
            widths,
            headerRows: 1,
            body: [
              header.map((h) => ({ text: h, bold: true, fontSize: 8.5 })),
              ...data.map((r) => r.map((c) => ({ text: c || '—', fontSize: 8.5 }))),
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 6],
        },
      ],
    });

    const care = obj(content.careMinimum);
    const ant = obj(dental.antecedents);
    const meds = obj(dental.medications);
    const history = obj(dental.dentalHistory);
    const vitals = obj(dental.vitals);
    const extra = obj(dental.extraoral);
    const intra = obj(dental.intraoral);
    const perio = obj(dental.periodontal);
    const ortho = obj(dental.orthodontics);
    const closure = obj(dental.closure);
    const sections: Content[] = [];

    sections.push(
      this.section(
        'Motivo de consulta',
        [
          str(care.motive),
          str(dental.currentIllness) ? `Enfermedad actual: ${str(dental.currentIllness)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        titleColor,
        band,
      ),
    );

    const conditionDetails = obj(dental.medicalConditionDetails);
    const conditionsText = Object.entries(obj(dental.medicalConditions))
      .filter(([, on]) => on === true)
      .map(([k]) => {
        const det = obj(conditionDetails[k]);
        const extra = [
          str(det.diagnosis),
          str(det.since) ? `desde ${str(det.since)}` : '',
          str(det.treatment),
          str(det.physician) ? `médico: ${str(det.physician)}` : '',
          str(det.notes),
        ].filter(Boolean);
        const label = DENTAL_MEDICAL_CONDITION_LABELS[k] || k;
        return extra.length ? `${label} (${extra.join('; ')})` : label;
      })
      .join(', ');
    const answers = obj(dental.medicalConditionAnswers);
    const answered = (value: string) =>
      Object.entries(answers)
        .filter(([, a]) => a === value)
        .map(([k]) => DENTAL_MEDICAL_CONDITION_LABELS[k] || k)
        .join(', ');
    const severityLabels: Record<string, string> = { LEVE: 'leve', MODERADA: 'moderada', SEVERA: 'severa / anafilaxia' };
    const allergyRowsText = rows(dental.allergyRows)
      .filter((r) => str(r.allergen))
      .map((r) => {
        const extra = [str(r.reaction), severityLabels[str(r.severity)] || '', str(r.notes)].filter(Boolean);
        return extra.length ? `${str(r.allergen)} (${extra.join(', ')})` : str(r.allergen);
      })
      .join('; ');
    const anesthesia: Record<string, string> = { SI: 'Sí', NO: 'No', NO_SABE: 'No sabe' };
    const medRows = rows(meds.rows)
      .filter((r) => str(r.name))
      .map((r) => [r.name, r.dose, r.frequency, r.reason].map(str).filter(Boolean).join(' '));
    sections.push(
      this.section(
        'Antecedentes médicos',
        lines([
          ['Condiciones', conditionsText],
          ['Niega', answered('NO')],
          ['Desconoce', answered('DESCONOCIDO')],
          ['Alergias', joinDash(flags(dental.allergies, DENTAL_ALLERGY_LABELS), allergyRowsText, ant.allergic)],
          [
            'Medicamentos actuales',
            meds.none === true ? 'No consume medicamentos' : medRows.join('; '),
          ],
          ['Grupos de riesgo', flags(meds.groups, DENTAL_MEDICATION_GROUP_LABELS)],
          ['Personales', ant.personal],
          ['Familiares', ant.family],
          ['Patológicos', ant.pathological],
          ['Quirúrgicos', ant.surgical],
          ['Gineco-obstétricos', ant.obgyn],
          ['Farmacológicos', ant.pharmacological],
          ['Tabaquismo', joinDash(ant.smoking, ant.smokingDetail)],
          ['Alcohol', joinDash(ant.alcohol, ant.alcoholDetail)],
        ]),
        titleColor,
        band,
      ),
    );
    sections.push(
      this.section(
        'Antecedentes odontológicos y hábitos',
        lines([
          ['Última consulta', history.lastVisit],
          ['Frecuencia de visitas', history.visitFrequency],
          ['Última limpieza', history.lastCleaning],
          ['Últimas radiografías', history.lastXray],
          ['Tratamientos previos', flags(history.treatments, DENTAL_TREATMENT_LABELS)],
          ['Síntomas', flags(history.symptoms, DENTAL_SYMPTOM_LABELS)],
          [
            '¿Reacción a la anestesia?',
            joinDash(anesthesia[str(history.anesthesiaReaction)], history.anesthesiaReactionDetail),
          ],
          ['Observaciones', history.notes],
          ['Hábitos', joinDash(flags(dental.habits, DENTAL_HABIT_LABELS), ant.oralHabits)],
        ]),
        titleColor,
        band,
      ),
    );
    const altered = Object.entries(obj(dental.systemsReview))
      .filter(([, v]) => v === true)
      .map(([k]) => DENTAL_SYSTEM_LABELS[k] || k);
    sections.push(
      this.section(
        'Revisión por sistemas y signos vitales',
        [
          altered.length ? `Con hallazgos: ${altered.join(', ')}` : '',
          str(dental.systemsReviewNotes),
          lines([
            ['PA', vitals.bloodPressure],
            ['FC (lpm)', vitals.heartRate],
            ['FR (rpm)', vitals.respiratoryRate],
            ['Temperatura (°C)', vitals.temperature],
            ['SatO2 (%)', vitals.spo2],
          ]).replace(/\n/g, ' · '),
        ]
          .filter(Boolean)
          .join('\n'),
        titleColor,
        band,
      ),
    );
    sections.push(
      this.section(
        'Examen extraoral y ATM',
        lines([
          ['Simetría facial', extra.symmetry],
          ['Perfil', extra.profile],
          ['Tercios faciales', extra.facialThirds],
          ['Ganglios', extra.lymphNodes],
          ['Labios', extra.lips],
          ['Respiración', extra.breathing],
          ['Piel', extra.skin],
          ['ATM', extra.tmj],
          ['Apertura bucal (mm)', extra.mouthOpening],
          ['Dolor muscular', extra.muscularPain],
          ['Chasquidos', extra.clicking],
          ['Desviación mandibular', extra.mandibularDeviation],
          ['Observaciones', extra.notes],
        ]),
        titleColor,
        band,
      ),
    );
    sections.push(
      this.section(
        'Examen intraoral',
        lines([
          ['Higiene oral', intra.hygiene],
          ['Labios', intra.lips],
          ['Carrillos / mucosa', intra.mucosa],
          ['Paladar', intra.palate],
          ['Lengua', intra.tongue],
          ['Piso de boca', intra.floorOfMouth],
          ['Frenillos', intra.frenula],
          ['Amígdalas / orofaringe', intra.tonsils],
          ['Glándulas salivales', intra.glands],
          ['Otras lesiones', intra.otherLesions],
          ['Dentición', intra.dentition],
          ['Oclusión', joinDash(intra.occlusion, intra.occlusionNotes)],
        ]),
        titleColor,
        band,
      ),
    );
    sections.push(
      this.section(
        'Periodonto',
        lines([
          ['Encía', perio.gingiva],
          ['Sangrado al sondaje', perio.bleeding],
          ['Recesiones', perio.recessions],
          ['Movilidad', perio.mobility],
          ['Profundidad al sondaje', perio.probingDepth],
          ['Placa bacteriana', perio.plaque],
          ['Cálculos', perio.calculus],
          ['Furcaciones', perio.furcations],
          ['Índices', perio.indices],
          ['Observaciones', perio.notes],
        ]),
        titleColor,
        band,
      ),
    );

    const odontogram = obj(dental.odontogram);
    const label = (k: unknown) => DENTAL_TOOTH_LABELS[str(k)] || str(k);
    const toothRows = Object.keys(odontogram)
      .sort((a, b) => Number(a) - Number(b))
      .map((tooth) => {
        const t = obj(odontogram[tooth]);
        const conditions = [
          ...(Array.isArray(t.conditions) ? t.conditions : []),
          ...(str(t.status) && str(t.status) !== 'SANO' ? [t.status] : []),
        ]
          .map(label)
          .filter(Boolean);
        const surfaces = Object.entries(obj(t.surfaces))
          .filter(([, v]) => str(v) && v !== 'SANO')
          .map(([k, v]) => `${DENTAL_SURFACE_LABELS[k] || k}: ${label(v)}`);
        const marks = (Array.isArray(t.marks) ? t.marks : []).map(label).filter(Boolean);
        return [
          tooth,
          conditions.join(', '),
          surfaces.join(', '),
          [marks.join(', '), str(t.note)].filter(Boolean).join(' — '),
        ];
      })
      .filter(([, c, s, n]) => c || s || n);
    if (toothRows.length) {
      sections.push(
        table('Odontograma', ['9%', '24%', '*', '28%'], ['Diente', 'Condición', 'Superficies', 'Marcas / nota'], toothRows),
      );
    }
    const arches = obj(dental.orthoArches);
    const archText = [arches.upper === true ? 'superior' : '', arches.lower === true ? 'inferior' : '']
      .filter(Boolean)
      .join(' e ');
    const chart = obj(dental.orthoChart);
    const list = (v: unknown, labels: Record<string, string>) =>
      (Array.isArray(v) ? v : []).map((k) => labels[str(k)] || str(k)).filter(Boolean);
    const bracketText = ORTHO_BRACKET_LABELS[str(chart.bracketType)] || '';
    const applianceText = list(chart.appliances, ORTHO_APPLIANCE_LABELS).join(', ');
    const phaseText = list(chart.planPhases, ORTHO_PLAN_PHASE_LABELS).join('; ');
    const segmentText = (Array.isArray(chart.archSegments) ? chart.archSegments : [])
      .map((s) => obj(s))
      .map((s) => `${str(s.arch) === 'upper' ? 'superior' : 'inferior'} ${str(s.from)}–${str(s.to)}`)
      .join('; ');
    const elasticText = (Array.isArray(chart.elastics) ? chart.elastics : [])
      .map((e) => obj(e))
      .map((e) => `${ORTHO_ELASTIC_LABELS[str(e.type)] || str(e.type)} ${str(e.from)}–${str(e.to)}`)
      .join('; ');
    const chartLines = [
      bracketText || applianceText ? `Tipo de aparato: ${[bracketText, applianceText].filter(Boolean).join(', ')}.` : '',
      phaseText ? `Fases del plan cumplidas: ${phaseText}.` : '',
      segmentText ? `Arco seccionado: ${segmentText}.` : '',
      elasticText ? `Elásticos: ${elasticText}.` : '',
    ];
    if (str(dental.odontogramNotes) || archText || chartLines.some(Boolean)) {
      sections.push(
        this.section(
          toothRows.length ? 'Observaciones del odontograma' : 'Odontograma',
          [archText ? `Aparatología de ortodoncia en arco ${archText}.` : '', ...chartLines, str(dental.odontogramNotes)]
            .filter(Boolean)
            .join('\n'),
          titleColor,
          band,
        ),
      );
    }

    const facial = obj(ortho.facial);
    const oIntra = obj(ortho.intraoral);
    const ceph = obj(ortho.cephalometry);
    const models = obj(ortho.models);
    const orthoText = [
      lines([
        ['Tipo facial', facial.facialType],
        ['Perfil', facial.profile],
        ['Simetría', facial.symmetry],
        ['Línea media facial', facial.midline],
        ['Tercio inferior', facial.lowerThird],
        ['Competencia labial', facial.lipCompetence],
        ['Sonrisa', facial.smile],
        ['Exposición dental', facial.dentalExposure],
        ['Corredor bucal', facial.buccalCorridor],
        ['Ángulo nasolabial', facial.nasolabialAngle],
      ]),
      lines([
        ['Clase molar', joinDash(oIntra.molarRight && `D: ${str(oIntra.molarRight)}`, oIntra.molarLeft && `I: ${str(oIntra.molarLeft)}`)],
        ['Clase canina', joinDash(oIntra.canineRight && `D: ${str(oIntra.canineRight)}`, oIntra.canineLeft && `I: ${str(oIntra.canineLeft)}`)],
        ['Overjet', oIntra.overjet],
        ['Overbite', oIntra.overbite],
        ['Mordida abierta', oIntra.openBite],
        ['Mordida cruzada', [oIntra.crossBite, oIntra.crossBiteSide && oIntra.crossBiteSide !== 'Bilateral' ? `lado ${String(oIntra.crossBiteSide).toLowerCase()}` : ''].filter(Boolean).join(', ')],
        ['Mordida profunda', oIntra.deepBite],
        ['Apiñamiento', oIntra.crowding],
        ['Diastemas', oIntra.diastemas],
        ['Línea media dental', oIntra.dentalMidline],
        ['Curva de Spee', oIntra.curveOfSpee],
      ]),
      lines([
        ['SNA', ceph.sna],
        ['SNB', ceph.snb],
        ['ANB', ceph.anb],
        ['Wits', ceph.wits],
        ['FMA', ceph.fma],
        ['IMPA', ceph.impa],
        ['Incisivo superior (U1-SN)', ceph.upperIncisor],
        ['Clase esquelética', ceph.skeletalClass],
        ['Patrón de crecimiento', ceph.growthPattern],
      ]),
      lines([
        ['Discrepancia superior', models.upperDiscrepancy],
        ['Discrepancia inferior', models.lowerDiscrepancy],
        ['Bolton', models.bolton],
        ['Forma de arcada', models.archForm],
      ]),
      lines([
        ['Hábitos', flags(ortho.habits, ORTHO_HABIT_LABELS)],
        ['Otras mediciones', ortho.measurements],
        ['Diagnóstico ortodóncico', ortho.diagnosis],
        ['Fase de tratamiento', ortho.phase],
        ['Objetivos de tratamiento', ortho.objectives],
        ['Extracciones', ortho.extractions],
        ['Aparatología', ortho.appliance],
        ['Duración estimada', ortho.estimatedDuration],
        ['Plan de retención', ortho.retention],
        ['Observaciones', ortho.notes],
      ]),
    ]
      .filter(Boolean)
      .join('\n');
    if (orthoText) {
      sections.push(this.section('Ortodoncia', orthoText, titleColor, band));
    }

    const photos = Object.values(obj(dental.photos)).length;
    const imaging = rows(dental.imaging).filter((r) => str(r.type) || str(r.attachmentId) || str(r.findings));
    if (imaging.length) {
      sections.push(
        table(
          'Radiografías e imágenes diagnósticas',
          ['18%', '12%', '20%', '*'],
          ['Tipo', 'Fecha', 'Diagnóstico asociado', 'Hallazgos / archivo'],
          imaging.map((r) => [
            str(r.type),
            str(r.date),
            str(r.diagnosis),
            joinDash(r.findings, r.fileName && `Archivo: ${str(r.fileName)}`),
          ]),
        ),
      );
    }
    if (photos) {
      sections.push(
        this.section(
          'Fotografías clínicas',
          `${photos} fotografía(s) clínica(s) registrada(s); se custodian como anexos de la historia clínica.`,
          titleColor,
          band,
        ),
      );
    }

    const dx = rows(dental.diagnoses).filter((d) => str(d.cieCode) || str(d.description));
    if (dx.length) {
      sections.push(
        table(
          'Diagnósticos (CIE-10)',
          ['14%', '12%', '*', '12%'],
          ['Tipo', 'CIE-10', 'Descripción', 'Diente'],
          dx.map((d, i) => [
            i === 0 ? 'Principal' : 'Secundario',
            str(d.cieCode),
            str(d.description),
            str(d.tooth),
          ]),
        ),
      );
    }

    const plan = rows(dental.treatmentPlan).filter((r) => str(r.description) || str(r.code));
    if (plan.length) {
      const money = (v: unknown) => {
        const n = Number(str(v).replace(/[^\d.]/g, ''));
        return n ? `$${n.toLocaleString('es-CO')}` : '';
      };
      const total = plan
        .filter((r) => r.status !== 'CANCELADO')
        .reduce((sum, r) => sum + (Number(str(r.value).replace(/[^\d.]/g, '')) || 0), 0);
      sections.push(
        table(
          'Plan de tratamiento',
          ['8%', '16%', '*', '11%', '15%', '11%', '11%'],
          ['Pieza', 'Diagnóstico', 'Procedimiento', 'CUPS', 'Profesional', 'Valor', 'Estado'],
          [
            ...plan.map((r) => [
              str(r.tooth),
              str(r.diagnosis),
              str(r.description),
              str(r.code),
              str(r.professional),
              money(r.value),
              DENTAL_TREATMENT_STATUS_LABELS[str(r.status)] || 'Pendiente',
            ]),
            ...(total ? [['', '', 'Total (sin cancelados)', '', '', money(total), '']] : []),
          ],
        ),
      );
    }

    const consents = Array.isArray(dental.requiredConsents)
      ? (dental.requiredConsents as unknown[]).map((c) => DENTAL_CONSENT_LABELS[str(c)] || str(c))
      : [];
    if (consents.length) {
      sections.push(
        this.section(
          'Consentimientos requeridos en la atención',
          consents.join(', '),
          titleColor,
          band,
        ),
      );
    }

    const rx = rows(dental.prescriptions).filter((r) => str(r.medication));
    if (rx.length) {
      sections.push(
        table(
          'Prescripción de medicamentos',
          ['*', '12%', '11%', '13%', '11%', '22%'],
          ['Medicamento', 'Dosis', 'Vía', 'Frecuencia', 'Duración', 'Indicaciones'],
          rx.map((r) => [
            str(r.medication),
            str(r.dose),
            str(r.route),
            str(r.frequency),
            str(r.duration),
            str(r.instructions),
          ]),
        ),
      );
    }
    const orders = rows(dental.orders).filter((r) => str(r.type) || str(r.detail));
    if (orders.length) {
      sections.push(
        table(
          'Órdenes',
          ['20%', '*', '12%', '25%'],
          ['Tipo', 'Detalle', 'CUPS', 'Observaciones'],
          orders.map((r) => [
            DENTAL_ORDER_TYPE_LABELS[str(r.type)] || str(r.type),
            str(r.detail),
            str(r.code),
            str(r.notes),
          ]),
        ),
      );
    }

    sections.push(
      this.section(
        'Cierre',
        lines([
          ['Fecha de cierre', closure.closedAt],
          ['Estado del caso', closure.caseStatus],
          ['Resultado del tratamiento', closure.treatmentResult],
        ]),
        titleColor,
        band,
      ),
    );
    return sections;
  }

  private bandTitle(title: string, titleColor: string): Content {
    return {
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
      margin: [0, 8, 0, 3],
    };
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
