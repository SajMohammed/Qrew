import { useEffect, useState } from "react";

/**
 * Keep the screen on while mounted. A counter tablet that dims and locks between customers costs
 * the next one a wait. The browser drops the lock whenever the page is hidden, so it is taken again
 * each time the page comes back. Unsupported (iOS before 16.4) or refused (battery saver): the
 * screen simply sleeps as before.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;

    async function acquire() {
      if (done || lock || document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (done) {
          void next.release();
          return;
        }
        lock = next;
        next.addEventListener("release", () => {
          if (lock === next) lock = null;
        });
      } catch {
        /* refused — the screen sleeps as it would have */
      }
    }

    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/** Whether the browser thinks it has a network connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
