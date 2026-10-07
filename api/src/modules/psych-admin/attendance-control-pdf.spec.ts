import { readFileSync, writeFileSync } from 'fs';
import type { AttendanceControlData } from './attendance-control.dto';
import { fmtDate, fmtTime, renderAttendanceControlPdf } from './attendance-control-pdf';
import { certificateErrors } from './attendance-control.service';

const blankRow = { date: '', time: '', modality: '' as const, status: '' as const, nextDate: '' };

function base(rows = 6): AttendanceControlData {
  return {
    clinicName: 'Consultorio de prueba',
    registeredAt: '2026-10-07',
    general: { userName: 'Usuario de prueba', identification: 'CC 000', professional: 'Profesional de prueba', site: 'Sede de prueba' },
    rows: Array.from({ length: rows }, (_, i) =>
      i % 2 ? blankRow : { date: '2026-10-07', time: '15:00', modality: 'PRESENCIAL' as const, status: 'ASIGNADA' as const, nextDate: '2026-10-14' },
    ),
    certificate: { assigned: true, attended: false, date: '2026-10-14', time: '09:30', place: 'Sede de prueba', issuedAt: '2026-10-07', responsible: 'Responsable de prueba' },
    notes: 'Observación administrativa de prueba.',
  };
}

const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;

describe('PDF control de citas y asistencia', () => {
  it('el formato inicial (6 filas) cabe en una hoja A4', async () => {
    const pdf = await renderAttendanceControlPdf(base(6), null);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages(pdf)).toBe(1);
    if (process.env.ATTENDANCE_PDF_OUT) writeFileSync(`${process.env.ATTENDANCE_PDF_OUT}/control-1.pdf`, pdf);
  });

  it('con el logo del consultorio sigue cabiendo en una hoja', async () => {
    const png = process.env.ATTENDANCE_LOGO
      ? readFileSync(process.env.ATTENDANCE_LOGO)
      : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const pdf = await renderAttendanceControlPdf(base(6), `data:image/png;base64,${png.toString('base64')}`);
    expect(pages(pdf)).toBe(1);
    if (process.env.ATTENDANCE_PDF_OUT) writeFileSync(`${process.env.ATTENDANCE_PDF_OUT}/control-logo.pdf`, pdf);
  });

  it('con muchas filas agrega páginas', async () => {
    const pdf = await renderAttendanceControlPdf(base(60), null);
    expect(pages(pdf)).toBeGreaterThan(1);
    if (process.env.ATTENDANCE_PDF_OUT) writeFileSync(`${process.env.ATTENDANCE_PDF_OUT}/control-60.pdf`, pdf);
  });

  it('exige los campos de la constancia solo si se marca una casilla', () => {
    const d = base();
    d.certificate.place = '';
    d.general.userName = ' ';
    expect(Object.keys(certificateErrors(d)).sort()).toEqual(['certificate.place', 'general.userName']);
    d.certificate.assigned = false;
    expect(certificateErrors(d)).toEqual({});
  });

  it('formatea fecha y hora', () => {
    expect(fmtDate('2026-10-07')).toBe('07/10/2026');
    expect(fmtTime('15:05')).toBe('3:05 p. m.');
    expect(fmtTime('00:30')).toBe('12:30 a. m.');
    expect(fmtDate('')).toBe('');
  });
});
