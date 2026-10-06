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
  DENTAL_TREATMENT_PHASE_LABELS,
  DENTAL_TREATMENT_STATUS_LABELS,
  ORTHO_APPLIANCE_LABELS,
  ORTHO_BRACKET_LABELS,
  ORTHO_HABIT_LABELS,
  ORTHO_ELASTIC_LABELS,
  ORTHO_PLAN_PHASE_LABELS,
} from './dentistry-labels';
import { num } from '../billing/treatment-plan-items';
import { physioIntakeSections, physioMetricItems, physioPainFromText } from './physio-intake.pdf';
import { psychAgeLabel, psychBirthLabel, psychPatientRows } from './psych-intake.pdf';
import {
  HCE_PAGE,
  HCE_PALETTE as P,
  card,
  clinicalSummary,
  compactTableLayout,
  contentBox,
  dataTableLayout,
  isStructuredText,
  splitLead,
  documentHeading,
  fieldGrid,
  icon,
  lineChart,
  metaStrip,
  metricCards,
  patientCard,
  richText,
  runningFooter,
  runningHeader,
  sectionHeader,
  signatureColumn,
  tableCell,
  tableHeaderCell,
  type MetricItem,
  type SummaryRow,
} from './hce-pdf.layout';

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
  /** Logo del consultorio como data URL (PNG/JPG), o null para el membrete estándar. */
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  specialty?: ClinicSpecialty | string | null;
  /** Foto del paciente como data URL (JPG/PNG), solo si está registrada. */
  patientPhoto?: string | null;
};

