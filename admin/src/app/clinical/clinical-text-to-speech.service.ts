import { Injectable, signal } from '@angular/core';

/**
 * Lee texto clínico con la síntesis de voz del sistema operativo (voces naturales /
 * mejoradas de macOS, Windows o Chrome). No usa un motor TTS propio robotizado.
 */
@Injectable({ providedIn: 'root' })
export class ClinicalTextToSpeechService {
  readonly activeId = signal<string | null>(null);
  readonly loading = signal(false);

  private queue: string[] = [];
  private voicesReady: SpeechSynthesisVoice[] | null = null;
  private preferredVoice: SpeechSynthesisVoice | null = null;

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  isPlaying(id: string): boolean {
    return this.activeId() === id;
  }

  /** Inicia la lectura; si ya suena este id, detiene. */
  toggle(id: string, text: string, onError?: (msg: string) => void): boolean {
    if (!this.isSupported()) {
      onError?.(
        'Su navegador no puede leer en voz alta. Use Chrome, Edge o Safari actualizado.',
      );
      return false;
    }

    if (this.activeId() === id) {
      this.stop();
      return true;
    }

    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      onError?.('No hay texto clínico guardado para escuchar en esta sección.');
      return false;
    }

    this.stop();
    this.activeId.set(id);
    this.loading.set(true);
    void this.startSpeaking(normalized, onError);
    return true;
  }

  stop() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.queue = [];
    window.speechSynthesis.cancel();
    this.activeId.set(null);
    this.loading.set(false);
  }

  private async startSpeaking(text: string, onError?: (msg: string) => void) {
    try {
      await this.loadVoices();
      this.queue = this.splitIntoChunks(text);
      if (!this.queue.length) {
        this.stop();
        onError?.('No hay texto para leer.');
        return;
      }
      this.loading.set(false);
      this.speakNext(onError);
    } catch {
      this.stop();
      onError?.('No se pudo iniciar la lectura en voz alta.');
    }
  }

  private speakNext(onError?: (msg: string) => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const chunk = this.queue.shift();
    if (!chunk) {
      this.stop();
      return;
    }

    const utter = new SpeechSynthesisUtterance(chunk);
    utter.lang = 'es-CO';
    utter.rate = 0.94;
    utter.pitch = 1;
    if (this.preferredVoice) {
      utter.voice = this.preferredVoice;
    }

    utter.onend = () => this.speakNext(onError);
    utter.onerror = () => {
      if (this.queue.length) {
        this.speakNext(onError);
        return;
      }
      this.stop();
      onError?.('Se interrumpió la lectura en voz alta.');
    };

    window.speechSynthesis.speak(utter);
  }

  private splitIntoChunks(text: string, maxLen = 280): string[] {
    const parts: string[] = [];
    const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxLen) {
        parts.push(paragraph);
        continue;
      }
      const sentences = paragraph.split(/(?<=[.!?;:])\s+/).filter(Boolean);
      let buffer = '';
      for (const sentence of sentences) {
        const next = buffer ? `${buffer} ${sentence}` : sentence;
        if (next.length > maxLen && buffer) {
          parts.push(buffer);
          buffer = sentence;
        } else {
          buffer = next;
        }
      }
      if (buffer) parts.push(buffer);
    }
    return parts;
  }

  private loadVoices(): Promise<void> {
    if (this.voicesReady?.length) return Promise.resolve();

    return new Promise((resolve) => {
      const pick = () => {
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) return false;
        this.voicesReady = voices;
        this.preferredVoice = this.pickBestSpanishVoice(voices);
        resolve();
        return true;
      };

      if (pick()) return;

      const onChange = () => {
        if (pick()) {
          window.speechSynthesis.removeEventListener('voiceschanged', onChange);
        }
      };
      window.speechSynthesis.addEventListener('voiceschanged', onChange);
      window.setTimeout(() => {
        pick();
        window.speechSynthesis.removeEventListener('voiceschanged', onChange);
        resolve();
      }, 400);
    });
  }

  /** Prefiere voces «Enhanced / Premium / Natural» en español del sistema. */
  private pickBestSpanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    const spanish = voices.filter((v) => /^es(-|$)/i.test(v.lang));
    const pool = spanish.length ? spanish : voices;

    const score = (v: SpeechSynthesisVoice) => {
      const name = v.name.toLowerCase();
      let s = 0;
      if (/enhanced|premium|natural|neural|wavenet|online/i.test(name)) s += 120;
      if (/google|microsoft|apple/i.test(name)) s += 40;
      if (/es-co|es-mx|es-us/i.test(v.lang)) s += 30;
      if (/es-es|es-/.test(v.lang)) s += 20;
      if (/compact|robot|legacy/i.test(name)) s -= 80;
      if (v.default) s += 10;
      if (/paulina|monica|helena|lucia|soledad|jorge|diego|salome|camila/i.test(name)) s += 15;
      return s;
    };

    return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null;
  }
}
