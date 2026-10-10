import { ConsentSignerRole } from '@prisma/client';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { CiSummarySection } from './consent-ci/ci-consent.validation';
import {
  CONSENT_PAGE_MARGINS,
  CONSENT_PAGE_SIZE,
  CONSENT_PDF_STYLES,
  consentPdfFooter,
  consentPdfHeader,
  sectionTitle,
  signatureBlock,
} from './consent-pdf.layout';
import { bareProfessionalCard } from './consent-placeholders';

export type ConsentPdfInput = {
  consentId: string;
  clinicId: string;
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  clinicNit?: string | null;
  clinicHabilitationCode?: string | null;
  templateCode: string;
  templateTitle: string;
  templateVersion: number;
  /** HTML ya diligenciado (placeholders rellenados) que el paciente aceptó. */
  bodyHtml: string;
  patientName: string;
  patientDocument: string;
  patientDocumentType: string;
  patientAge?: number | null;
  patientPhone?: string | null;
  patientEmail?: string | null;
  patientCity?: string | null;
  guardianRelationship?: string | null;
  signerName: string;
  signerDocument: string;
  signatureBase64: string;
  signedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  encounterId?: string | null;
  professionalName?: string | null;
  professionalCard?: string | null;
  professionalRole?: string | null;
  professionalSignatureBase64?: string | null;
  signerRole?: ConsentSignerRole | string | null;
  procedureSummary?: CiSummarySection[];
  procedureDetails?: unknown;
};

export function bogotaDateTime(date: Date) {
  return date.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'full',
    timeStyle: 'medium',
  });
}

const tableLayout = {
  hLineColor: () => '#e5e7eb',
  vLineColor: () => '#e5e7eb',
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

export function dataTable(rows: Array<[string, string]>): Content {
  return {
    table: {
      widths: ['32%', '68%'],
      body: rows.map(([k, v]) => [{ text: k, bold: true, color: '#374151' }, v || '—']),
    },
    layout: tableLayout,
    margin: [0, 0, 0, 8],
  };
}

function professionalLine(input: ConsentPdfInput) {
  if (!input.professionalName) return 'N/A';
  const card = bareProfessionalCard(input.professionalCard);
  return [input.professionalName, input.professionalRole, card ? `RP/TP ${card}` : null]
    .filter(Boolean)
    .join(' · ');
}

export function buildConsentDocument(
  input: ConsentPdfInput,
  contentHash: string,
): TDocumentDefinitions {
  const signedAtLocal = bogotaDateTime(input.signedAt);
  const isGuardian = input.signerRole === ConsentSignerRole.LEGAL_GUARDIAN;
  const signerRoleLabel = isGuardian
    ? 'Acudiente / representante legal'
    : input.signerRole === ConsentSignerRole.ASSENT
      ? 'Asentimiento del menor'
      : 'Paciente';

  const ipsRows: Array<[string, string]> = [
    ['Prestador / IPS', input.clinicName],
    ['NIT', input.clinicNit || 'No registrado'],
    ['Código de habilitación (REPS)', input.clinicHabilitationCode || 'No registrado'],
    ['Dirección', [input.clinicAddress, input.clinicPhone].filter(Boolean).join(' · ')],
  ];
  const patientRows: Array<[string, string]> = [
    ['Paciente', input.patientName],
    ['Documento', `${input.patientDocumentType} ${input.patientDocument}`],
    ['Edad', input.patientAge != null ? `${input.patientAge} años` : 'No registrada'],
    ['Teléfono · correo', [input.patientPhone, input.patientEmail].filter(Boolean).join(' · ')],
    ['Ciudad', input.patientCity || ''],
    ['Firmante', `${input.signerName} (${signerRoleLabel})`],
    ['Documento firmante', input.signerDocument],
    ...(isGuardian && input.guardianRelationship
      ? ([['Parentesco', input.guardianRelationship]] as Array<[string, string]>)
      : []),
    ['Profesional tratante', professionalLine(input)],
  ];

  const detail: Content[] = (input.procedureSummary ?? []).flatMap((section) => [
    { text: section.title, style: 'detailTitle' },
    { ul: section.items.map((item) => `[X] ${item}`), style: 'body', margin: [0, 0, 0, 4] },
  ]);

  const stamp = `Firmado el ${signedAtLocal}`;

  return {
    pageSize: CONSENT_PAGE_SIZE,
    pageMargins: CONSENT_PAGE_MARGINS,
    info: {
      title: `${input.templateCode} · ${input.templateTitle}`,
      author: input.clinicName,
      subject: `Consentimiento ${input.consentId}`,
      creator: 'HABILISALUD',
    },
    header: consentPdfHeader({
      clinicName: input.clinicName,
      clinicNit: input.clinicNit,
      clinicHabilitationCode: input.clinicHabilitationCode,
      clinicAddress: input.clinicAddress,
      clinicPhone: input.clinicPhone,
      documentCode: input.templateCode,
      documentVersion: input.templateVersion,
    }),
    footer: consentPdfFooter(contentHash, input.consentId),
    defaultStyle: { font: 'Helvetica', fontSize: 10, lineHeight: 1.35, color: '#1f2937' },
    content: [
      { text: input.templateTitle, style: 'title' },
      sectionTitle('Datos del prestador'),
      dataTable(ipsRows),
      sectionTitle('Datos del paciente, firmante y profesional'),
      dataTable(patientRows),
      sectionTitle('Texto legal aceptado'),
      ...htmlToPdfContent(input.bodyHtml),
      ...(detail.length ? [sectionTitle('Detalle del procedimiento'), ...detail] : []),
      sectionTitle('Firmas'),
      {
        columns: [
          signatureBlock({
            label: isGuardian ? 'Firma acudiente / representante legal' : 'Firma del paciente',
            image: input.signatureBase64,
            name: `${input.signerName} · ${input.signerDocument}`,
            stamp,
          }),
          signatureBlock({
            label: 'Firma del profesional tratante',
            image: input.professionalSignatureBase64,
            name: professionalLine(input),
            stamp,
          }),
        ],
        columnGap: 24,
      },
      sectionTitle('Sello de tiempo y trazabilidad'),
      {
        ul: [
          `Fecha/hora (America/Bogota): ${signedAtLocal}`,
          `Timestamp UTC: ${input.signedAt.toISOString()}`,
          `IP de firma: ${input.ipAddress || 'no registrada'}`,
          `Dispositivo (User-Agent): ${(input.userAgent || 'no registrado').slice(0, 160)}`,
          `Hash SHA-256 del contenido: ${contentHash}`,
          `ID consentimiento: ${input.consentId}`,
          `Atención: ${input.encounterId || 'N/A'}`,
        ],
        style: 'muted',
      },
      {
        text: 'Documento firmado electrónicamente (Ley 527 de 1999). Una vez sellado se considera evidencia inalterable del consentimiento; cualquier modificación cambia su código de integridad. Conservación según la normativa de historia clínica vigente.',
        style: 'footerNote',
        margin: [0, 16, 0, 0],
      },
    ],
    styles: CONSENT_PDF_STYLES,
  };
}

/** Convierte HTML simple de plantillas a bloques pdfmake. */
export function htmlToPdfContent(html: string): Content[] {
  const normalized = html
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(ul|ol|table|section|thead|tbody)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<h[1-3][^>]*>/gi, '§ ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    if (line.startsWith('§ ')) {
      return { text: line.replace(/^§\s*/, ''), style: 'heading' };
    }
    return { text: line, style: 'body' };
  });
}
