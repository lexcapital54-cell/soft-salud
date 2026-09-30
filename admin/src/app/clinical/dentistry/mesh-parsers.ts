/** Lectores mínimos de mallas 3D (STL binario/ASCII, OBJ, PLY ASCII/binario little endian). Devuelven triángulos: 9 floats por cara. */
export type MeshFormat = 'STL' | 'OBJ' | 'PLY';

export function meshFormatOf(fileName: string): MeshFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext === 'stl' ? 'STL' : ext === 'obj' ? 'OBJ' : ext === 'ply' ? 'PLY' : null;
}

export function parseMesh(buffer: ArrayBuffer, format: MeshFormat): Float32Array {
  if (format === 'STL') return parseStl(buffer);
  if (format === 'OBJ') return parseObj(new TextDecoder().decode(buffer));
  return parsePly(buffer);
}

function parseStl(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  if (buffer.byteLength >= 84) {
    const n = view.getUint32(80, true);
    if (84 + n * 50 === buffer.byteLength) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        const base = 84 + i * 50 + 12;
        for (let k = 0; k < 9; k++) out[i * 9 + k] = view.getFloat32(base + k * 4, true);
      }
      return out;
    }
  }
  const text = new TextDecoder().decode(buffer);
  const nums: number[] = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  return new Float32Array(nums.slice(0, nums.length - (nums.length % 9)));
}

function parseObj(text: string): Float32Array {
  const verts: number[] = [];
  const out: number[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('v ')) {
      const p = t.split(/\s+/);
      verts.push(+p[1], +p[2], +p[3]);
    } else if (t.startsWith('f ')) {
      const idx = t
        .split(/\s+/)
        .slice(1)
        .map((s) => {
          const i = parseInt(s.split('/')[0], 10);
          return i < 0 ? verts.length / 3 + i : i - 1;
        });
      for (let k = 1; k < idx.length - 1; k++) {
        for (const i of [idx[0], idx[k], idx[k + 1]]) out.push(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
      }
    }
  }
  return new Float32Array(out);
}

const PLY_SIZES: Record<string, number> = {
  char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8,
};

function readPly(view: DataView, offset: number, type: string): number {
  switch (type) {
    case 'char': case 'int8': return view.getInt8(offset);
    case 'uchar': case 'uint8': return view.getUint8(offset);
    case 'short': case 'int16': return view.getInt16(offset, true);
    case 'ushort': case 'uint16': return view.getUint16(offset, true);
    case 'int': case 'int32': return view.getInt32(offset, true);
    case 'uint': case 'uint32': return view.getUint32(offset, true);
    case 'double': case 'float64': return view.getFloat64(offset, true);
    default: return view.getFloat32(offset, true);
  }
}

function parsePly(buffer: ArrayBuffer): Float32Array {
  const bytes = new Uint8Array(buffer);
  const headEnd = findHeaderEnd(bytes);
  const header = new TextDecoder().decode(bytes.subarray(0, headEnd));
  const lines = header.split('\n').map((l) => l.trim());
  const ascii = lines.some((l) => l.startsWith('format ascii'));
  let nv = 0;
  let nf = 0;
  const vProps: Array<{ name: string; type: string }> = [];
  let faceCountType = 'uchar';
  let faceIndexType = 'int';
  let current = '';
  for (const l of lines) {
    const p = l.split(/\s+/);
    if (p[0] === 'element') {
      current = p[1];
      if (current === 'vertex') nv = +p[2];
      if (current === 'face') nf = +p[2];
    } else if (p[0] === 'property' && current === 'vertex') {
      vProps.push({ type: p[1], name: p[2] });
    } else if (p[0] === 'property' && current === 'face' && p[1] === 'list') {
      faceCountType = p[2];
      faceIndexType = p[3];
    }
  }
  const xi = vProps.findIndex((v) => v.name === 'x');
  const yi = vProps.findIndex((v) => v.name === 'y');
  const zi = vProps.findIndex((v) => v.name === 'z');
  const verts = new Float32Array(nv * 3);
  const out: number[] = [];
  const pushFace = (idx: number[]) => {
    for (let k = 1; k < idx.length - 1; k++) {
      for (const i of [idx[0], idx[k], idx[k + 1]]) out.push(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
    }
  };
  if (ascii) {
    const body = new TextDecoder().decode(bytes.subarray(headEnd)).split('\n').filter((l) => l.trim());
    for (let i = 0; i < nv; i++) {
      const p = body[i].trim().split(/\s+/).map(Number);
      verts[i * 3] = p[xi];
      verts[i * 3 + 1] = p[yi];
      verts[i * 3 + 2] = p[zi];
    }
    for (let f = 0; f < nf; f++) {
      const p = body[nv + f]?.trim().split(/\s+/).map(Number);
      if (p) pushFace(p.slice(1, 1 + p[0]));
    }
    return new Float32Array(out);
  }
  const view = new DataView(buffer);
  let off = headEnd;
  const stride = vProps.reduce((s, v) => s + (PLY_SIZES[v.type] ?? 4), 0);
  const offsets: number[] = [];
  vProps.reduce((s, v) => (offsets.push(s), s + (PLY_SIZES[v.type] ?? 4)), 0);
  for (let i = 0; i < nv; i++) {
    verts[i * 3] = readPly(view, off + offsets[xi], vProps[xi].type);
    verts[i * 3 + 1] = readPly(view, off + offsets[yi], vProps[yi].type);
    verts[i * 3 + 2] = readPly(view, off + offsets[zi], vProps[zi].type);
    off += stride;
  }
  const cs = PLY_SIZES[faceCountType] ?? 1;
  const is = PLY_SIZES[faceIndexType] ?? 4;
  for (let f = 0; f < nf && off < buffer.byteLength; f++) {
    const n = readPly(view, off, faceCountType);
    off += cs;
    const idx: number[] = [];
    for (let k = 0; k < n; k++) idx.push(readPly(view, off + k * is, faceIndexType));
    off += n * is;
    pushFace(idx);
  }
  return new Float32Array(out);
}

function findHeaderEnd(bytes: Uint8Array): number {
  const marker = 'end_header';
  const limit = Math.min(bytes.length, 65536);
  for (let i = 0; i < limit - marker.length; i++) {
    let ok = true;
    for (let k = 0; k < marker.length; k++) {
      if (bytes[i + k] !== marker.charCodeAt(k)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      let j = i + marker.length;
      while (j < bytes.length && bytes[j] !== 0x0a) j++;
      return j + 1;
    }
  }
  return 0;
}
