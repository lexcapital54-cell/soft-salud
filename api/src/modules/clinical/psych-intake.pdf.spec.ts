import { psychAgeLabel, psychBirthLabel, psychInfoTable, psychPatientRows } from './psych-intake.pdf';

describe('psychPatientRows', () => {
  it('imprime la ficha de ingreso con extras, edad y residencia', () => {
    const rows = psychPatientRows({
      firstName: 'Laura',
      lastName: 'Prueba',
      documentType: 'CC',
      documentNumber: '123',
      birthDate: new Date('1995-03-02T00:00:00Z'),
      city: 'Manizales',
      department: 'Caldas',
      eps: 'Salud Total',
      extras: { birthPlace: 'Pereira', stratum: '3', otherSpecialtyCare: ['Psiquiatría'], otherSpecialtyDetail: 'Control mensual', currentMedications: 'Sertralina' },
    });
    const id = Object.fromEntries(rows.identification);
    const health = Object.fromEntries(rows.health);
    expect(id['Nombres y apellidos']).toBe('Laura Prueba');
    expect(id['Fecha de nacimiento']).toBe('02/03/1995');
    expect(id['Lugar de nacimiento']).toBe('Pereira');
    expect(id['Municipio de residencia']).toBe('Manizales, Caldas');
    expect(health['Otra especialidad']).toBe('Psiquiatría — Control mensual');
    expect(health['Medicamentos actuales']).toBe('Sertralina');
  });

  it('marca «No cuenta con otra especialidad» y omite vacíos', () => {
    const rows = psychPatientRows({ firstName: 'A', lastName: 'B', extras: { otherSpecialtyCare: ['Ninguna'] } });
    expect(Object.fromEntries(rows.health)['Otra especialidad']).toBe('No cuenta con otra especialidad');
    expect(psychInfoTable([['EPS', '']], '#000')).toBeNull();
  });

  it('calcula la edad por día calendario', () => {
    expect(psychBirthLabel(null)).toBe('');
    expect(psychAgeLabel('2000-10-05T00:00:00Z', new Date(2026, 9, 4))).toBe('25 años');
    expect(psychAgeLabel('2000-10-05T00:00:00Z', new Date(2026, 9, 5))).toBe('26 años');
  });
});
