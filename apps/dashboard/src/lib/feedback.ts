/*
 * A sound and a buzz for each scan, so staff needn't look at the screen to know it went through.
 *
 * Everything here is best-effort: iOS has no vibration, and browsers keep audio silent until the
 * page has had a tap or a key press (unlockAudio, called from one). The banner always shows too.
 */

export type Feedback = "success" | "repeat" | "error";

// Frequency (Hz) and length (ms) of each tone, played one after another.
const TONES: Record<Feedback, { hz: number; ms: number; wave: OscillatorType }[]> = {
  success: [{ hz: 880, ms: 120, wave: "sine" }],
  repeat: [
    { hz: 660, ms: 70, wave: "sine" },
    { hz: 660, ms: 70, wave: "sine" },
  ],
  error: [{ hz: 220, ms: 300, wave: "square" }],
};

const BUZZ: Record<Feedback, number | number[]> = {
  success: 40,
  repeat: [30, 60, 30],
  error: [120, 60, 120],
};

let audio: AudioContext | null = null;

/** Create (or wake) the audio context. Call from a tap or key press — browsers require one. */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* no audio on this device */
  }
}

export function signal(kind: Feedback): void {
  try {
    navigator.vibrate?.(BUZZ[kind]);
  } catch {
    /* no vibration */
  }
  try {
    if (!audio || audio.state !== "running") return;
    let at = audio.currentTime;
    for (const tone of TONES[kind]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = tone.wave;
      osc.frequency.value = tone.hz;
      // A quick fade in and out, or each tone starts and stops with a click.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.15, at + 0.01);
      gain.gain.linearRampToValueAtTime(0, at + tone.ms / 1000);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + tone.ms / 1000);
      at += tone.ms / 1000 + 0.05;
    }
  } catch {
    /* the banner still shows */
  }
}
