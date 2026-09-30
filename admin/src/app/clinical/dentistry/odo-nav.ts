/** Sub-secciones del módulo de ortodoncia para el menú fijo (se ubican por el texto del título). */
export const ORTHO_SUBNAV: Array<{ label: string; match: string }> = [
  { label: 'Facial', match: 'Análisis facial' },
  { label: 'Oclusión', match: 'Análisis intraoral' },
  { label: 'Cefalometría', match: 'Análisis cefalométrico' },
  { label: 'Modelos', match: 'Análisis de modelos' },
  { label: 'Diagnóstico', match: 'Diagnóstico, problemas' },
  { label: 'Plan', match: 'Planificación del tratamiento' },
  { label: 'Mecánica', match: 'Mecánica del tratamiento' },
  { label: 'Consentimientos', match: 'Consentimientos del tratamiento' },
  { label: 'Presupuesto', match: 'Presupuesto de ortodoncia' },
  { label: 'Seguimiento', match: 'Seguimiento del tratamiento' },
];

/** Altura (px desde arriba) a partir de la cual una sección se considera la actual. */
export const ODO_SPY_LINE = 170;

/** Última sección cuyo inicio ya pasó la línea de lectura. */
export function currentSection(ids: string[], line = ODO_SPY_LINE): string {
  let current = ids[0] ?? '';
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top <= line) current = id;
  }
  return current;
}

export function orthoSubHeadings(): Array<{ label: string; el: HTMLElement }> {
  const heads = Array.from(document.querySelectorAll<HTMLElement>('#odo-ortodoncia h4.odo-sub'));
  return ORTHO_SUBNAV.flatMap((s) => {
    const el = heads.find((h) => (h.textContent || '').trim().startsWith(s.match));
    return el ? [{ label: s.label, el }] : [];
  });
}

/** Desplaza horizontalmente el menú (contenedor con position: relative) para mostrar el botón activo. */
export function revealActiveChip(container: Element | null) {
  const btn = container?.querySelector<HTMLElement>('button.on');
  if (!container || !btn) return;
  const c = container as HTMLElement;
  const left = btn.offsetLeft;
  if (left < c.scrollLeft || left + btn.offsetWidth > c.scrollLeft + c.clientWidth) {
    c.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
  }
}
