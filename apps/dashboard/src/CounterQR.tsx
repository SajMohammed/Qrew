import { useEffect, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { useApi } from "./useApi";
import type { Program } from "./api";

// Where the customer app lives. In prod set VITE_CARD_APP_URL (e.g. https://my.qrew.ae). In dev we
// derive it from the shop app's own host on port 5173 — so if the owner opens the shop app on the
// LAN IP, the printed QR is automatically reachable from a customer's phone.
const CARD_ORIGIN =
  (import.meta.env.VITE_CARD_APP_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:5173`;

export function CounterQR({ merchantId, merchantName }: { merchantId: string; merchantName: string }) {
  const api = useApi();
  const [program, setProgram] = useState<Program | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getProgram()
      .then((p) => {
        if (alive) {
          setProgram(p);
          setError(false);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [api, reloadKey]);

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-[460px] flex-col items-center gap-3">
        <p className="text-muted-foreground text-sm">Couldn't load your card.</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="border-border bg-card min-h-11 rounded-xl border px-4 text-sm font-bold"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!program) return <p className="text-muted-foreground text-sm">Loading your card…</p>;

  // The static "enroll" deep-link — scanning it opens the customer app on this shop's card.
  const enrollUrl = `${CARD_ORIGIN}/?m=${merchantId}&p=${program.id}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(enrollUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is shown below to copy by hand */
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Your counter code</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Print this and put it on your counter. Customers scan it with their phone camera to get
          your stamp card — no app install needed.
        </p>
      </header>

      {/* The printable poster. `print-poster` is what the @media print rule keeps on the page. */}
      <div
        className="print-poster border-border flex flex-col items-center gap-3 rounded-3xl border bg-white px-6 py-7 text-center shadow-lg"
        style={{ "--brand": program.cardDesign.brandColor } as CSSProperties}
      >
        <div className="font-display text-2xl tracking-wide text-[#0c2712]">
          <span className="text-[var(--brand)]">Q</span>rew
        </div>
        <div className="text-lg font-extrabold text-[#0c2712]">{merchantName}</div>
        <div className="rounded-2xl border border-[#e8eaee] bg-white p-3">
          <QRCodeSVG value={enrollUrl} size={232} level="M" bgColor="#ffffff" fgColor="#0c2712" />
        </div>
        <div className="text-base font-bold text-[#0c2712]">Scan to collect stamps</div>
        <div className="text-sm text-[#4f5864]">
          Collect {program.stampsRequired} · earn <strong>{program.rewardText}</strong>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold transition hover:brightness-110"
        >
          <Printer className="size-4" aria-hidden />
          Print poster
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="border-border bg-card min-h-12 flex-1 rounded-xl border text-sm font-bold"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      <code className="bg-muted text-muted-foreground overflow-x-auto rounded-lg px-3 py-2 font-mono text-[11px] break-all">
        {enrollUrl}
      </code>
    </div>
  );
}
