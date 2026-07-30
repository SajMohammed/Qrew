/**
 * Counter mode persists so a reload can't defeat the lock — which also means clearing it is the
 * only true way out. Both the entry point and the sign-out escape hatch go through here, so the
 * flag can never be set by one file and forgotten by another.
 */
const COUNTER_KEY = "qrew-counter-mode";

export function isCounterMode(): boolean {
  return localStorage.getItem(COUNTER_KEY) === "1";
}

export function setCounterModeFlag(on: boolean): void {
  if (on) localStorage.setItem(COUNTER_KEY, "1");
  else localStorage.removeItem(COUNTER_KEY);
}
