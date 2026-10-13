import { useEffect, useState } from "react";
import { useClerk } from "@clerk/react";
import { Lock, X } from "lucide-react";
import { Scanner } from "@/Scanner";
import { useApi, PinLocked, CounterError } from "@/useApi";
import { Wordmark } from "@/components/AppShell";
import { setCounterModeFlag } from "@/lib/counter-mode";
import { useWakeLock } from "@/lib/device";
import { unlockAudio } from "@/lib/feedback";

/**
 * The counter surface. Management is hidden while this is on, and leaving needs an owner/manager
 * PIN — so a shared till device can be handed to staff without handing over the customer book.
 *
 * This is a shift lock, not a security boundary: the real enforcement is server-side, where
 * /analytics and /customers reject any role below manager. Signing out is always available so a
 * shop that hasn't set up PINs yet can never lock itself out of its own device.
 */
export function CounterMode({ shopName, onExit }: { shopName?: string; onExit: () => void }) {
  const api = useApi();
  const { signOut } = useClerk();
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // A counter screen stays on between customers, and beeps on a scan. Browsers allow sound only
  // after a tap or key press, so any touch on the screen unlocks it (and mounting tries, in case
  // this page already had one).
  useWakeLock();
  useEffect(unlockAudio, []);

  async function tryExit() {
    if (pin.length < 4 || checking) return;
    setChecking(true);
    setErr(null);
    try {
      const staff = await api.verifyPin(pin);
      if (staff.role === "owner" || staff.role === "manager") {
        onExit();
      } else {
        setErr("That PIN belongs to a cashier. Ask an owner or manager to unlock.");
      }
    } catch (e) {
      setErr(
        e instanceof PinLocked
          ? `${e.message} You can sign out instead.`
          : e instanceof CounterError && e.kind === "offline"
            ? e.message
            : "PIN not recognized.",
      );
    } finally {
      setChecking(false);
      setPin("");
    }
  }

  return (
    <div className="min-h-dvh" onPointerDownCapture={unlockAudio} onKeyDownCapture={unlockAudio}>
      {/* Floats on the canvas: no bar, no border — the scan frame is the screen. */}
      <header className="bg-canvas/85 sticky top-0 z-20 flex items-center gap-3 px-4 py-3 backdrop-blur-md sm:px-6">
        <Wordmark compact />
        <span className="sf-status sf-status--dot ml-1 hidden sm:inline-flex">Counter mode</span>
        <button
          type="button"
          onClick={() => {
            setAsking(true);
            setErr(null);
          }}
          className="sf-btn ml-auto px-4"
        >
          <Lock className="size-4" aria-hidden />
          Exit
        </button>
      </header>

      <main className="px-4 pt-4 pb-10">
        <p className="text-ink-2 mx-auto mt-0 mb-4 w-full max-w-[440px] text-center text-sm">
          Scan a customer's card to add a stamp
          {shopName ? ` at ${shopName}` : ""}.
        </p>
        <Scanner />
      </main>

      {asking && (
        <div
          className="sf-scrim z-50 grid place-items-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Leave counter mode"
        >
          <div className="sf-modal max-w-[380px] gap-3 p-6">
            <div className="flex items-start gap-2">
              <h2 className="sf-title sf-twotone">
                <span className="sf-lead">Leave</span> <strong>counter mode</strong>
              </h2>
              <button
                type="button"
                onClick={() => setAsking(false)}
                aria-label="Cancel"
                className="sf-bubble ml-auto"
              >
                <X />
              </button>
            </div>
            <p className="text-ink-2 m-0 text-sm">
              Enter an owner or manager PIN to get back to the dashboard.
            </p>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && void tryExit()}
              inputMode="numeric"
              autoFocus
              placeholder="••••"
              aria-label="Manager PIN"
              className="sf-code-field"
            />
            {err && <p className="text-danger-ink m-0 text-[13px]">{err}</p>}
            <button
              type="button"
              onClick={() => void tryExit()}
              disabled={pin.length < 4 || checking}
              className="sf-btn sf-btn--primary sf-btn--lg sf-btn--block"
            >
              {checking ? "Checking…" : "Unlock"}
            </button>
            <button
              type="button"
              onClick={() => {
                // Clear the flag BEFORE signing out, or signing back in lands straight back in
                // counter mode — still locked, with no PIN to leave by. Safe to clear: getting
                // back in needs the owner's Clerk credentials, which a cashier doesn't have.
                setCounterModeFlag(false);
                void signOut();
              }}
              className="sf-btn sf-btn--ghost sf-btn--block"
            >
              No PIN set up? Sign out instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
