import { AestheticIntegrityError, applyAestheticIntegrity, pickAesthetic } from './aesthetic-tracking.integrity';

const medico = { id: 'u1', name: 'Dra. Prueba', canSign: true };
const auxiliar = { id: 'u2', name: 'Aux Prueba', canSign: false };
const t1 = new Date('2026-01-10T10:00:00Z');
const t2 = new Date('2026-02-10T10:00:00Z');

const toxina = (extra: Record<string, unknown> = {}) => ({
  id: 'p1',
  date: '2026-01-10',
  type: 'TOXINA',
  zones: ['frente'],
  product: { name: 'Producto ficticio', lot: 'L-001' },
  quantity: '20',
  unit: 'U',
  status: 'BORRADOR',
  ...extra,
});

function firmar() {
  const next = pickAesthetic({ procedures: [toxina({ status: 'FIRMADO' })], annotations: [{ id: 'a1', procedureId: 'p1', x: 10, y: 20 }] });
  applyAestheticIntegrity(pickAesthetic({}), next, medico, t1);
  return next;
}

describe('applyAestheticIntegrity', () => {
  it('sella la firma y cierra las anotaciones del procedimiento firmado', () => {
    const data = firmar();
    expect(data.procedures[0].signedBy).toBe('Dra. Prueba');
    expect(data.procedures[0].signedAt).toBe(t1.toISOString());
    expect(data.annotations[0].lockedAt).toBe(t1.toISOString());
  });

  it('exige lote, producto y cantidad para firmar un inyectable', () => {
    const next = pickAesthetic({ procedures: [toxina({ status: 'FIRMADO', product: { name: 'X' }, quantity: '' })] });
    expect(() => applyAestheticIntegrity(pickAesthetic({}), next, medico, t1)).toThrow(/lote, cantidad/);
  });

  it('no permite firmar a un rol sin firma', () => {
    const next = pickAesthetic({ procedures: [toxina({ status: 'FIRMADO' })] });
    expect(() => applyAestheticIntegrity(pickAesthetic({}), next, auxiliar, t1)).toThrow(AestheticIntegrityError);
  });

  it('no permite modificar ni borrar un procedimiento firmado', () => {
    const prev = firmar();
    const edit = pickAesthetic(JSON.parse(JSON.stringify(prev)));
    edit.procedures[0].quantity = '30';
    expect(() => applyAestheticIntegrity(prev, edit, medico, t2)).toThrow(/ya está firmado/);
    const removed = pickAesthetic({ procedures: [], annotations: prev.annotations });
    expect(() => applyAestheticIntegrity(prev, removed, medico, t2)).toThrow(/eliminar un procedimiento firmado/);
  });

  it('acepta adendas nuevas y conserva las anteriores', () => {
    const prev = firmar();
    const next = pickAesthetic(JSON.parse(JSON.stringify(prev)));
    next.procedures[0].addenda = [{ text: 'Control sin eventos adversos' }];
    const change = applyAestheticIntegrity(prev, next, medico, t2);
    expect(change.addenda).toBe(1);
    const addenda = next.procedures[0].addenda as Array<Record<string, unknown>>;
    expect(addenda[0].by).toBe('Dra. Prueba');

    const third = pickAesthetic(JSON.parse(JSON.stringify(next)));
    (third.procedures[0].addenda as Array<Record<string, unknown>>)[0].text = 'Texto cambiado';
    expect(() => applyAestheticIntegrity(next, third, medico, t2)).toThrow(/adendas registradas/);
  });

  it('no permite borrar ni mover una anotación cerrada', () => {
    const prev = firmar();
    const moved = pickAesthetic(JSON.parse(JSON.stringify(prev)));
    moved.annotations[0].x = 99;
    expect(() => applyAestheticIntegrity(prev, moved, medico, t2)).toThrow(/cerrada/);
    const removed = pickAesthetic({ procedures: prev.procedures, annotations: [] });
    expect(() => applyAestheticIntegrity(prev, removed, medico, t2)).toThrow(/cerrada/);
  });

  it('ignora campos de servidor enviados por el cliente en borradores', () => {
    const next = pickAesthetic({ procedures: [toxina({ signedBy: 'Falso', signedAt: '2020-01-01' })] });
    applyAestheticIntegrity(pickAesthetic({}), next, auxiliar, t1);
    expect(next.procedures[0].signedBy).toBeUndefined();
    expect(next.procedures[0].signedAt).toBeUndefined();
  });
});
