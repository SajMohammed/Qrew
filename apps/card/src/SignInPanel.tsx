import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// Minimal typing for Google Identity Services (loaded from their script, only when a client id exists).
interface GsiId {
  initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
function gsi(): GsiId | undefined {
  return (window as unknown as { google?: { accounts?: { id?: GsiId } } }).google?.accounts?.id;
}

export function SignInPanel({
  onGoogle,
  onDev,
  compact,
}: {
  onGoogle: (idToken: string) => Promise<void>;
  onDev: (email: string) => Promise<void>;
  compact?: boolean;
}) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { resolved } = useTheme();

  async function handle(fn: () => Promise<void>) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Real Google button — only when a client id is configured. Loads GIS once, then renders.
  // Google draws this button itself, so its theme can only follow ours by re-rendering it; the
  // effect therefore depends on `resolved` rather than running once.
  useEffect(() => {
    if (!CLIENT_ID || !btnRef.current) return;
    const init = () => {
      const id = gsi();
      if (!id || !btnRef.current) return;
      btnRef.current.replaceChildren(); // drop the previously themed button before redrawing
      id.initialize({
        client_id: CLIENT_ID,
        callback: (r) => void handle(() => onGoogle(r.credential)),
      });
      id.renderButton(btnRef.current, {
        theme: resolved === "dark" ? "filled_black" : "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
      });
    };
    if (gsi()) {
      init();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = init;
    document.body.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  return (
    <div
      className={cn(
        "border-border bg-surface/70 flex flex-col items-center gap-2 rounded-2xl border p-5 text-center backdrop-blur",
        compact ? "mt-2" : "mt-auto",
      )}
    >
      {!compact && <h2 className="text-lg font-extrabold tracking-tight">Save your cards</h2>}
      <p className="text-muted-foreground text-[13.5px] leading-relaxed">
        Sign in to keep every shop's card in one place — on any device.
      </p>

      {CLIENT_ID ? (
        <div ref={btnRef} className="mt-1 min-h-11" />
      ) : (
        <div className="mt-1 flex w-full flex-col gap-2">
          <span className="text-faint self-center font-mono text-[10px] tracking-[0.14em] uppercase">
            Dev sign-in
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
            aria-label="Email"
            className="border-border bg-background placeholder:text-faint focus-visible:ring-primary w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus-visible:ring-2"
          />
          <button
            type="button"
            disabled={busy || !email.includes("@")}
            onClick={() => handle(() => onDev(email))}
            className="bg-primary text-primary-foreground min-h-12 w-full rounded-xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
        </div>
      )}
      {err && <p className="text-destructive text-sm">{err}</p>}
    </div>
  );
}
