import { shiftLabel, withinShift } from './agenda-staff.service';

describe('turno de asistentes', () => {
  const staff = { shiftStart: '08:00', shiftEnd: '18:00' };
  const at = (iso: string) => new Date(iso);

  it('acepta citas dentro del turno en hora de Colombia', () => {
    expect(withinShift(staff, at('2026-10-12T08:00:00-05:00'), at('2026-10-12T09:00:00-05:00'))).toBe(true);
    expect(withinShift(staff, at('2026-10-12T17:00:00-05:00'), at('2026-10-12T18:00:00-05:00'))).toBe(true);
  });

  it('rechaza citas que empiezan antes o terminan después del turno', () => {
    expect(withinShift(staff, at('2026-10-12T07:30:00-05:00'), at('2026-10-12T08:30:00-05:00'))).toBe(false);
    expect(withinShift(staff, at('2026-10-12T17:30:00-05:00'), at('2026-10-12T18:30:00-05:00'))).toBe(false);
  });

  it('muestra el turno como en la agenda original', () => {
    expect(shiftLabel('08:00', '18:00')).toBe('8:00 a. m. – 6:00 p. m.');
  });
});
