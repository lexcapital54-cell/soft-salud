type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : []);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export const AES_MAX_PROCEDURES = 400;
export const AES_MAX_ANNOTATIONS = 1500;

/** Tipos inyectables o implantables: exigen producto, lote y cantidad al firmar. */
const TRACEABLE_TYPES = new Set(['TOXINA', 'ACIDO_HIALURONICO', 'BIOESTIMULADOR', 'MESOTERAPIA', 'HILOS']);

/** Campos que solo escribe el servidor. */
const SERVER_KEYS = ['_audit', 'signedAt', 'signedBy', 'signedById', 'lockedAt', 'lockedBy'];

export class AestheticIntegrityError extends Error {}

/** JSONB reordena las claves: se compara con las claves ordenadas. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Json)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

function clinicalPart(row: Json, extra: string[] = []) {
  const copy: Json = { ...row };
  for (const k of [...SERVER_KEYS, ...extra]) delete copy[k];
  return stable(copy);
}

export const AES_MAX_PHOTOS = 2000;
const PHOTO_ANGLES = new Set(['FRONTAL', 'PERFIL_DER', 'PERFIL_IZQ', 'OBLICUA_DER', 'OBLICUA_IZQ', 'DETALLE']);
const PHOTO_MOMENTS = new Set(['ANTES', 'DESPUES', 'CONTROL']);

export function pickAesthetic(data: unknown) {
  const src = obj(data);
  return { annotations: arr(src.annotations), procedures: arr(src.procedures), photos: arr(src.photos) };
}

export type AestheticData = ReturnType<typeof pickAesthetic>;

export interface AestheticChange {
  signedProcedures: string[];
  lockedAnnotations: number;
  addenda: number;
}

/**
 * Aplica las reglas de integridad y sella autoría/fechas del servidor.
 * - Procedimiento firmado: no se borra ni se modifica; solo admite adendas nuevas.
 * - Anotación cerrada (o ligada a un procedimiento firmado): no se borra ni se modifica.
 * - Al firmar se exigen los datos mínimos de trazabilidad.
 */
