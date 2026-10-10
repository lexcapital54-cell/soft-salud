import { fillConsentPlaceholders } from '../consent-placeholders';
import { AESTHETIC_CONSENTS } from './aesthetic-consents';

describe('Consentimientos de estética', () => {
  it('tienen códigos únicos que caben en la columna', () => {
    const codes = AESTHETIC_CONSENTS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((c) => expect(c.length).toBeLessThanOrEqual(60));
  });

  it.each(AESTHETIC_CONSENTS.map((c) => [c.code, c.bodyHtml]))(
    '%s queda sin guiones tras rellenar los datos',
    (_code, html) => {
      const out = fillConsentPlaceholders(html, {
        signerName: 'Paciente Ficticia',
        signerDocumentType: 'CC',
        signerDocumentNumber: '123',
        professionalName: 'Médica Ficticia',
        professionalCard: '999',
        signedAt: new Date('2026-01-15T12:00:00Z'),
      });
      expect(out).not.toMatch(/_{5,}/);
      expect(out).toContain('Paciente Ficticia');
      if (html.includes('médico(a)')) expect(out).toContain('Médica Ficticia');
    },
  );
});
