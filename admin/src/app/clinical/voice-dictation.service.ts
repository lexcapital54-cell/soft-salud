import { Injectable, signal } from '@angular/core';
import { formatClinicalFreeText } from './clinical-text-format';

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> & {
    length: number;
  };
};

type SpeechRecognitionInstance = {
  stop: () => void;
  start: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

/**
 * Dictado por voz (Web Speech API) reutilizable en campos de texto libre de la HCE.
 * Solo un campo puede escuchar a la vez.
 */
@Injectable({ providedIn: 'root' })
export class VoiceDictationService {
  readonly activeFieldId = signal<string | null>(null);

  private recognition: SpeechRecognitionInstance | null = null;
  private prefix = '';
  private lastInterim = '';
  private setText: ((value: string) => void) | null = null;

  isSupported(): boolean {
    return !!this.getCtor();
  }

  isListening(fieldId: string): boolean {
    return this.activeFieldId() === fieldId;
  }

  /**
   * Inicia o detiene el dictado para un campo.
   * @returns false si el navegador no soporta la API.
   */
  toggle(
    fieldId: string,
    getText: () => string,
    setText: (value: string) => void,
    onError?: (message: string) => void,
  ): boolean {
    if (this.activeFieldId() === fieldId) {
      this.stop();
      return true;
    }

    const Ctor = this.getCtor();
    if (!Ctor) {
      onError?.('Su navegador no soporta dictado por voz. Use Chrome o Edge.');
      return false;
    }

    this.stop();

    this.prefix = getText().trim();
    this.lastInterim = '';
    this.setText = setText;

    const recognition = new Ctor();
    this.recognition = recognition;
    recognition.lang = 'es-CO';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += piece;
        } else {
          interim += piece;
        }
      }
      if (finalText) {
        const piece = formatClinicalFreeText(finalText.trim());
        this.prefix = this.prefix ? `${this.prefix} ${piece}`.trim() : piece;
        this.lastInterim = '';
      } else {
        this.lastInterim = interim ? formatClinicalFreeText(interim) : '';
      }
      const display = this.prefix
        ? this.lastInterim
          ? formatClinicalFreeText(`${this.prefix} ${this.lastInterim}`.trim())
          : this.prefix
        : this.lastInterim;
      this.setText?.(display);
    };

    recognition.onerror = (event) => {
      const code = event?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        onError?.('El navegador bloqueó el micrófono. Permita el acceso al micrófono para este sitio y vuelva a intentar.');
      } else if (code === 'audio-capture') {
        onError?.('No se detectó un micrófono conectado.');
      }
      this.stop();
    };
    recognition.onend = () => this.stop();

    this.activeFieldId.set(fieldId);
    recognition.start();
    return true;
  }

  stop(): void {
    try {
      this.recognition?.stop();
    } catch {
      /* ya detenido */
    }
    if (this.setText) {
      const raw = [this.prefix, this.lastInterim].filter(Boolean).join(' ').trim();
      if (raw) this.setText(formatClinicalFreeText(raw));
    }
    this.recognition = null;
    this.setText = null;
    this.prefix = '';
    this.lastInterim = '';
    this.activeFieldId.set(null);
  }

  private getCtor(): SpeechRecognitionCtor | null {
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }
}
