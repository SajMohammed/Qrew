/**
 * A short buzz to confirm something physical happened — a stamp landing, a reward completing.
 * iOS Safari doesn't implement the Vibration API, so this is a progressive enhancement and must
 * never be the only feedback for an event.
 */
export function buzz(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported or blocked by a permissions policy — the visual feedback still lands */
  }
}
