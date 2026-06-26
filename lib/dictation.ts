// The dictation seam. Voice is an *input method, not a data type*: it
// transcribes into a text field and nothing else — no audio is recorded,
// uploaded, or stored. Only the resulting text is ever saved.
//
// Everything that wants dictation calls `startDictation` and `dictationSupported`
// — they never touch the Web Speech API directly. The web `SpeechRecognition`
// API backs it today; a native Capacitor speech plugin can back it later by
// swapping this one file, with no caller aware of the change.

// Minimal shape of the bits of the Web Speech API we use (it isn't in lib.dom).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean {
  return getCtor() !== null;
}

export type DictationHandle = { stop: () => void };

export type DictationHandlers = {
  /** The full transcript so far this session (final + interim), streamed live. */
  onTranscript: (text: string) => void;
  onEnd?: () => void;
  /** e.g. "not-allowed" when the user denies the mic. */
  onError?: (reason: string) => void;
};

/**
 * Begin listening. Returns a handle to stop, or `null` if unsupported (callers
 * should hide the mic in that case). Permission is requested by the browser on
 * the first `start()` — i.e. on the first mic tap, in context.
 */
export function startDictation(handlers: DictationHandlers): DictationHandle | null {
  const Ctor = getCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang =
    (typeof navigator !== "undefined" && navigator.language) || "en-US";
  rec.interimResults = true;
  rec.continuous = true;

  rec.onresult = (e) => {
    let text = "";
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
    }
    handlers.onTranscript(text);
  };
  rec.onerror = (e) => handlers.onError?.(e.error);
  rec.onend = () => handlers.onEnd?.();

  rec.start();
  return { stop: () => rec.stop() };
}
