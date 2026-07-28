import { useEffect, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
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
      <div className="counterqr">
        <p className="muted">Couldn't load your card.</p>
        <button className="refresh" onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </button>
      </div>
    );
  }
  if (!program) return <p className="muted">Loading your card…</p>;

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
    <div className="counterqr">
      <div className="cq-intro">
        <h2>Your counter code</h2>
        <p className="muted">
          Print this and put it on your counter. Customers scan it with their phone camera to get your
          stamp card — no app install needed.
        </p>
      </div>

      {/* the printable poster */}
      <div className="poster" style={{ "--brand": program.cardDesign.brandColor } as CSSProperties}>
        <div className="poster-brand">
          <span className="q">Q</span>rew
        </div>
        <div className="poster-shop">{merchantName}</div>
        <div className="poster-qr">
          <QRCodeSVG value={enrollUrl} size={232} level="M" bgColor="#ffffff" fgColor="#0c2712" />
        </div>
        <div className="poster-cta">Scan to collect stamps</div>
        <div className="poster-reward">
          Collect {program.stampsRequired} · earn <strong>{program.rewardText}</strong>
        </div>
      </div>

      <div className="cq-actions">
        <button className="primary" onClick={() => window.print()}>
          🖨 Print poster
        </button>
        <button className="refresh" onClick={copyLink}>
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      <code className="cq-url">{enrollUrl}</code>
    </div>
  );
}
