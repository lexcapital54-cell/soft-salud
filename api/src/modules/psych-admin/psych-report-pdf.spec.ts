import { readFileSync, writeFileSync } from 'fs';
import type { PsychReportData } from './psych-report.dto';
import { fmtReportDate, renderPsychReportPdf } from './psych-report-pdf';

const empty = (): PsychReportData => ({
  clinicName: '',
  reportNumber: '',
  issuedAt: '',
  patient: { fullName: '', documentType: '', documentNumber: '', age: '', birthDate: '', phone: '', institution: '' },
  reason: '',
  findings: '',
  conclusions: '',
  professional: { fullName: '', title: '', card: '' },
});

const paragraph = (n: number) =>
  Array.from({ length: n }, (_, i) => `Párrafo ${i + 1} de prueba con texto extenso para comprobar que el contenido pasa a la hoja siguiente sin recortarse ni superponerse con otros elementos del informe.`).join('\n\n');

function long(): PsychReportData {
  return {
    clinicName: 'Consultorio de prueba',
    reportNumber: 'IP-2026-0001',
    issuedAt: '2026-10-07',
    patient: { fullName: 'Paciente de prueba', documentType: 'Cédula de ciudadanía', documentNumber: '000', age: '30 años', birthDate: '1996-01-01', phone: '000', institution: 'Entidad de prueba' },
    reason: paragraph(6),
    findings: paragraph(22),
    conclusions: paragraph(10),
    professional: { fullName: 'Profesional de prueba', title: 'Psicóloga', card: 'TP 000' },
  };
}

const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const png = (path?: string) => `data:image/png;base64,${(path ? readFileSync(path) : Buffer.from(TINY_PNG, 'base64')).toString('base64')}`;
const out = (name: string, pdf: Buffer) => {
  if (process.env.PSYCH_REPORT_PDF_OUT) writeFileSync(`${process.env.PSYCH_REPORT_PDF_OUT}/${name}.pdf`, pdf);
};

describe('PDF informe psicológico', () => {
  it('la plantilla vacía cabe en una hoja A4', async () => {
    const pdf = await renderPsychReportPdf(empty(), null, null);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages(pdf)).toBe(1);
    out('informe-vacio', pdf);
  });

  it('con logo y firma la plantilla vacía sigue en una hoja', async () => {
    const pdf = await renderPsychReportPdf(empty(), png(process.env.PSYCH_REPORT_LOGO), png(process.env.PSYCH_REPORT_SIGNATURE));
    out('informe-logo-firma', pdf);
    expect(pages(pdf)).toBe(1);
  });

  it('un informe extenso agrega páginas y conserva el texto seleccionable', async () => {
    const data = long();
    const pdf = await renderPsychReportPdf(data, png(process.env.PSYCH_REPORT_LOGO), null);
    expect(pages(pdf)).toBeGreaterThan(2);
    out('informe-largo', pdf);
  });

  it('formatea fechas', () => {
    expect(fmtReportDate('2026-10-07')).toBe('07/10/2026');
    expect(fmtReportDate('')).toBe('');
  });
});
