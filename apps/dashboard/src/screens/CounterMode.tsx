import { useState } from "react";
import { useClerk } from "@clerk/react";
import { Lock, X } from "lucide-react";
import { Scanner } from "@/Scanner";
import { useApi } from "@/useApi";
import { Wordmark } from "@/components/AppShell";
import { setCounterModeFlag } from "@/lib/counter-mode";

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
    } catch {
      setErr("PIN not recognized.");
    } finally {
      setChecking(false);
      setPin("");
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="border-border bg-card/95 sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
        <Wordmark compact />
        <span className="bg-primary/12 text-primary ml-1 hidden rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline">
          Counter mode
        </span>
        <button
          type="button"
          onClick={() => {
            setAsking(true);
            setErr(null);
          }}
          className="border-border text-muted-foreground hover:text-foreground ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-bold"
        >
          <Lock className="size-3.5" aria-hidden />
          Exit
        </button>
      </header>

      <main className="px-4 pt-4 pb-10">
        <p className="text-muted-foreground mx-auto mb-3 w-full max-w-[440px] text-center text-[13px]">
          Scan a customer's card to add a stamp
          {shopName ? ` at ${shopName}` : ""}.
        </p>
        <Scanner />
      </main>

      {asking && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Leave counter mode"
        >
          <div className="bg-card border-border w-full max-w-[340px] rounded-2xl border p-5 shadow-xl">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-base font-bold">Leave counter mode</h2>
              <button
                type="button"
                onClick={() => setAsking(false)}
                aria-label="Cancel"
                className="text-faint hover:text-foreground ml-auto"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-muted-foreground mb-4 text-[13px]">
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
              className="border-border bg-background focus-visible:ring-ring w-full rounded-xl border px-3.5 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus-visible:ring-2"
            />
            {err && <p className="text-destructive mt-2 text-xs">{err}</p>}
            <button
              type="button"
              onClick={() => void tryExit()}
              disabled={pin.length < 4 || checking}
              className="bg-primary text-primary-foreground mt-3 min-h-11 w-full rounded-xl text-sm font-bold transition hover:brightness-110 disabled:opacity-40"
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
              className="text-faint hover:text-foreground mt-3 w-full text-center text-xs"
            >
              No PIN set up? Sign out instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
