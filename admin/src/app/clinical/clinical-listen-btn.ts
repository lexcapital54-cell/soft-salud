import { Component, computed, inject, input, output } from '@angular/core';
import { ClinicalTextToSpeechService } from './clinical-text-to-speech.service';

/** Botón reproducir / detener lectura del texto clínico guardado. */
@Component({
  selector: 'app-clinical-listen-btn',
  template: `
    <button
      type="button"
      class="listen-btn"
      [class.compact]="compact()"
      [disabled]="disabled()"
      [class.playing]="playing()"
      [class.no-text]="!text().trim()"
      [attr.aria-pressed]="playing()"
      [title]="hint()"
      (click)="onClick()"
    >
      <span class="listen-icon" aria-hidden="true">{{ playing() ? '⏹' : '▶' }}</span>
      {{
        loading()
          ? 'Preparando…'
          : playing()
            ? 'Detener'
            : 'Escuchar'
      }}
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .listen-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 44px;
      min-width: 132px;
      padding: 10px 18px;
      border-radius: 999px;
      border: 2px solid #5c4a9e;
      background: linear-gradient(180deg, #f6f3ff 0%, #ece6ff 100%);
      color: #3d2e72;
      font: inherit;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 6px 16px rgba(61, 46, 114, 0.12);
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        transform 0.12s ease;
    }

    .listen-btn:hover:not(:disabled) {
      background: #ebe3ff;
      border-color: #3d2e72;
      transform: translateY(-1px);
    }

    .listen-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .listen-btn.playing {
      background: #3d2e72;
      border-color: #3d2e72;
      color: #fff;
    }

    .listen-btn.no-text:not(.playing) {
      opacity: 0.72;
    }

    .listen-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(61, 46, 114, 0.12);
      font-size: 0.72rem;
      line-height: 1;
    }

    .listen-btn.playing .listen-icon {
      background: rgba(255, 255, 255, 0.2);
    }

    .listen-btn.compact {
      min-height: 36px;
      min-width: 0;
      padding: 6px 12px;
      font-size: 0.82rem;
      box-shadow: 0 3px 10px rgba(61, 46, 114, 0.1);
    }

    .listen-btn.compact .listen-icon {
      width: 18px;
      height: 18px;
      font-size: 0.62rem;
    }
  `,
})
export class ClinicalListenBtn {
  private readonly tts = inject(ClinicalTextToSpeechService);

  readonly listenId = input.required<string>();
  readonly text = input('');
  readonly disabled = input(false);
  readonly compact = input(false);

  readonly listenError = output<string>();

  readonly playing = computed(() => this.tts.isPlaying(this.listenId()));
  readonly loading = computed(
    () => this.tts.loading() && this.tts.activeId() === this.listenId(),
  );

  hint(): string {
    return this.playing()
      ? 'Detener la lectura'
      : 'Escuchar con la voz natural del sistema (voces mejoradas de macOS, Windows o Chrome)';
  }

  onClick() {
    this.tts.toggle(this.listenId(), this.text(), (msg) => this.listenError.emit(msg));
  }
}
