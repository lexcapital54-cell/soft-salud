import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { bogotaDateTime, dataTable } from './consent-pdf.document';
import {
  CONSENT_PAGE_MARGINS,
  CONSENT_PAGE_SIZE,
  CONSENT_PDF_STYLES,
  ConsentPdfBrand,
  consentPdfFooter,
  consentPdfHeader,
  sectionTitle,
  signatureBlock,
} from './consent-pdf.layout';

export type ConsentRevocationPdfInput = {
  brand: ConsentPdfBrand;
  consentId: string;
  templateTitle: string;
  originalSignedAt: Date;
  originalHash: string | null;
  patientName: string;
  patientDocument: string;
  signerName: string;
  signatureBase64: string;
  reason: string;
  revokedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  registeredBy: string;
};

export function buildRevocationDocument(
  input: ConsentRevocationPdfInput,
  revocationHash: string,
): TDocumentDefinitions {
  const revokedLocal = bogotaDateTime(input.revokedAt);
  return {
    pageSize: CONSENT_PAGE_SIZE,
    pageMargins: CONSENT_PAGE_MARGINS,
    info: {
      title: `Revocatoria ${input.brand.documentCode}`,
      author: input.brand.clinicName,
      creator: 'HABILISALUD',
    },
    header: consentPdfHeader(input.brand),
    footer: consentPdfFooter(revocationHash, input.consentId),
    defaultStyle: { font: 'Helvetica', fontSize: 10, lineHeight: 1.35, color: '#1f2937' },
    content: [
      { text: 'REVOCATORIA VOLUNTARIA DEL CONSENTIMIENTO INFORMADO', style: 'title' },
      sectionTitle('Documento revocado'),
      dataTable([
        ['Consentimiento', `${input.brand.documentCode} · ${input.templateTitle}`],
        ['Firmado originalmente', bogotaDateTime(input.originalSignedAt)],
        ['Hash SHA-256 original', input.originalHash || 'No registrado'],
        ['Paciente', `${input.patientName} · ${input.patientDocument}`],
      ]),
      sectionTitle('Declaración de revocatoria'),
      {
        text: `Yo, ${input.signerName}, en uso de mi derecho a la autonomía, REVOCO de manera libre y voluntaria el consentimiento informado identificado arriba, a partir de la fecha y hora de esta firma. Se me explicaron los riesgos de suspender o no iniciar el tratamiento. Entiendo que la revocatoria no afecta los procedimientos ya realizados ni elimina la historia clínica, que debe conservarse conforme a la ley.`,
        style: 'body',
      },
      { text: 'Motivo expresado por el paciente', style: 'detailTitle' },
      { text: input.reason, style: 'body' },
      sectionTitle('Firma'),
      {
        columns: [
          signatureBlock({
            label: 'Firma de quien revoca',
            image: input.signatureBase64,
            name: input.signerName,
            stamp: `Revocado el ${revokedLocal}`,
          }),
          {
            stack: [
              { text: 'Registrado por', style: 'muted', margin: [0, 0, 0, 6] },
              { text: input.registeredBy, style: 'signName' },
            ],
          },
        ],
        columnGap: 24,
      },
      sectionTitle('Sello de tiempo y trazabilidad'),
      {
        ul: [
          `Fecha/hora (America/Bogota): ${revokedLocal}`,
          `Timestamp UTC: ${input.revokedAt.toISOString()}`,
          `IP: ${input.ipAddress || 'no registrada'}`,
          `Dispositivo (User-Agent): ${(input.userAgent || 'no registrado').slice(0, 160)}`,
          `Hash SHA-256 de la revocatoria: ${revocationHash}`,
          `ID consentimiento: ${input.consentId}`,
        ],
        style: 'muted',
      },
    ],
    styles: CONSENT_PDF_STYLES,
  };
}
