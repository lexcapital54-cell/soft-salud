/** Contorno facial frontal en trazo de línea (viewBox de 200 de ancho, eje medio x = 100). */

type Seg = [number, number, number, number, number, number];

const START: [number, number] = [100, 16];
/** Mitad izquierda del dibujo (lado izquierdo del paciente): bóveda, sien, cigoma, rama, ángulo y mentón. */
const HALF: Seg[] = [
  [124, 16, 146, 28, 154, 52],
  [160, 68, 160, 84, 158, 98],
  [164, 106, 165, 120, 160, 132],
  [158, 150, 155, 164, 148, 176],
  [136, 194, 118, 206, 100, 208],
];

function buildOutline() {
  const m = (x: number) => 200 - x;
  let d = `M${START[0]},${START[1]}`;
  for (const s of HALF) d += ` C${s.join(',')}`;
  const points: Array<[number, number]> = [START, ...HALF.map((s) => [s[4], s[5]] as [number, number])];
  for (let i = HALF.length - 1; i >= 0; i--) {
    const [c1x, c1y, c2x, c2y] = HALF[i];
    const [px, py] = points[i];
    d += ` C${m(c2x)},${c2y},${m(c1x)},${c1y},${m(px)},${py}`;
  }
  return d + ' Z';
}

export const FACE_OUTLINE = buildOutline();

/** Pabellón auricular derecho del dibujo; el izquierdo se obtiene reflejando. */
export const EAR = 'M160,98 C169,92 175,102 173,116 C171,128 167,136 160,136 M162,104 C167,103 169,110 168,118 C167,124 164,127 161,127';

export const MIRROR = 'translate(200 0) scale(-1 1)';

/** Rasgos en línea fina ubicados según glabela (G), subnasal (Sn) y mentón (Me). */
export function faceFeatures(g: number, sn: number, me: number) {
  const ey = g + (sn - g) * 0.22;
  const st = sn + (me - sn) * 0.32;
  return {
    brows: `M64,${g - 1} Q77,${g - 8} 91,${g - 3} M136,${g - 1} Q123,${g - 8} 109,${g - 3}`,
    eyes: `M66,${ey} Q77,${ey - 6} 88,${ey} Q77,${ey + 4.5} 66,${ey} M134,${ey} Q123,${ey - 6} 112,${ey} Q123,${ey + 4.5} 134,${ey}`,
    irisY: ey,
    nose: `M95,${g + 6} Q93,${(g + sn) / 2} 90,${sn - 7} M105,${g + 6} Q107,${(g + sn) / 2} 110,${sn - 7} M88,${sn - 5} Q89,${sn + 1} 95,${sn} Q100,${sn + 2} 105,${sn} Q111,${sn + 1} 112,${sn - 5}`,
    lips: `M83,${st} Q91,${st - 6} 100,${st - 3.5} Q109,${st - 6} 117,${st} M83,${st} Q100,${st + 2} 117,${st} M85,${st + 1} Q100,${st + 10} 115,${st + 1}`,
  };
}
