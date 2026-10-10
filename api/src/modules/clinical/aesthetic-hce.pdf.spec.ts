import { writeFileSync } from 'fs';
import { aestheticRecordSections, aestheticTrackingSections } from './aesthetic-hce.pdf';
import { HcePdfService } from './hce-pdf.service';

/** Datos ficticios de prueba; no corresponden a ningún paciente. */
const content = {
  careMinimum: { motive: 'Desea mejorar líneas de expresión en frente.' },
  aesthetic: {
    consult: { concerns: 'Arrugas frontales', zones: ['frente', 'glabela'], goals: 'Aspecto descansado', requestedTreatments: ['TOXINA'] },
    history: {
      allergies: { answer: 'NO', detail: '' },
      pregnancy: { answer: 'NA', detail: '' },
      keloids: { answer: 'SI', detail: 'Cicatriz queloide en hombro' },
    },
    previousTreatmentsAnswer: 'SI',
    previousTreatments: [{ id: 'a', type: 'TOXINA', date: '2025-03-10', zone: 'Frente', product: 'Producto X', complications: '', notes: '' }],
    medicationsAnswer: 'NO',
    medications: [],
    habits: { sunscreen: 'DIARIO' },
    systems: { skin: { status: 'POS', detail: 'Fotoenvejecimiento' } },
    vitals: { bloodPressure: '110/70', weightKg: '60', heightCm: '165' },
    exam: { wrinkles: 'Arrugas dinámicas frontales' },
    assessment: { fitzpatrick: 'III', glogau: 'II', params: { wrinkles: '2' } },
    diagnosis: { findings: 'Líneas dinámicas', contraindications: 'NINGUNA', justification: 'Indicación estética' },
    plan: { procedures: 'Toxina botulínica', followUpDate: '2026-11-01' },
  },
};

const tracking = {
  procedures: [
    {
      id: 'p1',
      date: '2026-10-01',
      type: 'TOXINA',
      zones: ['frente'],
      product: { name: 'Producto Y', lot: 'L-001', expiry: '2026-09-01', invima: 'INV-123' },
      quantity: '20',
      unit: 'U',
      status: 'FIRMADO',
      signedBy: 'Profesional de prueba',
      signedAt: '2026-10-01T15:00:00.000Z',
      addenda: [{ id: 'x', text: 'Control sin novedad', by: 'Profesional de prueba', at: '2026-10-05T15:00:00.000Z' }],
    },
  ],
  annotations: [{ id: 'n1', view: 'FRONTAL', zone: 'frente', kind: 'TRATADA', date: '2026-10-01', procedureId: 'p1', note: 'Línea media' }],
  photos: [{ id: 'f1', attachmentId: 'att1', angle: 'FRONTAL', moment: 'ANTES', date: '2026-10-01', procedureId: 'p1', note: '' }],
};

describe('PDF de la historia clínica estética', () => {
  it('imprime motivo, antecedentes respondidos y declara los no investigados', () => {
    const sections = aestheticRecordSections(content);
    const titles = sections.map((s) => s.title);
    expect(titles).toEqual(
      expect.arrayContaining(['Motivo de consulta', 'Antecedentes personales', 'Antecedentes no investigados', 'Valoración estética', 'Plan de manejo']),
    );
    const table = sections.find((s) => s.title === 'Antecedentes personales');
    expect(table?.kind === 'table' && table.rows).toContainEqual(['Alergias', 'No', '']);
    const pending = sections.find((s) => s.title === 'Antecedentes no investigados');
    expect(pending?.kind === 'text' && pending.text).toContain('Tabaquismo');
    const assess = sections.find((s) => s.title === 'Valoración estética');
    expect(assess?.kind === 'text' && assess.text).toContain('Fototipo de Fitzpatrick: III');
  });

  it('imprime procedimiento con lote, aviso de vencido, adenda, mapa y fotos', () => {
    const sections = aestheticTrackingSections(tracking, new Map([['att1', 'frente_antes.jpg']]));
    const proc = sections.find((s) => s.title.startsWith('Procedimiento: Toxina'));
    expect(proc?.kind === 'text' && proc.text).toContain('Lote: L-001');
    expect(proc?.kind === 'text' && proc.text).toContain('vencido a la fecha del procedimiento');
    expect(proc?.kind === 'text' && proc.text).toContain('Adenda de Profesional de prueba');
    expect(sections.some((s) => s.title === 'Mapa facial: anotaciones')).toBe(true);
    const photos = sections.find((s) => s.title === 'Fotografías clínicas registradas');
    expect(photos?.kind === 'table' && photos.rows[0][3]).toBe('frente_antes.jpg');
  });

  it('genera el PDF completo', async () => {
    const pdf = new HcePdfService();
    const buffer = await pdf.buildPdfBuffer(
      {
        id: 'enc-demo',
        externalCode: 'DEMO-1',
        modality: 'IN_PERSON',
        serviceType: null,
        specialtySnapshot: 'AESTHETIC',
        patient: { firstName: 'Paciente', lastName: 'Demo', documentType: 'CC', documentNumber: '000', birthDate: null },
        professional: { id: 'u', fullName: 'Profesional de prueba', professionalCard: null, email: '' },
        clinicalRecord: {
          id: 'r',
          status: 'DRAFT',
          noteFormat: 'FULL',
          content,
          signedAt: null,
          createdAt: new Date('2026-10-01T15:00:00Z'),
          updatedAt: new Date('2026-10-01T15:00:00Z'),
          evolutions: [],
        },
        diagnoses: [],
        procedures: [],
      } as never,
      { name: 'Consultorio demo', specialty: 'AESTHETIC', aestheticTracking: tracking, attachmentLabels: new Map([['att1', 'frente_antes.jpg']]) },
    );
    expect(buffer.length).toBeGreaterThan(5000);
    if (process.env.AES_PDF_OUT) writeFileSync(process.env.AES_PDF_OUT, buffer);
  });
});
