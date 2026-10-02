import { physioIntakeSections, physioZoneLabel } from './physio-intake.pdf';

describe('physioIntakeSections', () => {
  it('nombra las zonas con lado y vista', () => {
    expect(physioZoneLabel('ant:hombro_der')).toBe('Hombro derecho (anterior)');
    expect(physioZoneLabel('post:rodilla_izq')).toBe('Rodilla izquierda (posterior)');
    expect(physioZoneLabel('post:lumbar')).toBe('Región lumbar (posterior)');
  });

  it('arma antecedentes, zonas, valoración y terapias', () => {
    const out = physioIntakeSections({
      antecedentsDetail: { pathological: 'Asma', allergic: '', family: 'Madre con artritis' },
      functionalAssessment: { pain: '7' },
      intake: {
        referralSource: 'RECOMENDACION',
        assessmentDate: '2026-10-02',
        antecedents: {
          pathological: { diabetes: true },
          surgical: { noRefers: true },
          traumatic: { fractures: true },
          allergies: { noRefers: true },
        },
        zones: ['ant:hombro_der', 'post:lumbar'],
        zonesNotes: 'Irradia a glúteo',
        therapies: ['manualTherapy', 'electrotherapy'],
        therapiesOther: 'Crioterapia',
        posture: 'ALTERADA',
        postureNotes: 'Hipercifosis',
        rangeOfMotion: 'LIMITADO',
        strength: 'CONSERVADA',
        painFrequency: 'DIARIO',
      },
    });
    expect(out.header).toBe('¿Cómo llegó a la consulta?: Recomendación · Fecha de valoración: 2026-10-02');
    expect(out.antecedents.split('\n')).toEqual([
      'Patológicos: Diabetes, Asma',
      'Quirúrgicos: No refiere',
      'Traumáticos: Fracturas',
      'Alergias: No refiere',
      'Familiares: Madre con artritis',
    ]);
    expect(out.zones).toBe('Hombro derecho (anterior), Región lumbar (posterior)\nIrradia a glúteo');
    expect(out.assessment.split('\n')).toEqual([
      'Postura: Alterada — Hipercifosis',
      'Rango de movimiento: Limitado',
      'Fuerza muscular: Conservada',
      'Dolor EVA: 7/10 (severo)',
      'Frecuencia del dolor: Diario',
    ]);
    expect(out.therapies).toBe('Terapia manual, Electroterapia (TENS / IFC), Crioterapia');
  });

  it('historias antiguas sin valoración interactiva no agregan nada', () => {
    const out = physioIntakeSections({ functionalAssessment: { pain: '' } });
    expect(out).toEqual({ header: '', antecedents: '', zones: '', assessment: '', therapies: '' });
  });
});
