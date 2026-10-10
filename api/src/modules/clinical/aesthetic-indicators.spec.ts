import { ageAt, buildAestheticIndicators, sexLabel } from './aesthetic-indicators';

const at = (iso: string) => new Date(iso);

describe('Indicadores de medicina estética (datos ficticios)', () => {
  const base = {
    from: '2026-01-01',
    to: '2026-03-31',
    today: '2026-03-20',
    patients: [
      { id: 'p1', birthDate: at('1990-05-10'), sexAtBirth: 'F', createdAt: at('2026-01-10T15:00:00Z') },
      { id: 'p2', birthDate: at('1970-01-01'), sexAtBirth: 'M', createdAt: at('2025-06-01T15:00:00Z') },
      { id: 'p3', birthDate: null, sexAtBirth: null, createdAt: at('2025-01-01T15:00:00Z') },
    ],
    encounters: [
      { id: 'e1', patientId: 'p1', professionalId: 'u1', at: at('2026-01-15T15:00:00Z'), signed: true, aesthetic: { assessment: { fitzpatrick: 'III', glogau: 'II', skinType: 'MIXTA' } } },
      { id: 'e2', patientId: 'p1', professionalId: 'u1', at: at('2026-02-15T15:00:00Z'), signed: false, aesthetic: { assessment: { fitzpatrick: 'IV' } } },
      { id: 'e3', patientId: 'p2', professionalId: 'u2', at: at('2026-03-01T15:00:00Z'), signed: true, aesthetic: {} },
      { id: 'e4', patientId: 'p3', professionalId: 'u1', at: at('2025-12-01T15:00:00Z'), signed: true, aesthetic: {} },
    ],
    tracking: [
      {
        patientId: 'p1',
        data: {
          procedures: [
            { encounterId: 'e1', date: '2026-01-15', type: 'TOXINA', zones: ['frente', 'glabela'], status: 'FIRMADO', nextControl: '2026-02-01' },
            { encounterId: 'e2', date: '2026-02-15', type: 'ACIDO_HIALURONICO', zones: ['labios'], status: 'BORRADOR', adverseEvents: 'Edema leve', nextControl: '2026-04-05' },
          ],
        },
      },
      { patientId: 'p2', data: { procedures: [{ encounterId: 'e3', date: '2026-03-01', type: 'TOXINA', zones: ['frente'], status: 'FIRMADO', nextControl: '2026-03-10' }] } },
    ],
    appointments: [
      { status: 'COMPLETED', serviceName: 'Toxina' },
      { status: 'NO_SHOW', serviceName: 'Toxina' },
      { status: 'CANCELLED', serviceName: null },
    ],
    consentsSigned: 2,
  };

  it('agrega totales, procedimientos y controles del periodo', () => {
    const r = buildAestheticIndicators(base);
    expect(r.totals).toMatchObject({
      patients: 3,
      newPatients: 1,
      attendedPatients: 2,
      encounters: 3,
      signedRecords: 2,
      procedures: 3,
      signedProcedures: 2,
      adverseEvents: 1,
      upcomingControls: 1,
      overdueControls: 1,
      consentsSigned: 2,
      appointments: 3,
    });
    expect(r.procedureTypes).toEqual([
      { key: 'TOXINA', count: 2 },
      { key: 'ACIDO_HIALURONICO', count: 1 },
    ]);
    expect(r.zones[0]).toEqual({ key: 'frente', count: 2 });
    expect(r.monthly.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(r.topServices).toEqual([{ key: 'Toxina', count: 2 }]);
  });

  it('usa la valoración más reciente del periodo por paciente', () => {
    const r = buildAestheticIndicators(base);
    expect(r.fitzpatrick).toEqual([
      { key: 'IV', count: 1 },
      { key: 'Sin dato', count: 1 },
    ]);
  });

  it('filtra procedimientos por las atenciones del profesional', () => {
    const r = buildAestheticIndicators({ ...base, encounterFilter: new Set(['e3']) });
    expect(r.totals.procedures).toBe(1);
  });

  it('calcula edad y sexo sin exponer datos personales', () => {
    expect(ageAt(at('1990-05-10'), '2026-05-09')).toBe(35);
    expect(ageAt(at('1990-05-10'), '2026-05-10')).toBe(36);
    expect(sexLabel('MUJER')).toBe('Femenino');
    expect(sexLabel('Masculino')).toBe('Masculino');
    expect(sexLabel(null)).toBe('Sin dato');
    const r = buildAestheticIndicators(base);
    expect(JSON.stringify(r)).not.toContain('p1');
  });
});
