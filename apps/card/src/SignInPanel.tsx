import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { friendlyError } from "./api";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/**
 * Whether this build can sign anyone in. The email form is a stand-in for Google that only a
 * development API accepts, so a production build without a client id offers no sign-in rather than
 * one that cannot work.
 */
export const SIGN_IN_AVAILABLE = Boolean(CLIENT_ID) || import.meta.env.DEV;

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
  bare,
}: {
  onGoogle: (idToken: string) => Promise<void>;
  onDev: (email: string) => Promise<void>;
  compact?: boolean;
  /** Just the sign-in control and its error, for embedding in another panel. */
  bare?: boolean;
}) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { resolved } = useTheme();
  const emailId = useId();

  async function handle(fn: () => Promise<void>) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(friendlyError(e));
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

  if (!SIGN_IN_AVAILABLE) return null;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3",
        !bare && "sf-card text-center",
        !bare && (compact ? "mt-2" : "mt-auto"),
      )}
    >
      {!bare && !compact && <h2 className="sf-heading m-0">Save your cards</h2>}
      {!bare && (
        <p className="text-ink-2 m-0 max-w-[36ch] text-sm">
          Sign in to keep every shop's card in one place — on any device.
        </p>
      )}

      {CLIENT_ID ? (
        <div ref={btnRef} className="min-h-11" />
      ) : (
        <div className="flex w-full flex-col gap-3 text-left">
          <div className="sf-field">
            <label className="sf-field__label" htmlFor={emailId}>
              Email
            </label>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              inputMode="email"
              aria-label="Email"
              className="sf-input"
            />
            <p className="sf-field__hint m-0">Dev sign-in</p>
          </div>
          <button
            type="button"
            disabled={busy || !email.includes("@")}
            onClick={() => handle(() => onDev(email))}
            className="sf-btn sf-btn--ink sf-btn--block"
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
        </div>
      )}
      {err && <p className="text-danger-ink m-0 text-sm">{err}</p>}
    </div>
  );
}
