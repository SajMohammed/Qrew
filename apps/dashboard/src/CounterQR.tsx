import { useEffect, useState } from "react";
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
        <p className="text-ink-2 text-sm">Couldn't load your card.</p>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="sf-btn">
          Retry
        </button>
      </div>
    );
  }
  if (!program) return <p className="text-ink-3 text-sm">Loading your card…</p>;

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
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-6">
      <header>
        <h1 className="sf-title sf-twotone">
          <span className="sf-lead">Your</span> <strong>counter code</strong>
        </h1>
        <p className="text-ink-2 mt-2 mb-0 text-sm">
          Print this and put it on your counter. Customers scan it with their phone camera to get
          your stamp card — no app install needed.
        </p>
      </header>

      {/*
        The printable poster. `print-poster` is what the @media print rule keeps on the page. It is
        paper in both themes, so its words use the fixed pastel ink and the QR stays near-black on white.
      */}
      <div className="print-poster bg-paper text-on-pastel shadow-sf-2 flex flex-col items-center gap-3 rounded-[var(--radius-xl)] px-6 py-8 text-center">
        <span className="qrew-wordmark text-on-pastel">Qrew</span>
        <div className="text-xl font-medium">{merchantName}</div>
        <div className="bg-paper rounded-[var(--radius-md)] p-3">
          <QRCodeSVG value={enrollUrl} size={232} level="M" bgColor="#ffffff" fgColor="#121512" />
        </div>
        <div className="text-base font-medium">Scan to collect stamps</div>
        <div className="text-sm opacity-70">
          Collect {program.stampsRequired} · earn <strong className="font-medium">{program.rewardText}</strong>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={() => window.print()}
          className="sf-btn sf-btn--primary sf-btn--lg sm:flex-1"
        >
          <Printer aria-hidden />
          Print poster
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="sf-btn sf-btn--lg sm:flex-1"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      <code className="bg-surface-sunken text-ink-2 overflow-x-auto rounded-[var(--radius-sm)] px-4 py-3 font-mono text-[12px] break-all">
        {enrollUrl}
      </code>
    </div>
  );
}
