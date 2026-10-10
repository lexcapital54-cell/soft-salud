import { AESTHETIC_CIE_CATALOG } from './aesthetic-cie.catalog';
import { CatalogsService } from './catalogs.service';

describe('CIE-10 de medicina estética', () => {
  const service = new CatalogsService(null as never);

  it('no repite códigos y usa el formato de la tabla oficial', () => {
    const codes = AESTHETIC_CIE_CATALOG.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z]\d{2}(\.\d|X)$/));
  });

  it('sin búsqueda muestra primero los diagnósticos estéticos', async () => {
    const rows = await service.searchCie('', 300, 'AESTHETIC');
    expect(rows.length).toBe(AESTHETIC_CIE_CATALOG.length);
    expect(rows[0].code).toBe('Z41.1');
  });

  it('encuentra melasma por su nombre oficial sin tildes', async () => {
    const rows = await service.searchCie('cloasma', 1, 'AESTHETIC');
    expect(rows[0].code).toBe('L81.1');
  });
});
