import { Component, inject, input, output } from '@angular/core';
import { VoiceDictationService } from './voice-dictation.service';

/** Botón micrófono acoplado a un textarea de la HCE. */
@Component({
  selector: 'app-voice-dictation-btn',
  template: `
    <button
      type="button"
      class="voice-btn"
      [disabled]="disabled()"
      [attr.aria-pressed]="listening()"
      [class.listening]="listening()"
      (click)="onClick()"
    >
      <span class="voice-dot" aria-hidden="true"></span>
      {{ listening() ? 'Detener micrófono' : 'Dictar por voz' }}
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .voice-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 40px;
      padding: 9px 16px;
      border-radius: 999px;
      border: 1px solid #0d7377;
      background: #fff;
      color: #003d4c;
      font: inherit;
      font-size: 0.92rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 45, 92, 0.06);
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease,
        transform 0.12s ease,
        box-shadow 0.15s ease;
    }

    .voice-btn:hover:not(:disabled) {
      background: #e8f6f6;
      border-color: #003d4c;
      transform: translateY(-1px);
    }

    .voice-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .voice-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
    }

    .voice-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #0d7377;
      flex-shrink: 0;
    }

    .voice-btn.listening {
      background: #003d4c;
      border-color: #003d4c;
      color: #fff;
      box-shadow: 0 8px 18px rgba(0, 61, 76, 0.2);
    }

    .voice-btn.listening:hover:not(:disabled) {
      background: #0d7377;
      border-color: #0d7377;
    }

    .voice-btn.listening .voice-dot {
      background: #ff6b6b;
      box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.55);
      animation: voice-pulse 1.2s ease-out infinite;
    }

    @keyframes voice-pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.55);
      }
      70% {
        box-shadow: 0 0 0 8px rgba(255, 107, 107, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(255, 107, 107, 0);
      }
    }
  `,
})
export class VoiceDictationBtn {
  private readonly voice = inject(VoiceDictationService);

  readonly fieldId = input.required<string>();
  readonly value = input.required<string>();
  readonly disabled = input(false);
  readonly valueChange = output<string>();
  readonly dictationError = output<string>();

  listening() {
    return this.voice.isListening(this.fieldId());
  }

  onClick() {
    if (this.disabled()) return;
    this.voice.toggle(
      this.fieldId(),
      () => this.value(),
      (text) => this.valueChange.emit(text),
      (msg) => this.dictationError.emit(msg),
    );
  }
}
