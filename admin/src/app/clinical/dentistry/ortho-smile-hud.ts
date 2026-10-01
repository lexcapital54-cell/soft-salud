import { Component, computed, input, output, signal } from '@angular/core';
import { DentistryContent } from './dentistry.models';
import { SideFlags } from './ortho-exam.models';
import { SmilePhotoResult } from './ortho-smile-photo.models';
import { ANTERIOR_TEETH, GOLDEN_RANGE, TeethAnalysis, toothFindings } from './ortho-smile-teeth.models';

export type SmileLayer = 'muscles' | 'occlusion' | 'proportion' | 'status';

interface HudCard {
  key: SmileLayer;
  title: string;
  subtitle: string;
  summary: string;
  details: string[];
  alert: boolean;
}

const sides = (f: SideFlags) => (f.right && f.left ? 'bilateral' : f.right ? 'derecho' : 'izquierdo');

/** Tarjetas laterales del análisis de sonrisa: resumen de lo registrado en la historia y capas visibles sobre la foto. */
@Component({
  selector: 'app-ortho-smile-hud',
  template: `
    @for (c of cards(); track c.key) {
      <article class="hud-card" [class.off]="!layers()[c.key]" [class.alert]="c.alert">
        <header>
          <div>
            <h6>{{ c.title }}</h6>
            <small>{{ c.subtitle }}</small>
          </div>
          <button type="button" role="switch" class="hud-switch" [attr.aria-checked]="layers()[c.key]" [attr.aria-label]="'Mostrar capa ' + c.title" (click)="toggle.emit(c.key)">
            <span></span>
          </button>
        </header>
        <p>{{ c.summary }}</p>
        @if (c.details.length) {
          <button type="button" class="hud-more" (click)="open.set(open() === c.key ? null : c.key)">
            {{ open() === c.key ? 'Ocultar detalles' : 'Clic para detalles' }}
          </button>
          @if (open() === c.key) {
            <ul>
              @for (d of c.details; track $index) {
                <li>{{ d }}</li>
              }
            </ul>
          }
        }
      </article>
    }
  `,
  styleUrl: './ortho-smile-hud.scss',
})
export class OrthoSmileHud {
  readonly data = input.required<DentistryContent>();
  readonly result = input.required<SmilePhotoResult>();
  readonly teeth = input.required<TeethAnalysis>();
  readonly layers = input.required<Record<SmileLayer, boolean>>();
  readonly toggle = output<SmileLayer>();
  readonly open = signal<SmileLayer | null>(null);

  readonly cards = computed((): HudCard[] => [this.muscles(), this.occlusion(), this.proportion(), this.status()]);

  private muscles(): HudCard {
    const f = this.data().orthoExam.functional;
    const pain = (
      [
        ['Temporal', f.temporal],
        ['Masetero', f.masseter],
        ['Pterigoideo', f.pterygoid],
      ] as const
    )
      .filter(([, s]) => s.right || s.left)
      .map(([n, s]) => `${n} ${sides(s)}`);
    const joint = (
      [
        ['Dolor ATM', f.tmjPain],
        ['Chasquido', f.click],
        ['Crepitación', f.crepitus],
      ] as const
    )
      .filter(([, s]) => s.right || s.left)
      .map(([n, s]) => `${n} ${sides(s)}`);
    return {
      key: 'muscles',
      title: 'Musculatura',
      subtitle: 'Examen funcional registrado',
      summary: pain.length ? `Dolor a la palpación: ${pain.join(', ')}.` : 'Sin dolor muscular registrado en el examen funcional.',
      details: [
        ...joint,
        ...(f.notes?.trim() ? [f.notes.trim()] : []),
        'Las líneas sobre la foto son un esquema anatómico de referencia (cigomáticos, elevador, risorio, depresor); no son una detección automática.',
      ],
      alert: pain.length > 0,
    };
  }

  private occlusion(): HudCard {
    const i = this.data().orthodontics.intraoral;
    const rows = [
      i.molarRight && `Molar derecha: ${i.molarRight}`,
      i.molarLeft && `Molar izquierda: ${i.molarLeft}`,
      i.canineRight && `Canina derecha: ${i.canineRight}`,
      i.canineLeft && `Canina izquierda: ${i.canineLeft}`,
      i.overjet && `Resalte: ${i.overjet} mm`,
      i.overbite && `Sobremordida: ${i.overbite} mm`,
      i.crossBite && `Mordida cruzada: ${i.crossBite}${i.crossBiteSide ? ` (${i.crossBiteSide})` : ''}`,
      i.openBite && `Mordida abierta: ${i.openBite}`,
      i.dentalMidline && `Línea media: ${i.dentalMidline}`,
    ].filter((r): r is string => !!r);
    const cant = this.result().cant;
    return {
      key: 'occlusion',
      title: 'Oclusión',
      subtitle: 'Plano y líneas medias',
      summary: [cant && `Plano en la foto: ${cant.toLowerCase()}.`, rows.slice(0, 2).join(' · ') || 'Relación oclusal sin registrar en «Oclusión».']
        .filter(Boolean)
        .join(' '),
      details: rows,
      alert: !!cant && cant !== 'Sin inclinación',
    };
  }

  private proportion(): HudCard {
    const segs = this.teeth().segments.filter((s) => s.ratio);
    const out = segs.filter((s) => s.ratio!.tone === 'out');
    return {
      key: 'proportion',
      title: 'Proporción',
      subtitle: 'Anchos aparentes · referencia áurea',
      summary: segs.length
        ? segs
            .filter((s) => s.fdi % 10 !== 1)
            .map((s) => s.ratio!.text)
            .join(' · ') || 'Marque laterales y caninos para ver la proporción.'
        : 'Marque los contactos de 13 a 23 para calcular la proporción.',
      details: [
        ...this.teeth().segments.map((s) => `${s.fdi}: ancho aparente ${s.widthText}${s.ratio ? ` · ${s.ratio.text}${s.ratio.tone === 'out' ? ' (fuera de rango)' : ''}` : ''}`),
        `Referencia orientativa: ${String(GOLDEN_RANGE[0]).replace('.', ',')}–${String(GOLDEN_RANGE[1]).replace('.', ',')} (áurea 0,62); centrales simétricos ±10 %. El profesional interpreta.`,
      ],
      alert: out.length > 0,
    };
  }

  private status(): HudCard {
    const odo = this.data().odontogram;
    const found = ANTERIOR_TEETH.map((t) => ({ fdi: t.fdi, findings: toothFindings(odo[String(t.fdi)]) })).filter((t) => t.findings.length);
    const withFindings = found.map((t) => t.fdi);
    return {
      key: 'status',
      title: 'Estado dental',
      subtitle: 'Odontograma · 13 a 23',
      summary: withFindings.length ? `Hallazgos registrados en ${withFindings.join(', ')}.` : 'Sin hallazgos registrados en el odontograma para 13–23.',
      details: found.map((t) => `${t.fdi}: ${t.findings.join(', ')}`),
      alert: withFindings.length > 0,
    };
  }
}
