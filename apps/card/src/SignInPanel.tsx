import { useEffect, useRef, useState } from "react";

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
  useEffect(() => {
    if (!CLIENT_ID || !btnRef.current) return;
    const init = () => {
      const id = gsi();
      if (!id || !btnRef.current) return;
      id.initialize({ client_id: CLIENT_ID, callback: (r) => void handle(() => onGoogle(r.credential)) });
      id.renderButton(btnRef.current, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with" });
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
  }, []);

  return (
    <div className={`signin${compact ? " compact" : ""}`}>
      {!compact && <h2>Save your cards</h2>}
      <p className="sub">Sign in to keep every shop's card in one place — on any device.</p>
      {CLIENT_ID ? (
        <div ref={btnRef} className="gbtn" />
      ) : (
        <div className="devsignin">
          <span className="devtag">DEV</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
          />
          <button
            className="primary"
            disabled={busy || !email.includes("@")}
            onClick={() => handle(() => onDev(email))}
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
