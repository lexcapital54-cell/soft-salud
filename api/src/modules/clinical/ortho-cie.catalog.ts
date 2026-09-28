/**
 * CIE-10 de la historia de ortodoncia, en el orden en que se presenta al profesional.
 * El código se guarda sin punto (formato RIPS); `terms` son los hallazgos clínicos que
 * se codifican con ese mismo código y se ofrecen como descripción específica.
 */
export interface OrthoCieGroup {
  group: string;
  items: Array<{ code: string; description: string; terms?: string[] }>;
}

export const ORTHO_CIE_CATALOG: OrthoCieGroup[] = [
  {
    group: 'Anomalías maxilares y relaciones esqueletales',
    items: [
      {
        code: 'K070',
        description: 'Anomalías evidentes del tamaño de los maxilares',
        terms: ['Hipoplasia maxilar', 'Hiperplasia maxilar', 'Hipoplasia mandibular', 'Hiperplasia mandibular', 'Micrognacia', 'Macrognacia'],
      },
      {
        code: 'K071',
        description: 'Anomalías de la relación maxilobasilar',
        terms: ['Prognatismo mandibular', 'Prognatismo maxilar', 'Retrognatismo mandibular', 'Retrognatismo maxilar', 'Asimetría mandibular'],
      },
    ],
  },
  {
    group: 'Maloclusiones',
    items: [
      {
        code: 'K072',
        description: 'Anomalías de la relación entre los arcos dentarios',
        terms: [
          'Distoclusión',
          'Mesioclusión',
          'Mordida abierta anterior',
          'Mordida abierta posterior',
          'Mordida cruzada anterior',
          'Mordida cruzada posterior',
          'Sobremordida excesiva',
          'Sobremordida profunda',
          'Sobremordida vertical',
          'Sobremordida horizontal',
          'Desviación de la relación de los arcos dentarios',
          'Oclusión lingual posterior',
        ],
      },
    ],
  },
  {
    group: 'Posición de los dientes',
    items: [
      {
        code: 'K073',
        description: 'Anomalías de la posición del diente',
        terms: [
          'Apiñamiento dental',
          'Desplazamiento dental',
          'Diastema',
          'Espaciamiento anormal',
          'Rotación dental',
          'Transposición dental',
          'Diente incluido con posición anormal',
          'Alteración de posición de dientes adyacentes',
        ],
      },
    ],
  },
  {
    group: 'Maloclusión no especificada y otras anomalías',
    items: [
      { code: 'K074', description: 'Maloclusión de tipo no especificado' },
      { code: 'K078', description: 'Otras anomalías dentofaciales especificadas' },
      { code: 'K079', description: 'Anomalía dentofacial, no especificada' },
    ],
  },
  {
    group: 'Desarrollo y erupción',
    items: [
      { code: 'K000', description: 'Anodoncia' },
      { code: 'K001', description: 'Dientes supernumerarios' },
      { code: 'K002', description: 'Anomalías del tamaño y de la forma del diente' },
      { code: 'K004', description: 'Alteraciones en la formación dentaria' },
      { code: 'K006', description: 'Alteraciones de la erupción dentaria' },
    ],
  },
  {
    group: 'Dientes incluidos',
    items: [
      { code: 'K010', description: 'Dientes incluidos' },
      { code: 'K011', description: 'Dientes impactados' },
    ],
  },
  {
    group: 'Caries',
    items: [
      { code: 'K020', description: 'Caries limitada al esmalte' },
      { code: 'K021', description: 'Caries de la dentina' },
      { code: 'K029', description: 'Caries dental, no especificada' },
    ],
  },
  {
    group: 'Periodontal',
    items: [
      { code: 'K050', description: 'Gingivitis aguda' },
      { code: 'K051', description: 'Gingivitis crónica' },
      { code: 'K052', description: 'Periodontitis aguda' },
      { code: 'K053', description: 'Periodontitis crónica' },
      { code: 'K056', description: 'Enfermedad del periodonto, no especificada' },
    ],
  },
];

/** Filas del autocompletado: el código oficial y, debajo, cada hallazgo que se codifica con él. */
export function orthoCieRows() {
  return ORTHO_CIE_CATALOG.flatMap(({ group, items }) =>
    items.flatMap((item) => [
      { key: item.code, code: item.code, description: item.description, category: group },
      ...(item.terms ?? []).map((term) => ({
        key: `${item.code}-${term}`,
        code: item.code,
        description: term,
        category: `${group} · ${item.description}`,
      })),
    ]),
  );
}
