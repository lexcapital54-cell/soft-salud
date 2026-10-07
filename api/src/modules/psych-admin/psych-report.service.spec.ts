import { ClinicSpecialty } from '@prisma/client';
import type { User } from '../../users/user.entity';
import type { PsychReportData } from './psych-report.dto';
import { PsychReportService } from './psych-report.service';
import { renderPsychReportPdf } from './psych-report-pdf';

jest.mock('./psych-report-pdf', () => ({ renderPsychReportPdf: jest.fn(async () => Buffer.from('%PDF')) }));

const SIG = 'data:image/png;base64,iVBORw0KGgo=';
const render = renderPsychReportPdf as jest.Mock;

function setup(profile: Partial<{ fullName: string; professionalTitle: string | null; professionalCard: string | null; professionalSignatureBase64: string | null }> = {}) {
  const prisma = {
    clinic: { findUnique: jest.fn(async () => ({ id: 'c1', name: 'Consultorio', specialty: ClinicSpecialty.PSYCHOLOGY })) },
    user: {
      findUnique: jest.fn(async () => ({
        fullName: 'Dra. Ana Pérez',
        professionalTitle: 'Psicóloga',
        professionalCard: 'TP 123',
        professionalSignatureBase64: SIG,
        ...profile,
      })),
    },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const logos = { find: jest.fn(async () => null) };
  const service = new PsychReportService(prisma as never, logos as never);
  const user = { id: 'u1', clinicId: 'c1', fullName: 'Dra. Ana Pérez' } as User;
  return { service, user };
}

const data = (pro: Partial<PsychReportData['professional']> = {}): PsychReportData => ({
  clinicName: 'Consultorio',
  reportNumber: '',
  issuedAt: '2026-10-07',
  patient: { fullName: 'Paciente', documentType: '', documentNumber: '', age: '', birthDate: '', phone: '', institution: '' },
  reason: '',
  findings: '',
  conclusions: '',
  professional: { fullName: '', title: '', card: '', ...pro },
});

describe('PDF del informe: datos y firma del profesional', () => {
  beforeEach(() => render.mockClear());

  it('sin datos del profesional usa nombre, título, tarjeta y firma del perfil', async () => {
    const { service, user } = setup();
    await service.pdf(user, { data: data() }, undefined, {});
    const [d, , sig] = render.mock.calls[0];
    expect(d.professional).toEqual({ fullName: 'Dra. Ana Pérez', title: 'Psicóloga', card: 'TP 123' });
    expect(sig).toBe(SIG);
  });

  it('informe propio con datos parciales: completa lo que falta y agrega la firma', async () => {
    const { service, user } = setup();
    await service.pdf(user, { data: data({ fullName: 'Ana Perez', card: 'TP 999' }) }, undefined, {});
    const [d, , sig] = render.mock.calls[0];
    expect(d.professional).toEqual({ fullName: 'Ana Perez', title: 'Psicóloga', card: 'TP 999' });
    expect(sig).toBe(SIG);
  });

  it('nunca pone la firma de quien genera el PDF en el informe de otro profesional', async () => {
    const { service, user } = setup();
    await service.pdf(user, { data: data({ fullName: 'Otro Profesional' }) }, undefined, {});
    const [d, , sig] = render.mock.calls[0];
    expect(d.professional).toEqual({ fullName: 'Otro Profesional', title: '', card: '' });
    expect(sig).toBeNull();
  });

  it('respeta «Quitar firma»: queda la línea en blanco', async () => {
    const { service, user } = setup();
    await service.pdf(user, { data: data(), withoutSignature: true }, undefined, {});
    expect(render.mock.calls[0][2]).toBeNull();
  });

  it('sin firma registrada no inventa ninguna', async () => {
    const { service, user } = setup({ professionalSignatureBase64: null });
    await service.pdf(user, { data: data() }, undefined, {});
    expect(render.mock.calls[0][2]).toBeNull();
  });

  it('la plantilla en blanco ya trae los datos del profesional', async () => {
    const { service, user } = setup();
    const r = await service.blank(user);
    expect(r.data.professional).toEqual({ fullName: 'Dra. Ana Pérez', title: 'Psicóloga', card: 'TP 123' });
  });
});