export function applyAestheticIntegrity(
  previous: AestheticData,
  next: AestheticData,
  user: { id: string; name: string; canSign: boolean },
  now: Date,
): AestheticChange {
  if (
    next.procedures.length > AES_MAX_PROCEDURES ||
    next.annotations.length > AES_MAX_ANNOTATIONS ||
    next.photos.length > AES_MAX_PHOTOS
  ) {
    throw new AestheticIntegrityError('El seguimiento estético supera el número de registros permitido.');
  }
  const at = now.toISOString();
  const change: AestheticChange = { signedProcedures: [], lockedAnnotations: 0, addenda: 0 };

  const prevProcs = new Map(previous.procedures.map((p) => [text(p.id), p]));
  const nextIds = new Set(next.procedures.map((p) => text(p.id)));
  for (const [id, prev] of prevProcs) {
    if (prev.status === 'FIRMADO' && !nextIds.has(id)) {
      throw new AestheticIntegrityError(
        `No se puede eliminar un procedimiento firmado (${text(prev.date)} ${text(prev.type)}). Registre una adenda.`,
      );
    }
  }

  const signedIds = new Set<string>();
  for (const row of next.procedures) {
    const id = text(row.id);
    if (!id) throw new AestheticIntegrityError('Procedimiento sin identificador.');
    const prev = prevProcs.get(id);
    const prevAudit = obj(prev?._audit);

    if (prev?.status === 'FIRMADO') {
      if (clinicalPart(prev, ['addenda']) !== clinicalPart(row, ['addenda'])) {
        throw new AestheticIntegrityError(
          `El procedimiento del ${text(prev.date)} ya está firmado y no se puede modificar. Registre una adenda.`,
        );
      }
      const before = arr(prev.addenda);
      const after = arr(row.addenda);
      for (let i = 0; i < before.length; i++) {
        if (text(after[i]?.id) !== text(before[i].id) || text(after[i]?.text) !== text(before[i].text)) {
          throw new AestheticIntegrityError('Las adendas registradas no se pueden modificar ni eliminar.');
        }
        after[i] = before[i];
      }
      for (let i = before.length; i < after.length; i++) {
        if (!text(after[i].text)) throw new AestheticIntegrityError('La adenda no puede estar vacía.');
        after[i] = { id: text(after[i].id) || `ad-${now.getTime()}-${i}`, text: text(after[i].text), at, by: user.name };
        change.addenda += 1;
      }
      Object.assign(row, {
        addenda: after,
        signedAt: prev.signedAt,
        signedBy: prev.signedBy,
        signedById: prev.signedById,
        _audit: prev._audit,
      });
      signedIds.add(id);
      continue;
    }

    if (arr(row.addenda).length) row.addenda = [];
    for (const k of SERVER_KEYS) delete row[k];

    if (row.status === 'FIRMADO') {
      if (!user.canSign) throw new AestheticIntegrityError('Su rol no puede firmar procedimientos.');
      const missing: string[] = [];
      if (!text(row.date)) missing.push('fecha');
      if (!text(row.type)) missing.push('procedimiento');
      const zones = Array.isArray(row.zones) ? row.zones.filter((z) => typeof z === 'string' && z.trim()) : [];
      if (!zones.length && !text(row.zoneDetail)) missing.push('zona tratada');
      if (TRACEABLE_TYPES.has(text(row.type))) {
        const product = obj(row.product);
        if (!text(product.name)) missing.push('producto');
        if (!text(product.lot)) missing.push('lote');
        if (!String(row.quantity ?? '').trim()) missing.push('cantidad');
        if (!text(row.unit)) missing.push('unidad');
      }
      if (missing.length) {
        throw new AestheticIntegrityError(`Para firmar el procedimiento complete: ${missing.join(', ')}.`);
      }
      row.signedAt = at;
      row.signedBy = user.name;
      row.signedById = user.id;
      change.signedProcedures.push(id);
      signedIds.add(id);
    }

    const changed = !prev || clinicalPart(prev) !== clinicalPart(row);
    row._audit = {
      createdAt: text(prevAudit.createdAt) || at,
      createdBy: text(prevAudit.createdBy) || user.name,
      updatedAt: changed ? at : text(prevAudit.updatedAt) || at,
      updatedBy: changed ? user.name : text(prevAudit.updatedBy) || user.name,
    };
  }

  const prevAnn = new Map(previous.annotations.map((a) => [text(a.id), a]));
  const nextAnnIds = new Set(next.annotations.map((a) => text(a.id)));
  const isLocked = (a: Json) => !!text(a.lockedAt) || (!!text(a.procedureId) && signedIds.has(text(a.procedureId)));
  for (const [id, prev] of prevAnn) {
    if (isLocked(prev) && !nextAnnIds.has(id)) {
      throw new AestheticIntegrityError('No se puede eliminar una anotación cerrada del mapa facial.');
    }
  }
  for (const row of next.annotations) {
    const id = text(row.id);
    if (!id) throw new AestheticIntegrityError('Anotación sin identificador.');
    const prev = prevAnn.get(id);
    if (prev && text(prev.lockedAt)) {
      if (clinicalPart(prev, ['close']) !== clinicalPart(row, ['close'])) {
        throw new AestheticIntegrityError('La anotación ya está cerrada y no se puede modificar.');
      }
      Object.assign(row, { lockedAt: prev.lockedAt, lockedBy: prev.lockedBy, _audit: prev._audit });
      delete row.close;
      continue;
    }
    const wantsClose = row.close === true;
    delete row.close;
    for (const k of SERVER_KEYS) delete row[k];
    const prevAudit = obj(prev?._audit);
    const changed = !prev || clinicalPart(prev) !== clinicalPart(row);
    row._audit = {
      createdAt: text(prevAudit.createdAt) || at,
      createdBy: text(prevAudit.createdBy) || user.name,
      updatedAt: changed ? at : text(prevAudit.updatedAt) || at,
      updatedBy: changed ? user.name : text(prevAudit.updatedBy) || user.name,
    };
    const procedureSigned = !!text(row.procedureId) && signedIds.has(text(row.procedureId));
    if ((wantsClose && user.canSign) || procedureSigned) {
      row.lockedAt = at;
      row.lockedBy = user.name;
      change.lockedAnnotations += 1;
    }
  }

  // Fotos: ligadas a un procedimiento firmado quedan cerradas. Quitar una foto
  // abierta solo la saca del comparador; el archivo sigue anexo a la atención.
  const prevPhotos = new Map(previous.photos.map((p) => [text(p.id), p]));
  const nextPhotoIds = new Set(next.photos.map((p) => text(p.id)));
  const photoLocked = (p: Json) => !!text(p.lockedAt) || (!!text(p.procedureId) && signedIds.has(text(p.procedureId)));
  for (const [id, prev] of prevPhotos) {
    if (photoLocked(prev) && !nextPhotoIds.has(id)) {
      throw new AestheticIntegrityError('No se puede quitar una foto de un procedimiento firmado.');
    }
  }
  for (const row of next.photos) {
    const id = text(row.id);
    if (!id || !text(row.attachmentId)) throw new AestheticIntegrityError('Foto sin identificador o sin archivo.');
    if (!PHOTO_ANGLES.has(text(row.angle)) || !PHOTO_MOMENTS.has(text(row.moment))) {
      throw new AestheticIntegrityError('Indique el ángulo y el momento de la foto.');
    }
    const prev = prevPhotos.get(id);
    if (prev && text(prev.lockedAt)) {
      if (clinicalPart(prev) !== clinicalPart(row)) {
        throw new AestheticIntegrityError('La foto pertenece a un procedimiento firmado y no se puede modificar.');
      }
      Object.assign(row, { lockedAt: prev.lockedAt, lockedBy: prev.lockedBy, _audit: prev._audit });
      continue;
    }
    for (const k of SERVER_KEYS) delete row[k];
    const prevAudit = obj(prev?._audit);
    const changed = !prev || clinicalPart(prev) !== clinicalPart(row);
    row._audit = {
      createdAt: text(prevAudit.createdAt) || at,
      createdBy: text(prevAudit.createdBy) || user.name,
      updatedAt: changed ? at : text(prevAudit.updatedAt) || at,
      updatedBy: changed ? user.name : text(prevAudit.updatedBy) || user.name,
    };
    if (text(row.procedureId) && signedIds.has(text(row.procedureId))) {
      row.lockedAt = at;
      row.lockedBy = user.name;
    }
  }
  return change;
}

/** Adjuntos nuevos referenciados por las fotos (para validar que son del paciente). */
export function newPhotoAttachmentIds(previous: AestheticData, next: AestheticData): string[] {
  const known = new Set(previous.photos.map((p) => text(p.attachmentId)));
  return [...new Set(next.photos.map((p) => text(p.attachmentId)).filter((id) => id && !known.has(id)))];
}
