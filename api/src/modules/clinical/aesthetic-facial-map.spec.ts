import { markTypeLabel } from './aesthetic-hce.pdf';
import { applyAestheticIntegrity, pickAesthetic } from './aesthetic-tracking.integrity';

const medico = { id: 'u1', name: 'Dra. Prueba', canSign: true };
const t1 = new Date('2026-01-10T10:00:00Z');
const t2 = new Date('2026-02-10T10:00:00Z');

const mark = (extra: Record<string, unknown> = {}) => ({
  id: 'm1',
  view: 'FRONTAL',
  x: 100,
  y: 50,
  zone: 'frente',
  kind: 'PROCEDIMIENTO',
  date: '2026-01-10',
  procedureId: '',
  note: '',
  ...extra,
});

const save = (prev: unknown, next: unknown, at = t1) => {
  const after = pickAesthetic(next);
  applyAestheticIntegrity(pickAesthetic(prev), after, medico, at);
  return after;
};

describe('mapa facial: validación del editor', () => {
  it('acepta un punto planeado con cantidad y lateralidad', () => {
    const data = save({}, { annotations: [mark({ status: 'PLANEADO', procType: 'TOXINA', quantity: '4', unit: 'U', laterality: 'CENTRAL' })] });
    expect(data.annotations[0]._audit).toBeDefined();
  });

  it('acepta trazos con vértices dentro del rostro', () => {
    expect(() =>
      save({}, { annotations: [mark({ kind: 'NOTA', shape: 'polygon', points: [10, 10, 40, 10, 25, 40] })] }),
    ).not.toThrow();
  });

  it('rechaza coordenadas fuera del rostro', () => {
    expect(() => save({}, { annotations: [mark({ x: 250 })] })).toThrow(/fuera del rostro/);
    expect(() => save({}, { annotations: [mark({ shape: 'line', points: [0, 0, 10, 300] })] })).toThrow(/fuera del rostro/);
  });

  it('rechaza trazos incompletos, formas o estados desconocidos', () => {
    expect(() => save({}, { annotations: [mark({ shape: 'polygon', points: [1, 1, 2, 2] })] })).toThrow(/incompleto/);
    expect(() => save({}, { annotations: [mark({ shape: 'estrella' })] })).toThrow(/trazo no válido/);
    expect(() => save({}, { annotations: [mark({ status: 'APLICADO' })] })).toThrow(/Estado no válido/);
    expect(() => save({}, { annotations: [mark({ shape: 'zone', zone: '' })] })).toThrow(/región/);
  });

  it('rechaza cantidades que no son números', () => {
    expect(() => save({}, { annotations: [mark({ quantity: '4 U' })] })).toThrow(/número positivo/);
    expect(() => save({}, { annotations: [mark({ quantity: '-2' })] })).toThrow(/número positivo/);
    expect(() => save({}, { annotations: [mark({ quantity: '2,5' })] })).not.toThrow();
  });

  it('rechaza demasiados vértices', () => {
    const points = Array.from({ length: 482 }, (_, i) => (i % 2 ? 100 : 50));
    expect(() => save({}, { annotations: [mark({ shape: 'freehand', points })] })).toThrow(/demasiados/);
  });

  it('no revalida marcas anteriores que no cambian', () => {
    const legacy = { id: 'old', view: 'FRONTAL', x: 10, y: 20, zone: 'frente', kind: 'TRATADA', date: '2025-01-01', procedureId: '', note: '' };
    const prev = save({}, { annotations: [legacy] });
    expect(() => save(prev, { annotations: [...prev.annotations, mark()] }, t2)).not.toThrow();
  });

  it('una marca cerrada sigue sin poder cambiar de estado', () => {
    const prev = save({}, { annotations: [mark({ status: 'PLANEADO', close: true })] });
    expect(prev.annotations[0].lockedAt).toBe(t1.toISOString());
    expect(() => save(prev, { annotations: [{ ...prev.annotations[0], status: 'REALIZADO' }] }, t2)).toThrow(/cerrada/);
  });
});

describe('mapa facial: etiqueta en el PDF', () => {
  it('describe procedimiento, estado y cantidad', () => {
    expect(markTypeLabel({ kind: 'PROCEDIMIENTO', procType: 'TOXINA', status: 'REALIZADO', quantity: '4', unit: 'U' })).toBe(
      'Toxina botulínica · Realizado · 4 U',
    );
  });

  it('deduce el estado de las marcas anteriores', () => {
    expect(markTypeLabel({ kind: 'TRATADA' })).toBe('Procedimiento · Realizado');
    expect(markTypeLabel({ kind: 'PLAN' })).toBe('Procedimiento · Planeado');
    expect(markTypeLabel({ kind: 'HALLAZGO' })).toBe('Hallazgo');
  });
});