const SPECIALTY_NAMES: Record<string, string> = {
  PSYCHOLOGY: 'Psicología',
  PHYSIOTHERAPY: 'Fisioterapia',
  DENTISTRY: 'Odontología',
  ORTHODONTICS: 'Ortodoncia',
  MEDICINE: 'Medicina general',
  AESTHETIC: 'Medicina estética',
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

@Injectable()
export class HcePdfService {
  private readonly logger = new Logger(HcePdfService.name);
  private readonly printer: InstanceType<typeof PdfPrinter>;
  /** Numeración de secciones del documento en construcción (buildDocument es síncrono). */
  private sectionNo = 0;

  constructor() {
    this.printer = new PdfPrinter({
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
      Times: {
        normal: 'Times-Roman',
        bold: 'Times-Bold',
        italics: 'Times-Italic',
        bolditalics: 'Times-BoldItalic',
      },
    });
  }

  async buildPdfBuffer(
    encounter: EncounterPdfRow,
    clinic: ClinicInfo,
    patientSignature?: PatientSignatureInfo | null,
  ): Promise<Buffer> {
    const specialty = this.resolveSpecialty(encounter, clinic);
    const doc = this.buildDocument(
      encounter,
      clinic,
      specialty,
      patientSignature ?? null,
      clinic.logo ?? null,
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

  private buildDocument(
    encounter: EncounterPdfRow,
    clinic: ClinicInfo,
    specialty: ClinicSpecialty | string,
    patientSignature: PatientSignatureInfo | null,
    clinicLogo: string | null = null,
  ): TDocumentDefinitions {
    this.sectionNo = 0;
    const theme = { title: P.navy as string };
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
    const fmtOrEmpty = (d?: Date | string | null) => (d && !Number.isNaN(new Date(d).getTime()) ? fmt(d) : '');

    const specialtyName = SPECIALTY_NAMES[String(specialty)] || 'Historia clínica';
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

    const isSoap = record?.noteFormat === ClinicalNoteFormat.SOAP;
    const careMin = (content.careMinimum || {}) as Record<string, unknown>;
    const signature = (content.signature || {}) as Record<string, unknown>;
    const professionalName =
      String(signature.professionalName || '').trim() ||
      encounter.professional.fullName;
    const professionalCard = String(
      signature.professionalCard || encounter.professional.professionalCard || '',
    ).trim();
    const generatedAt = fmt(new Date());
    const documentLabel = [patient.documentType, patient.documentNumber].filter(Boolean).join(' ');
    const evolutions = record?.evolutions ?? [];
    const lastEvolution = evolutions[evolutions.length - 1];

    const formCode = isPhysio ? 'HC-FT-001' : isOrthoClinic ? 'HC-ORT-001' : isDental ? 'HC-ODO-001' : '';
    const headingLine = [
      specialtyName,
      isOrthoClinic ? 'Ortodoncia y odontograma' : isDental ? 'Historia odontológica y odontograma' : '',
      isSoap ? 'Nota de evolución (SOAP)' : '',
      formCode,
    ]
      .filter(Boolean)
      .join('  ·  ');

    const shorten = (v: unknown, max = 190) => {
      const s = String(v ?? '').replace(/\s+/g, ' ').trim();
      return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, '')}…` : s;
    };
    const dentalDx = (Array.isArray(dental.diagnoses) ? dental.diagnoses : []) as Array<Record<string, unknown>>;
    const primaryDx = isDental
      ? dentalDx.find((d) => String(d.cieCode ?? '').trim() || String(d.description ?? '').trim())
      : (encounter.diagnoses.find((d) => d.isPrimary) ?? encounter.diagnoses[0]);
    const primaryDxText = primaryDx
      ? [String(primaryDx.cieCode ?? '').trim(), String(primaryDx.description ?? '').trim()].filter(Boolean).join(' — ')
      : '';

    const patientFields: Array<[string, string]> = [
      ['Documento', documentLabel],
      ['Edad', psychAgeLabel(patient.birthDate)],
      ['Sexo', patient.sexAtBirth || ''],
      ['Fecha de nacimiento', psychBirthLabel(patient.birthDate)],
      ['Teléfono', patient.phone || ''],
      ['Correo electrónico', patient.email || ''],
      ['Dirección', patient.address || ''],
      ['Ciudad', [patient.city, patient.department].filter(Boolean).join(', ')],
      ['EPS', patient.eps || ''],
    ];
    const summaryRows: SummaryRow[] = [
      { icon: 'clipboard', label: 'Motivo de consulta', value: shorten(isSoap ? (content.soap as Record<string, unknown> | undefined)?.subjective : careMin.motive) },
      { icon: 'pulse', label: 'Diagnóstico principal', value: shorten(primaryDxText, 150) },
      {
        icon: 'check',
        label: 'Estado de la historia',
        value: record?.status === 'SIGNED' ? 'Sellada' : 'Borrador',
        tone: record?.status === 'SIGNED' ? 'success' : 'warning',
      },
      {
        icon: 'calendar',
        label: lastEvolution ? 'Última atención' : 'Fecha de atención',
        value: lastEvolution
          ? fmtOrEmpty(lastEvolution.clinicalAttentionDate ?? lastEvolution.signedAt)
          : fmtOrEmpty((content.documentedAt as string) || record?.createdAt),
      },
      { icon: 'clock', label: 'Evoluciones registradas', value: evolutions.length ? String(evolutions.length) : '' },
      { icon: 'user', label: 'Profesional tratante', value: professionalName },
    ];

    const body: Content[] = [
      documentHeading(headingLine, 'Documento de resumen para seguimiento profesional'),
      metaStrip([
        { icon: 'calendar', label: 'Fecha de emisión', value: generatedAt },
        { icon: 'file', label: 'N.º de historia', value: encounter.externalCode || '' },
        { icon: 'user', label: 'Profesional', value: encounter.professional.fullName },
        { icon: 'monitor', label: 'Modalidad', value: encounter.modality === 'VIRTUAL' ? 'Virtual' : 'Presencial' },
        { icon: 'clock', label: 'Fecha de digitación', value: fmtOrEmpty((content.documentedAt as string) || record?.createdAt) },
        { icon: 'card', label: 'Tarjeta profesional', value: encounter.professional.professionalCard || '' },
        {
          icon: 'pulse',
          label: 'Servicio',
          value: [encounter.serviceType || 'Consulta externa', dentalService].filter(Boolean).join(' — '),
        },
        { icon: 'building', label: 'IPS / consultorio', value: clinic.name },
      ]),
      {
        columns: [
          {
            width: '60%',
            stack: [
              patientCard(
                [patient.firstName, patient.middleName, patient.lastName, patient.secondLastName].filter(Boolean).join(' '),
                patientFields,
                clinic.patientPhoto ?? null,
              ),
            ],
          },
          { width: '*', stack: [clinicalSummary(summaryRows)] },
        ],
        columnGap: 10,
        margin: [0, 0, 0, 6],
      },
    ];

    if (isPsychology) {
      const rows = psychPatientRows(patient);
      const inCard = new Set([
        'Nombres y apellidos',
        'Documento',
        'Fecha de nacimiento',
        'Edad',
        'Sexo al nacer',
        'Municipio de residencia',
        'Dirección',
        'Celular',
        'Correo electrónico',
        'EPS',
      ]);
      const grid = fieldGrid(
        [...rows.identification, ...rows.health].filter(([label]) => !inCard.has(label)),
        3,
      );
      if (grid) {
        body.push({
          stack: [card('Identificación complementaria e información de salud', 'card', [grid])],
          unbreakable: true,
          margin: [0, 4, 0, 6],
        });
      }
    }

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
      const intake = physioIntakeSections(physio);
      body.push(
        this.section('Datos de la valoración', intake.header, theme.title, band),
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
        this.section('Antecedentes', intake.antecedents, theme.title, band),
        this.section('Zonas a tratar', intake.zones, theme.title, band),
        this.section(
          'Diagnóstico fisioterapéutico',
          physio.physioDiagnosis as string,
          theme.title,
          { highlight: true },
        ),
        this.section('Hallazgos', physio.findings as string, theme.title, band),
        this.section('Valoración fisioterapéutica', intake.assessment, theme.title, {
          extra: metricCards(physioMetricItems(physio) as MetricItem[]),
        }),
        this.section('Terapias a aplicar', intake.therapies, theme.title, band),
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
          'Frecuencia, duración y sesiones',
          [
            physio.frequency && `Frecuencia: ${physio.frequency}`,
            physio.estimatedDuration && `Duración estimada: ${physio.estimatedDuration}`,
            physio.sessionCount && `N.º de sesiones: ${physio.sessionCount}`,
          ]
            .filter(Boolean)
            .join(' · '),
          theme.title,
          band,
        ),
        this.physioPlanTable(physio.treatmentPlan, theme.title),
        this.section(
          'Impresión diagnóstica',
          assessment.impressionNarrative as string,
          theme.title,
          { highlight: true },
        ),
      );
    } else if (isDental) {
      body.push(...this.dentalSections(content, dental, theme.title));
    } else {
      const care = (content.careMinimum || {}) as Record<string, unknown>;
      const mental = (content.mentalExam || {}) as Record<string, string>;
      const assessment = (content.assessment || {}) as Record<string, unknown>;
      const psych = (content.psychology || {}) as Record<string, unknown>;
      body.push(
        this.section('Motivo de consulta', care.motive as string, theme.title),
        this.section(
          'Enfermedad actual',
          care.presentIllness as string,
          theme.title,
        ),
        this.section('Antecedentes', care.antecedents as string, theme.title),
        this.section(
          isPsychology ? 'Historia psicosocial' : 'Revisión por sistemas',
          care.systemsReview as string,
          theme.title,
        ),
        ...this.mentalExamSections(mental, theme.title),
        this.section(
          'Impresión diagnóstica y tratamiento',
          assessment.impressionNarrative as string,
          theme.title,
          { highlight: true },
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
          { numbered: true },
        ),
        this.section(
          'Objetivos terapéuticos',
          psych.therapeuticObjectives as string,
          theme.title,
        ),
        this.section(
          'Enfoque, modalidad y sesiones',
          [
            psych.approach && `Enfoque: ${psych.approach}`,
            psych.modality && `Modalidad: ${psych.modality}`,
            psych.frequency && `Frecuencia: ${psych.frequency}`,
            psych.estimatedDuration && `Duración estimada: ${psych.estimatedDuration}`,
            psych.sessionCount && `N.º de sesiones: ${psych.sessionCount}`,
          ]
            .filter(Boolean)
            .join(' · '),
          theme.title,
        ),
        this.physioPlanTable(psych.treatmentPlan, theme.title),
      );
    }

    if (encounter.diagnoses?.length && !isDental) {
      body.push(
        this.diagnosisBlock(
          'Impresión clínica / diagnóstico (CIE-10)',
          encounter.diagnoses.map((d) => ({
            code: d.cieCode,
            description: d.description || '',
            type: d.isPrimary ? 'Principal' : d.type || '',
          })),
        ),
      );
    }

    if (encounter.procedures?.length) {
      body.push(
        this.dataTable(
          'Procedimientos (CUPS)',
          ['18%', '*', '10%'],
          ['Código', 'Descripción', 'Cant.'],
          encounter.procedures.map((p) => [p.cupsCode, p.description || '', String(p.quantity ?? 1)]),
        ),
      );
    }

    if (record?.evolutions?.length) {
      const painPoints = isPhysio ? this.physioPainSeries(content, record.evolutions) : [];
      const chart = lineChart('Dolor referido (EVA 0–10) por atención', painPoints);
      const cards: Content[] = [];
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
        const note = String(evContent.note || '').trim();
        const inner: Content[] = [
          {
            columns: [
              { text: (evContent.reason as string) || 'Evolución', bold: true, fontSize: 9.4, color: P.navy, width: '*' },
              {
                text: `Fecha de atención: ${fmt(ev.clinicalAttentionDate ?? ev.signedAt)}`,
                fontSize: 7.8,
                bold: true,
                color: P.navy2,
                alignment: 'right',
                width: 'auto',
              },
            ],
            columnGap: 8,
          },
          { text: `Registrado en el sistema: ${fmt(ev.signedAt)}`, style: 'muted', margin: [0, 1, 0, 3] },
          ...(situation
            ? [
                {
                  text: [{ text: 'Situación actual: ', bold: true, color: P.navy2 }, situation],
                  style: 'body',
                  margin: [0, 0, 0, 3] as [number, number, number, number],
                },
              ]
            : []),
          ...(note ? [{ text: note, style: 'body', margin: [0, 0, 0, 3] as [number, number, number, number] }] : []),
          ...extra.map((line) => ({ text: line, style: 'muted', margin: [0, 0, 0, 1] as [number, number, number, number] })),
          {
            columns: [
              { ...(icon('pen', 8, P.muted) as object), width: 10, margin: [0, 1, 0, 0] },
              {
                text: `${ev.author.fullName}${ev.author.professionalCard ? ` · TP ${ev.author.professionalCard}` : ''}`,
                style: 'muted',
                width: '*',
              },
            ],
            columnGap: 3,
            margin: [0, 3, 0, 0],
          } as Content,
        ];
        cards.push({
          table: {
            widths: [2.5, '*'],
            body: [[{ text: '', fillColor: P.navy2 }, { stack: inner, fillColor: P.soft, margin: [9, 6, 9, 6] }]],
          },
          layout: 'noBorders',
          unbreakable: note.length + situation.length < 1400,
          margin: [0, 0, 0, 6],
        } as Content);
      }
      // El título de la sección viaja con la gráfica y la primera evolución.
      body.push(
        {
          stack: [sectionHeader(++this.sectionNo, 'Evolución y seguimiento'), ...(chart ? [chart] : []), cards[0]],
          unbreakable: true,
        },
        ...cards.slice(1),
      );
    }

    const sealedAt = fmtOrEmpty(record?.signedAt || (signature.signedAt as string));
    const guardian = patientSignature?.signerRole === 'LEGAL_GUARDIAN';
    body.push({
      unbreakable: true,
      stack: [
        sectionHeader(null, 'Firmas y validación'),
        {
          columns: [
            signatureColumn({
              title: 'Firma profesional',
              image: signature.signatureBase64 ? String(signature.signatureBase64) : null,
              name: professionalName,
              details: [
                professionalCard ? `Tarjeta profesional: ${professionalCard}` : '',
                specialtyName,
                sealedAt ? `Fecha de sellado: ${sealedAt}` : '',
                signature.verificationCode ? `Código de verificación: ${String(signature.verificationCode)}` : '',
              ],
            }),
            signatureColumn({
              title: 'Firma del paciente / acudiente',
              image: patientSignature?.image || null,
              name: String(patientSignature?.signerName || patientName),
              details: patientSignature?.image
                ? [
                    `Calidad: ${guardian ? 'Acudiente / representante legal' : 'Paciente'}`,
                    guardian ? '' : documentLabel,
                    patientSignature.signedAt ? `Fecha de firma: ${fmt(patientSignature.signedAt)}` : '',
                  ]
                : [documentLabel],
              pending: patientSignature?.image ? undefined : 'Firma del paciente pendiente de registro.',
            }),
          ],
          columnGap: 34,
          margin: [0, 6, 0, 0],
        },
      ],
    });

    const headerLeft: Content = clinicLogo
      ? ({ image: 'clinicLogo', fit: [120, 30] } as Content)
      : ({ text: clinic.name, font: 'Times', bold: true, fontSize: 10.5, color: P.navy, margin: [0, 4, 0, 0] } as Content);
    const headerRight = ['Historia clínica', patientName, encounter.externalCode ? `N.º ${encounter.externalCode}` : '']
      .filter(Boolean)
      .join('  ·  ');
    const footerLeft = [clinic.name, clinic.phone].filter(Boolean).join(' · ');

    return {
      pageSize: HCE_PAGE.size,
      pageMargins: [HCE_PAGE.side, clinicLogo ? HCE_PAGE.top + 8 : HCE_PAGE.top, HCE_PAGE.side, HCE_PAGE.bottom],
      info: { title: `Resumen de historia clínica — ${patientName}`, author: clinic.name, subject: specialtyName },
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 9.3,
        lineHeight: 1.3,
        color: P.ink,
        alignment: 'left',
      },
      images: clinicLogo ? { clinicLogo } : {},
      header: () => runningHeader(headerLeft, headerRight),
      footer: (currentPage: number, pageCount: number) =>
        runningFooter(footerLeft, `Generado el ${generatedAt}`, currentPage, pageCount),
      content: body,
      styles: {
        body: { fontSize: 9.3, alignment: 'justify', color: P.ink },
        muted: { fontSize: 7.6, color: P.muted },
      },
    } as TDocumentDefinitions;
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
    const table = (title: string, widths: string[], header: string[], data: string[][]): Content =>
      this.dataTable(title, widths, header, data);

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
        [altered.length ? `Con hallazgos: ${altered.join(', ')}` : '', str(dental.systemsReviewNotes)]
          .filter(Boolean)
          .join('\n'),
        titleColor,
        {
          extra: metricCards([
            { label: 'Presión arterial (mmHg)', value: str(vitals.bloodPressure) },
            { label: 'Frec. cardiaca (lpm)', value: str(vitals.heartRate) },
            { label: 'Frec. respiratoria (rpm)', value: str(vitals.respiratoryRate) },
            { label: 'Temperatura (°C)', value: str(vitals.temperature) },
            { label: 'SatO2 (%)', value: str(vitals.spo2) },
          ]),
        },
      ),
    );
    const examNotes = obj(dental.examNotes);
    const exam = (group: 'extraoral' | 'intraoral', key: string) =>
      joinDash(obj(group === 'extraoral' ? extra : intra)[key], examNotes[`${group}.${key}`]);
    sections.push(
      this.section(
        'Examen extraoral y ATM',
        lines([
          ['Simetría facial', exam('extraoral', 'symmetry')],
          ['Perfil', exam('extraoral', 'profile')],
          ['Tercios faciales', exam('extraoral', 'facialThirds')],
          ['Ganglios', exam('extraoral', 'lymphNodes')],
          ['Labios', exam('extraoral', 'lips')],
          ['Respiración', exam('extraoral', 'breathing')],
          ['Piel', exam('extraoral', 'skin')],
          ['ATM', exam('extraoral', 'tmj')],
          ['Apertura bucal (mm)', extra.mouthOpening],
          ['Dolor muscular', exam('extraoral', 'muscularPain')],
          ['Chasquidos', exam('extraoral', 'clicking')],
          ['Desviación mandibular', exam('extraoral', 'mandibularDeviation')],
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
          ['Higiene oral', exam('intraoral', 'hygiene')],
          ['Labios', exam('intraoral', 'lips')],
          ['Carrillos / mucosa', exam('intraoral', 'mucosa')],
          ['Paladar', exam('intraoral', 'palate')],
          ['Lengua', exam('intraoral', 'tongue')],
          ['Piso de boca', exam('intraoral', 'floorOfMouth')],
          ['Frenillos', exam('intraoral', 'frenula')],
          ['Amígdalas / orofaringe', exam('intraoral', 'tonsils')],
          ['Glándulas salivales', exam('intraoral', 'glands')],
          ['Otras lesiones', intra.otherLesions],
          ['Dentición', exam('intraoral', 'dentition')],
          ['Oclusión', joinDash(exam('intraoral', 'occlusion'), intra.occlusionNotes)],
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
    const perioTeeth = obj(obj(dental.periodontogram).teeth);
    const triple = (v: unknown) => {
      const a = Array.isArray(v) ? v : [];
      return [0, 1, 2].map((i) => (typeof a[i] === 'number' ? String(a[i]) : '·')).join('-');
    };
    const flagged = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x === true).length : 0);
    const perioOrder = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
    const romanFurca = ['0', 'I', 'II', 'III'];
    const perioRows = perioOrder
      .map(String)
      .filter((t) => perioTeeth[t])
      .map((t) => {
        const r = obj(perioTeeth[t]);
        const pd = obj(r.pd);
        const rec = obj(r.rec);
        const bop = flagged(obj(r.bop).b) + flagged(obj(r.bop).l);
        const plq = flagged(obj(r.plq).b) + flagged(obj(r.plq).l);
        const sup = flagged(obj(r.sup).b) + flagged(obj(r.sup).l);
        return {
          row: [
            t,
            triple(pd.b),
            triple(rec.b),
            triple(pd.l),
            triple(rec.l),
            [bop ? `S ${bop}` : '', plq ? `P ${plq}` : '', sup ? `Sup ${sup}` : ''].filter(Boolean).join(' · '),
            typeof r.mobility === 'number' ? String(r.mobility) : '',
            typeof r.furcation === 'number' ? romanFurca[r.furcation] || String(r.furcation) : '',
          ],
          hasData: [pd.b, pd.l, rec.b, rec.l].some((v) => Array.isArray(v) && v.some((x) => typeof x === 'number')) || bop + plq + sup > 0 || typeof r.mobility === 'number' || typeof r.furcation === 'number',
        };
      })
      .filter((r) => r.hasData)
      .map((r) => r.row);
    if (perioRows.length) {
      sections.push(
        table(
          'Periodontograma (mm, sitios mesial-central-distal)',
          ['7%', '15%', '15%', '15%', '15%', '*', '6%', '6%'],
          ['Pieza', 'Sondaje V', 'Margen V', 'Sondaje P/L', 'Margen P/L', 'Sitios con sangrado / placa / supuración', 'Mov.', 'Furca'],
          perioRows,
        ),
      );
    }

    const rehab = obj(dental.rehab);
    const kennedy = obj(rehab.kennedy);
    const rehabText = lines([
      ['Kennedy maxilar superior', kennedy.upper],
      ['Kennedy mandíbula', kennedy.lower],
      ['Dimensión vertical', rehab.verticalDimension],
      ['Esquema oclusal', rehab.occlusalScheme],
      ['Plan / observaciones', rehab.notes],
    ]);
    if (rehabText) sections.push(this.section('Rehabilitación oral', rehabText));
    const implants = rows(rehab.implants).filter((r) => str(r.tooth) || str(r.brand));
    if (implants.length) {
      const size = (r: Record<string, unknown>) =>
        [str(r.diameter), str(r.length)].filter(Boolean).join(' × ') + (str(r.diameter) || str(r.length) ? ' mm' : '');
      sections.push(
        table(
          'Implantes',
          ['6%', '15%', '10%', '9%', '9%', '9%', '12%', '12%', '*'],
          ['Pieza', 'Sistema / plataforma', 'Medidas', 'Colocación', 'Torque / ISQ', 'Carga', 'Rehabilitación', 'Estado', 'Injerto / observaciones'],
          implants.map((r) => [
            str(r.tooth),
            joinDash(r.brand, r.platform),
            size(r),
            str(r.placedAt).split('-').reverse().join('/'),
            joinDash(str(r.torque) ? `${str(r.torque)} Ncm` : '', str(r.isq) ? `ISQ ${str(r.isq)}` : ''),
            str(r.loading),
            str(r.restoration),
            str(r.status),
            joinDash(r.graft, r.notes),
          ]),
        ),
      );
    }
    const prostheses = rows(rehab.prostheses).filter((r) => str(r.type) || str(r.teeth));
    if (prostheses.length) {
      sections.push(
        table(
          'Prótesis',
          ['16%', '10%', '14%', '12%', '14%', '10%', '*'],
          ['Tipo', 'Piezas', 'Material', 'Estado', 'Laboratorio', 'Instalación', 'Observaciones'],
          prostheses.map((r) => [
            str(r.type),
            str(r.teeth),
            str(r.material),
            str(r.status),
            str(r.lab),
            str(r.installedAt).split('-').reverse().join('/'),
            str(r.notes),
          ]),
        ),
      );
    }

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
    const orthoCase = obj(dental.orthoCase);
    const prior = obj(orthoCase.prior);
    const caseStatus: Record<string, string> = {
      NUEVO: 'Nuevo',
      VALORACION: 'Valoración',
      DIAGNOSTICO: 'Diagnóstico',
      PLANIFICADO: 'Planificado',
      EN_TRATAMIENTO: 'En tratamiento',
      RETENCION: 'Retención',
      FINALIZADO: 'Finalizado',
      SUSPENDIDO: 'Suspendido',
    };
    const retainerUse: Record<string, string> = { SI: 'Sí, constante', IRREGULAR: 'Irregular', NO: 'No' };
    const motives = Array.isArray(orthoCase.motives) ? (orthoCase.motives as unknown[]).map(str).filter(Boolean) : [];
    const caseText = [
      lines([
        ['Estado del caso', caseStatus[str(orthoCase.status)]],
        ['Tipo de tratamiento', orthoCase.treatmentType],
        ['Fecha de inicio', str(orthoCase.startDate).split('-').reverse().join('/')],
        ['Ortodoncista', orthoCase.orthodontist],
        ['Motivos', motives.join(', ')],
        ['Motivo estético', orthoCase.motiveAesthetic],
        ['Motivo funcional', orthoCase.motiveFunctional],
        ['Preocupación principal', orthoCase.concern],
        ['Tiempo de evolución', orthoCase.evolutionTime],
        ['Expectativas del tratamiento', orthoCase.expectations],
      ]),
      prior.had === 'SI'
        ? lines([
            ['Ortodoncia previa', 'Sí'],
            ['Edad de inicio', prior.ageStart],
            ['Aparatología previa', prior.applianceType],
            ['Duración', prior.duration],
            ['Motivo de finalización', prior.endReason],
            ['Uso de retenedores', retainerUse[str(prior.retainerUse)]],
            ['Tipo de retenedor', prior.retainerType],
            ['Recidiva', prior.relapse],
          ])
        : prior.had === 'NO'
          ? 'Ortodoncia previa: No'
          : '',
      lines([
        ['Tratamientos quirúrgicos', prior.surgery],
        ['Extracciones anteriores', prior.extractions],
      ]),
    ]
      .filter(Boolean)
      .join('\n');
    if (caseText) {
      sections.push(this.section('Caso de ortodoncia', caseText, titleColor, band));
    }
    if (orthoText) {
      sections.push(this.section('Ortodoncia', orthoText, titleColor, band));
    }

    const orthoExam = obj(dental.orthoExam);
    const smile = obj(orthoExam.smile);
    const prop = obj(orthoExam.proportions);
    const fx = obj(orthoExam.functional);
    const sidesOf = (v: unknown) => {
      const o = obj(v);
      return o.right && o.left ? 'Bilateral' : o.right ? 'Derecha' : o.left ? 'Izquierda' : '';
    };
    const mm = (v: unknown) => (str(v) ? `${str(v)} mm` : '');
    const fnText = (v: unknown) => {
      const o = obj(v);
      if (o.state === 'NORMAL') return 'Normal';
      if (o.state !== 'ALTERADA') return '';
      return joinDash('Alterada', o.description, o.referral && `Remitir a ${str(o.referral)}`);
    };
    const examText = lines([
      ['Línea de sonrisa', smile.smileLine],
      ['Arco de sonrisa', smile.smileArc],
      ['Simetría de la sonrisa', smile.symmetry],
      ['Plano oclusal', smile.occlusalCant],
      ['Exposición incisiva en reposo', mm(smile.restExposure)],
      ['Exposición incisiva al sonreír', mm(smile.smileExposure)],
      ['Exposición gingival', mm(smile.gingivalExposure)],
      ['Observaciones de la sonrisa', smile.notes],
      ['Tercios faciales (sup./medio/inf.)', [prop.upperThird, prop.middleThird, prop.lowerThird].some((v) => str(v)) ? [prop.upperThird, prop.middleThird, prop.lowerThird].map((v) => str(v) || '—').join(' / ') + ' mm' : ''],
      ['Altura facial N–Me', mm(prop.facialHeight)],
      ['Ancho bicigomático', mm(prop.facialWidth)],
      ['ATM dolor', sidesOf(fx.tmjPain)],
      ['ATM click', sidesOf(fx.click)],
      ['ATM crepitación', sidesOf(fx.crepitus)],
      ['Trayectoria de apertura', fx.deviation],
      ['Apertura máxima', mm(fx.maxOpening)],
      ['Lateralidad derecha', mm(fx.lateralRight)],
      ['Lateralidad izquierda', mm(fx.lateralLeft)],
      ['Protrusión', mm(fx.protrusion)],
      ['Dolor muscular temporal', sidesOf(fx.temporal)],
      ['Dolor muscular masetero', sidesOf(fx.masseter)],
      ['Dolor muscular pterigoideos', sidesOf(fx.pterygoid)],
      ['Respiración', fnText(fx.breathing)],
      ['Deglución', fnText(fx.swallowing)],
      ['Fonación', fnText(fx.phonation)],
      ['Masticación', fnText(fx.chewing)],
      ['Observaciones funcionales', fx.notes],
    ]);
    if (examText) {
      sections.push(this.section('Sonrisa, proporciones y examen funcional', examText, titleColor, band));
    }

    const orthoArch = obj(dental.orthoArch);
    const archLine = (label: string, v: unknown) => {
      const a = obj(v);
      const parts = [
        str(a.form) && `forma ${str(a.form).toLowerCase()}`,
        str(a.intercanine) && `intercanino ${str(a.intercanine)} mm`,
        str(a.intermolar) && `intermolar ${str(a.intermolar)} mm`,
        str(a.depth) && `longitud ${str(a.depth)} mm`,
        str(a.perimeter) && `perímetro ${str(a.perimeter)} mm`,
        str(a.symmetry),
      ].filter(Boolean);
      return parts.length ? `${label}: ${parts.join(', ')}` : '';
    };
    const widths = obj(orthoArch.widths);
    const widthText = Object.keys(widths)
      .filter((k) => str(widths[k]))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => `${k}: ${str(widths[k])}`)
      .join(' · ');
    const tv = obj(orthoArch.transverse);
    const sg = obj(orthoArch.sagittal);
    const vt = obj(orthoArch.vertical);
    const archPlanesText = [
      archLine('Arcada superior', orthoArch.upper),
      archLine('Arcada inferior', orthoArch.lower),
      widthText && `Anchos mesiodistales (mm): ${widthText}`,
      lines([
        ['Compresión maxilar', tv.maxillaryCompression],
        ['Compresión mandibular', tv.mandibularCompression],
        ['Asimetría transversal', tv.asymmetry],
        ['Clasificación sagital', sg.classification],
        ['Relación incisiva', sg.incisorRelation],
        ['Patrón vertical', vt.pattern],
        ['Observaciones verticales', vt.notes],
      ]),
    ]
      .filter(Boolean)
      .join('\n');
    if (archPlanesText) {
      sections.push(this.section('Análisis de arcadas y planos', archPlanesText, titleColor, band));
    }

    const cephDefs: Array<[string, string, string, number, string?]> = [
      ['sna', 'SNA', '°', 82, 'sna'],
      ['snb', 'SNB', '°', 80, 'snb'],
      ['anb', 'ANB', '°', 2, 'anb'],
      ['wits', 'Wits', 'mm', 0, 'wits'],
      ['fma', 'FMA', '°', 25, 'fma'],
      ['sngogn', 'SN-GoGn', '°', 32],
      ['impa', 'IMPA', '°', 90, 'impa'],
      ['u1sn', '1-SN', '°', 103, 'upperIncisor'],
      ['u1na', '1-NA', '°', 22],
      ['l1nb', '1-NB', '°', 25],
      ['interincisal', 'Ángulo interincisal', '°', 131],
      ['facialAxis', 'Eje facial', '°', 90],
      ['facialDepth', 'Profundidad facial', '°', 87],
      ['lowerFaceHeight', 'Altura facial inferior', '°', 47],
    ];
    const orthoCeph = obj(dental.orthoCeph);
    const cephRows = obj(orthoCeph.rows);
    const cephValues = obj(obj(dental.orthodontics).cephalometry);
    const numOf = (v: unknown) => {
      const n = Number(str(v).replace(',', '.'));
      return str(v) && Number.isFinite(n) ? n : null;
    };
    const cephTable = cephDefs
      .map(([key, label, unit, norm, linked]) => {
        const row = obj(cephRows[key]);
        const value = linked ? str(cephValues[linked]) : str(row.value);
        const v = numOf(value);
        if (v === null) return null;
        const n = numOf(row.norm) ?? norm;
        const diff = Math.round((v - n) * 10) / 10;
        return [label, `${value} ${unit}`, `${n} ${unit}`, `${diff > 0 ? '+' : ''}${diff}`, str(row.note)];
      })
      .filter((r): r is string[] => !!r);
    if (cephTable.length) {
      sections.push(table('Tabla cefalométrica', ['24%', '14%', '14%', '12%', '*'], ['Medición', 'Valor', 'Norma', 'Desviación', 'Observación'], cephTable));
    }
    if (str(orthoCeph.notes)) {
      sections.push(this.section('Conclusión cefalométrica', str(orthoCeph.notes), titleColor, band));
    }
    const models3d = rows(dental.orthoModels3d).filter((r) => str(r.fileName));
    if (models3d.length) {
      sections.push(
        table(
          'Modelos digitales',
          ['20%', '*', '10%', '9%', '13%', '18%'],
          ['Tipo', 'Archivo', 'Formato', 'Versión', 'Fecha', 'Origen / observación'],
          models3d.map((r) => [str(r.kind), str(r.fileName), str(r.format), `v${str(r.version)}`, str(r.date), joinDash(r.source, r.notes)]),
        ),
      );
    }

    const orthoDx = obj(dental.orthoDx);
    const dxCat = obj(orthoDx.categories);
    const dxText = lines([
      ['Esquelético', dxCat.skeletal],
      ['Dental', dxCat.dental],
      ['Vertical', dxCat.vertical],
      ['Transversal', dxCat.transverse],
      ['Funcional', dxCat.functional],
      ['Tejidos blandos', dxCat.softTissue],
      ['Apiñamiento', dxCat.crowding],
    ]);
    if (dxText) sections.push(this.section('Diagnóstico ortodóntico por categorías', dxText, titleColor, band));
    const problems = rows(orthoDx.problems).filter((r) => str(r.problem));
    if (problems.length) {
      sections.push(
        table(
          'Problemas del paciente',
          ['*', '14%', '20%', '12%', '14%'],
          ['Problema', 'Severidad', 'Localización', 'Prioridad', 'Estado'],
          problems.map((r) => [str(r.problem), str(r.severity), str(r.location), str(r.priority), str(r.status)]),
        ),
      );
    }
    const objectives = rows(orthoDx.objectives).filter((r) => str(r.objective));
    if (objectives.length) {
      const pbName = (id: unknown) => str(problems.find((p) => str(p.id) === str(id))?.problem);
      sections.push(
        table(
          'Objetivos del tratamiento',
          ['30%', '*', '12%', '14%'],
          ['Problema', 'Objetivo', 'Prioridad', 'Estado'],
          objectives.map((r) => [pbName(r.problemId), str(r.objective), str(r.priority), str(r.status)]),
        ),
      );
    }
    const plans = rows(orthoDx.plans);
    if (plans.length) {
      const planText = plans
        .map((p) => {
          const chosen = str(orthoDx.selectedPlan) === str(p.id);
          const head = `Plan ${str(p.label)}${chosen ? ` (elegido${str(orthoDx.selectedBy) ? ' por ' + str(orthoDx.selectedBy) : ''}${str(orthoDx.selectedAt) ? ', ' + str(orthoDx.selectedAt) : ''})` : ''}`;
          const body = lines([
            ['Descripción', p.description],
            ['Ventajas', p.advantages],
            ['Consideraciones', p.considerations],
            ['Extracciones', p.extractions],
            ['Aparatología', p.appliance],
            ['Duración estimada', p.duration],
            ['Observaciones', p.notes],
          ]);
          return `${head}\n${body}`;
        })
        .join('\n\n');
      sections.push(this.section('Alternativas de tratamiento', planText, titleColor, band));
    }
    const extractions = rows(orthoDx.extractions).filter((r) => str(r.tooth));
    if (extractions.length) {
      sections.push(
        table(
          'Plan de extracciones',
          ['10%', '20%', '*', '14%', '14%'],
          ['Pieza', 'Motivo', 'Indicación', 'Fecha', 'Estado'],
          extractions.map((r) => [str(r.tooth), str(r.reason), str(r.indication), str(r.date), str(r.status)]),
        ),
      );
    }

    const mech = obj(dental.orthoMech);
    const appliances = rows(mech.appliances).filter((r) => str(r.type));
    if (appliances.length) {
      sections.push(
        table(
          'Aparatología',
          ['24%', '11%', '16%', '*', '13%', '12%'],
          ['Tipo', 'Arcada', 'Marca', 'Referencia', 'Fecha', 'Estado'],
          appliances.map((r) => [str(r.type), str(r.arch), str(r.brand), str(r.reference), str(r.date), str(r.status)]),
        ),
      );
    }
    const wires = rows(mech.wires).filter((r) => str(r.wire));
    if (wires.length) {
      sections.push(
        table(
          'Secuencia de arcos',
          ['12%', '28%', '14%', '14%', '*'],
          ['Arcada', 'Arco', 'Fecha', 'Estado', 'Observaciones'],
          wires.map((r) => [str(r.arch), str(r.wire), str(r.date), str(r.status), str(r.notes)]),
        ),
      );
    }
    const elastics = rows(mech.elastics).filter((r) => str(r.type) || str(r.from));
    if (elastics.length) {
      sections.push(
        table(
          'Elásticos',
          ['20%', '10%', '12%', '*', '16%', '14%'],
          ['Tipo', 'Lado', 'Piezas', 'Calibre / fuerza / uso', 'Fechas', 'Cumplimiento'],
          elastics.map((r) => [
            str(r.type),
            str(r.side),
            `${str(r.from)} → ${str(r.to)}`,
            joinDash(r.size, r.force, r.usage, str(r.hours) && `${str(r.hours)} h/día`),
            joinDash(r.start, r.end),
            str(r.compliance),
          ]),
        ),
      );
    }
    const ipr = rows(mech.ipr).filter((r) => str(r.contact));
    if (ipr.length) {
      const total = ipr.reduce((s, r) => s + (Number(str(r.amount).replace(',', '.')) || 0), 0);
      sections.push(
        table(
          `Reducción interproximal (IPR) · total ${Math.round(total * 100) / 100} mm`,
          ['18%', '12%', '16%', '*', '14%'],
          ['Contacto', 'Cantidad', 'Fecha', 'Profesional', 'Estado'],
          ipr.map((r) => [str(r.contact), str(r.amount) ? `${str(r.amount)} mm` : '', str(r.date), str(r.professional), str(r.status)]),
        ),
      );
    }
    const tads = rows(mech.tads).filter((r) => str(r.location) || str(r.tooth));
    if (tads.length) {
      sections.push(
        table(
          'Mini implantes (TAD)',
          ['20%', '10%', '12%', '14%', '*', '12%'],
          ['Ubicación', 'Pieza', 'Medidas', 'Colocación / retiro', 'Objetivo', 'Estado'],
          tads.map((r) => [
            str(r.location),
            str(r.tooth),
            joinDash(str(r.diameter) && `Ø${str(r.diameter)}`, str(r.length) && `${str(r.length)} mm`),
            joinDash(r.date, r.removalDate),
            joinDash(r.objective, str(r.brand), str(r.torque) && `${str(r.torque)} Ncm`),
            str(r.status),
          ]),
        ),
      );
    }
    const al = obj(mech.aligners);
    const alStates = Object.values(obj(al.states)).map(str);
    const alText = lines([
      ['Marca', al.brand],
      ['Plan', al.plan],
      ['Número total', al.total],
      ['Inicio', al.start],
      ['Uso diario', str(al.hoursPerDay) && str(al.total) ? `${str(al.hoursPerDay)} horas` : ''],
      ['Completados', str(al.total) ? String(alStates.filter((s) => s === 'Completado').length) : ''],
      ['Cumplimiento', al.compliance],
    ]);
    if (str(al.total) && alText) sections.push(this.section('Alineadores', alText, titleColor, band));

    const follow = obj(dental.orthoFollow);
    const agenda = rows(follow.agenda).filter((r) => str(r.date));
    if (agenda.length) {
      sections.push(
        table(
          'Controles programados',
          ['16%', '10%', '22%', '*', '16%'],
          ['Fecha', 'Hora', 'Tipo', 'Profesional', 'Estado'],
          [...agenda]
            .sort((a, b) => str(a.date).localeCompare(str(b.date)))
            .map((r) => [str(r.date).split('-').reverse().join('/'), str(r.time), str(r.type), str(r.professional), str(r.status)]),
        ),
      );
    }
    const retainers = rows(follow.retainers).filter((r) => str(r.type) || str(r.arch));
    if (retainers.length) {
      sections.push(
        table(
          'Retenedores',
          ['16%', '11%', '13%', '*', '16%', '12%', '12%'],
          ['Tipo', 'Arcada', 'Instalación', 'Material', 'Uso', 'Estado', 'Cumplimiento'],
          retainers.map((r) => [
            str(r.type),
            str(r.arch),
            str(r.installedAt),
            str(r.material),
            joinDash(r.usage, str(r.hoursPerDay) && `${str(r.hoursPerDay)} h/día`),
            str(r.status),
            str(r.compliance),
          ]),
        ),
      );
    }
    const retentionChecks = rows(follow.checks).filter((r) => str(r.date) || str(r.stability) || str(r.notes));
    if (retentionChecks.length) {
      sections.push(
        table(
          'Seguimiento de retención',
          ['12%', '14%', '16%', '18%', '*'],
          ['Control', 'Fecha', 'Uso', 'Estabilidad', 'Observaciones'],
          [...retentionChecks]
            .sort((a, b) => Number(str(a.milestone)) - Number(str(b.milestone)))
            .map((r) => [`${str(r.milestone)} m`, str(r.date), str(r.compliance), str(r.stability), str(r.notes)]),
        ),
      );
    }

    const budget = obj(dental.orthoBudget);
    const budgetItems = rows(budget.items).filter((r) => str(r.concept));
    if (budgetItems.length) {
      const toNum = (v: unknown) => {
        let t = str(v).replace(/[^\d.,-]/g, '');
        if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
        else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
        return Number(t) || 0;
      };
      const cop = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`;
      const netOf = (r: Record<string, unknown>) =>
        (toNum(r.qty) || 0) * toNum(r.unitValue) * (1 - Math.min(100, Math.max(0, toNum(r.discountPct))) / 100);
      const total = budgetItems.filter((r) => str(r.status) !== 'Cancelado').reduce((s, r) => s + netOf(r), 0);
      sections.push(
        table(
          `Presupuesto de ortodoncia · total ${cop(total)}`,
          ['20%', '*', '8%', '15%', '8%', '15%', '12%'],
          ['Concepto', 'Detalle', 'Cant.', 'Valor unitario', 'Desc.', 'Total', 'Estado'],
          budgetItems.map((r) => [
            str(r.concept),
            str(r.description),
            str(r.qty),
            str(r.unitValue) ? cop(toNum(r.unitValue)) : '',
            str(r.discountPct) ? `${str(r.discountPct)} %` : '',
            cop(netOf(r)),
            str(r.status),
          ]),
        ),
      );
      const installments = Math.floor(toNum(budget.installments));
      const finText = lines([
        ['Cuota inicial', str(budget.downPayment) ? cop(toNum(budget.downPayment)) : ''],
        ['Cuotas', installments ? `${installments} de ${cop(Math.max(0, total - toNum(budget.downPayment)) / installments)}` : ''],
        ['Primera cuota', budget.startDate],
        ['Fecha de cotización', budget.quotedAt],
        ['Condiciones', budget.notes],
      ]);
      if (finText) sections.push(this.section('Financiación del presupuesto', finText, titleColor, band));
    }

    const mvLabels: Record<string, [string, string]> = {
      MESIALIZACION: ['Mesialización', 'mm'],
      DISTALIZACION: ['Distalización', 'mm'],
      INTRUSION: ['Intrusión', 'mm'],
      EXTRUSION: ['Extrusión', 'mm'],
      ROTACION: ['Rotación', '°'],
      TORQUE: ['Torque', '°'],
      TIP: ['Tip (angulación)', '°'],
      INCLINACION: ['Inclinación', '°'],
      TRASLACION: ['Traslación', 'mm'],
      PROTRUSION: ['Protrusión', 'mm'],
      RETRUSION: ['Retrusión', 'mm'],
      EXPANSION: ['Expansión', 'mm'],
      CONTRACCION: ['Contracción', 'mm'],
    };
    const mvStatus: Record<string, string> = { PLANIFICADO: 'Planificado', EN_CURSO: 'En curso', LOGRADO: 'Logrado', SUSPENDIDO: 'Suspendido' };
    const movements = rows(dental.orthoMovements)
      .filter((r) => mvLabels[str(r.type)])
      .sort((a, b) => Number(str(a.tooth)) - Number(str(b.tooth)));
    if (movements.length) {
      sections.push(
        table(
          'Plan de movimientos dentarios',
          ['9%', '20%', '20%', '11%', '13%', '*'],
          ['Diente', 'Movimiento', 'Dirección', 'Magnitud', 'Estado', 'Observación'],
          movements.map((r) => {
            const [label, unit] = mvLabels[str(r.type)];
            return [str(r.tooth), label, str(r.direction), str(r.magnitude) ? `${str(r.magnitude)} ${unit}` : '', mvStatus[str(r.status)] || '', str(r.notes)];
          }),
        ),
      );
    }

    const photos = Object.values(obj(dental.photos)).length;
    const imaging = rows(dental.imaging).filter((r) => str(r.type) || str(r.attachmentId) || str(r.findings));
    if (imaging.length) {
      sections.push(
        table(
          'Radiografías e imágenes diagnósticas',
          ['16%', '11%', '13%', '18%', '*'],
          ['Tipo', 'Fecha', 'Región', 'Diagnóstico asociado', 'Hallazgos / archivo'],
          imaging.map((r) => [
            str(r.type),
            str(r.date),
            str(r.region),
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
        this.diagnosisBlock(
          'Diagnósticos (CIE-10)',
          dx.map((d, i) => ({
            type: i === 0 ? 'Principal' : 'Secundario',
            code: str(d.cieCode),
            description: str(d.description),
            tooth: str(d.tooth),
          })),
        ),
      );
    }

    const plan = rows(dental.treatmentPlan).filter((r) => str(r.description) || str(r.code));
    if (plan.length) {
      const money = (v: unknown) => {
        const n = Number(str(v).replace(/[^\d.]/g, ''));
        return n ? `$${n.toLocaleString('es-CO')}` : '';
      };
      const num = (v: unknown) => Number(str(v).replace(',', '.').replace(/[^\d.]/g, '')) || 0;
      const qty = (r: Record<string, unknown>) => num(r.quantity) || 1;
      const net = (r: Record<string, unknown>) =>
        Math.round(num(r.value) * qty(r) * (1 - Math.min(100, num(r.discount)) / 100));
      const active = plan.filter((r) => r.status !== 'CANCELADO');
      const gross = active.reduce((sum, r) => sum + num(r.value) * qty(r), 0);
      const afterRows = active.reduce((sum, r) => sum + net(r), 0);
      const budget = obj(dental.budget);
      const dv = budget.discountType === 'AMOUNT' ? num(budget.discountValue) : Math.min(100, num(budget.discountValue));
      const globalDiscount = Math.min(afterRows, Math.round(budget.discountType === 'AMOUNT' ? dv : (afterRows * dv) / 100));
      const total = afterRows - globalDiscount;
      sections.push(
        table(
          'Plan de tratamiento',
          ['6%', '13%', '*', '9%', '11%', '12%', '5%', '9%', '9%', '9%'],
          ['Pieza', 'Diagnóstico', 'Procedimiento', 'CUPS', 'Fase', 'Profesional', 'Cant.', 'Valor unit.', 'Neto', 'Estado'],
          [
            ...plan.map((r) => [
              str(r.tooth),
              str(r.diagnosis),
              str(r.description),
              str(r.code),
              DENTAL_TREATMENT_PHASE_LABELS[str(r.phase)] || '',
              str(r.professional),
              str(r.quantity) && str(r.quantity) !== '1' ? str(r.quantity) : '',
              money(r.value),
              money(net(r)) + (num(r.discount) ? ` (−${num(r.discount)} %)` : ''),
              DENTAL_TREATMENT_STATUS_LABELS[str(r.status)] || 'Pendiente',
            ]),
          ],
        ),
      );
      if (gross) {
        const budgetRows: string[][] = [['Subtotal (sin cancelados)', money(gross)]];
        if (gross !== afterRows) budgetRows.push(['Descuentos por procedimiento', `−${money(gross - afterRows)}`]);
        if (globalDiscount) {
          const why = str(budget.discountReason);
          budgetRows.push([`Descuento general${why ? ` (${why})` : ''}`, `−${money(globalDiscount)}`]);
        }
        budgetRows.push(['Total', money(total) || '$0']);
        const installments = Math.floor(num(budget.installments));
        if (str(budget.paymentMethod)) budgetRows.push(['Forma de pago', str(budget.paymentMethod)]);
        if (installments > 1 && total) budgetRows.push([`Cuotas (${installments})`, money(Math.ceil(total / installments))]);
        if (str(budget.validUntil)) budgetRows.push(['Válido hasta', str(budget.validUntil).split('-').reverse().join('/')]);
        if (str(budget.notes)) budgetRows.push(['Observaciones', str(budget.notes)]);
        if (str(budget.acceptedAt)) {
          const when = new Date(str(budget.acceptedAt)).toLocaleDateString('es-CO');
          budgetRows.push(['Aceptación del paciente', `${when}${str(budget.acceptedBy) ? ` · ${str(budget.acceptedBy)}` : ''}`]);
        }
        sections.push(table('Presupuesto', ['40%', '*'], ['Concepto', 'Valor'], budgetRows));
      }
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

  /** Plan de tratamiento de fisioterapia: procedimiento CUPS, sesiones y valores. */
  private physioPlanTable(raw: unknown, titleColor: string): Content {
    const rows = (Array.isArray(raw) ? raw : []).filter(
      (r): r is Record<string, unknown> => !!r && typeof r === 'object' && !!(String(r.description ?? '').trim() || String(r.cupsCode ?? '').trim()),
    );
    if (!rows.length) return { text: '' };
    const n = (v: unknown) => Math.max(0, num(v));
    const money = (v: number) => (v ? `$${Math.round(v).toLocaleString('es-CO')}` : '');
    const status: Record<string, string> = { PENDIENTE: 'Pendiente', EN_TRATAMIENTO: 'En tratamiento', TERMINADO: 'Terminado', CANCELADO: 'Cancelado' };
    const net = (r: Record<string, unknown>) => (n(r.sessions) || 1) * n(r.unitValue) * (1 - Math.min(100, n(r.discountPct)) / 100);
    const total = rows.filter((r) => r.status !== 'CANCELADO').reduce((s, r) => s + net(r), 0);
    const cell = (text: string, bold = false) => tableCell(text, bold);
    return {
      unbreakable: rows.length <= 15,
      stack: [
        this.bandTitle('Plan de tratamiento', titleColor),
        {
          table: {
            widths: ['10%', '*', '9%', '13%', '13%', '13%'],
            headerRows: 1,
            body: [
              ['CUPS', 'Procedimiento', 'Sesiones', 'Valor sesión', 'Neto', 'Estado'].map((h) => tableHeaderCell(h)),
              ...rows.map((r) => [
                cell(String(r.cupsCode ?? '')),
                cell([r.description, r.notes].map((v) => String(v ?? '').trim()).filter(Boolean).join(' — ')),
                cell(String(n(r.sessions) || 1)),
                cell(money(n(r.unitValue))),
                cell(money(net(r)) + (n(r.discountPct) ? ` (−${n(r.discountPct)} %)` : '')),
                cell(status[String(r.status)] || 'Pendiente'),
              ]),
              [cell(''), cell('Total del plan (sin cancelados)', true), cell(''), cell(''), cell(money(total), true), cell('')],
            ],
          },
          layout: dataTableLayout,
          margin: [0, 0, 0, 6],
        },
      ],
    };
  }

  private bandTitle(title: string, _titleColor?: string): Content {
    return sectionHeader(++this.sectionNo, title);
  }

  /**
   * Sección numerada con el texto clínico completo. `titleColor` y `banded` se conservan
   * por compatibilidad con los llamadores; el estilo lo define la paleta del documento.
   */
  private section(
    title: string,
    text?: string | null,
    _titleColor?: string,
    options?: { banded?: boolean; highlight?: boolean; numbered?: boolean; extra?: Content | null },
  ): Content {
    const value = (text || '').trim();
    if (!value && !options?.extra) return { text: '' };
    const header = sectionHeader(++this.sectionNo, title);
    const extra = options?.extra ? [options.extra] : [];
    const highlight = options?.highlight;
    const structured = isStructuredText(value);
    const render = (v: string, start = 1): Content =>
      options?.numbered
        ? ({
            ol: v.split('\n').filter((l) => l.trim()),
            start,
            fontSize: 9.3,
            color: P.ink,
            markerColor: P.navy2,
            lineHeight: 1.35,
          } as Content)
        : richText(v, structured);
    // Secciones cortas no se parten; en las largas el título viaja pegado al primer fragmento.
    const keepTogether = value.length < 700 && value.split('\n').length <= 12;
    if (keepTogether || !value) {
      return {
        stack: [header, ...extra, ...(value ? [contentBox(render(value), highlight)] : [])],
        unbreakable: true,
        margin: [0, 0, 0, 2],
      };
    }
    const [lead, rest] = options?.numbered
      ? [value.split('\n').slice(0, 3).join('\n'), value.split('\n').slice(3).join('\n')]
      : splitLead(value);
    const leadCount = lead.split('\n').filter((l) => l.trim()).length;
    return {
      stack: [
        {
          stack: [header, ...extra, contentBox(render(lead), highlight, rest ? 'bottom' : undefined)],
          unbreakable: true,
        },
        ...(rest ? [contentBox(render(rest, leadCount + 1), highlight, 'top')] : []),
      ],
      margin: [0, 0, 0, 2],
    };
  }

  /** Tabla de datos con título numerado; nunca se imprime vacía. */
  private dataTable(title: string, widths: string[], header: string[], data: string[][]): Content {
    if (!data.length) return { text: '' };
    const head = this.bandTitle(title);
    const compact = widths.length >= 8;
    const layout = compact ? compactTableLayout : dataTableLayout;
    const rows = data.map((r) => r.map((c) => tableCell(c, false, compact)));
    const headerRow = header.map((h) => tableHeaderCell(h, compact));
    if (data.length <= 15) {
      return {
        unbreakable: true,
        stack: [head, { table: { widths, headerRows: 1, body: [headerRow, ...rows] }, layout, margin: [0, 0, 0, 6] }],
      };
    }
    // Tabla larga: título, encabezado y primeras filas viajan juntos; el resto continúa debajo.
    return {
      stack: [
        {
          unbreakable: true,
          stack: [head, { table: { widths, body: [headerRow, ...rows.slice(0, 4)] }, layout }],
        },
        {
          table: { widths, body: rows.slice(4) },
          layout: { ...layout, hLineWidth: (i: number) => (i === 0 ? 0 : 0.4), fillColor: (row: number) => (row % 2 ? '#FAFBFC' : null) },
          margin: [0, 0, 0, 6],
        },
      ],
    };
  }

  /** Diagnóstico principal destacado (barra dorada) y, si hay más, la tabla completa. */
  private diagnosisBlock(
    title: string,
    items: Array<{ code: string; description: string; type: string; tooth?: string }>,
  ): Content {
    const list = items.filter((d) => String(d.code || '').trim() || String(d.description || '').trim());
    if (!list.length) return { text: '' };
    const [main] = list;
    const highlight = contentBox(
      {
        stack: [
          { text: (main.type || 'Diagnóstico principal').toUpperCase(), fontSize: 6.8, color: P.muted, characterSpacing: 0.5 },
          {
            text: [
              ...(main.code ? [{ text: `${main.code}  `, font: 'Times', bold: true, fontSize: 13, color: P.navy }] : []),
              { text: main.description || '', fontSize: 9.6, bold: true, color: P.ink },
            ],
            margin: [0, 2, 0, 0],
          },
          ...(main.tooth ? [{ text: `Diente ${main.tooth}`, style: 'muted', margin: [0, 2, 0, 0] }] : []),
        ],
      } as Content,
      true,
    );
    const hasExtra = list.some((d) => d.tooth !== undefined);
    return {
      stack: [
        sectionHeader(++this.sectionNo, title),
        highlight,
        ...(list.length > 1
          ? [
              {
                table: {
                  widths: hasExtra ? ['14%', '12%', '*', '12%'] : ['16%', '*', '16%'],
                  headerRows: 1,
                  body: [
                    (hasExtra ? ['Tipo', 'CIE-10', 'Descripción', 'Diente'] : ['Código', 'Descripción', 'Tipo']).map((h) =>
                      tableHeaderCell(h),
                    ),
                    ...list.map((d) =>
                      (hasExtra ? [d.type, d.code, d.description, d.tooth || ''] : [d.code, d.description, d.type]).map((c) =>
                        tableCell(c),
                      ),
                    ),
                  ],
                },
                layout: dataTableLayout,
                margin: [0, 6, 0, 0],
              } as Content,
            ]
          : []),
      ],
      unbreakable: list.length <= 12,
      margin: [0, 0, 0, 6],
    };
  }

  /** Serie EVA real: valoración inicial + EVA escrita en cada evolución. */
  private physioPainSeries(
    content: Record<string, unknown>,
    evolutions: NonNullable<EncounterPdfRow['clinicalRecord']>['evolutions'],
  ): Array<{ label: string; value: number }> {
    const day = (d?: Date | string | null) => {
      if (!d) return '';
      const x = new Date(d);
      return Number.isNaN(x.getTime())
        ? ''
        : x.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit' });
    };
    const physio = (content.physiotherapy || {}) as Record<string, unknown>;
    const fa = (physio.functionalAssessment || {}) as Record<string, unknown>;
    const points: Array<{ label: string; value: number }> = [];
    const initial = physioPainFromText(`EVA ${String(fa.pain ?? '')}`);
    if (initial !== null && String(fa.pain ?? '').trim()) points.push({ label: 'Inicial', value: initial });
    for (const ev of evolutions) {
      const c = (ev.content || {}) as Record<string, unknown>;
      const v = physioPainFromText(`${String(c.currentSituation ?? '')}\n${String(c.note ?? '')}`);
      if (v !== null) points.push({ label: day(ev.clinicalAttentionDate ?? ev.signedAt) || `#${points.length + 1}`, value: v });
    }
    return points;
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
