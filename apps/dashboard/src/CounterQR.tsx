import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import type { Program } from "./api";
import { CardSwitcher } from "@/components/CardSwitcher";

// Where the customer app lives. In prod set VITE_CARD_APP_URL (e.g. https://my.qrew.ae). In dev we
// derive it from the shop app's own host on port 5173 — so if the owner opens the shop app on the
// LAN IP, the printed QR is automatically reachable from a customer's phone.
const CARD_ORIGIN =
  (import.meta.env.VITE_CARD_APP_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:5173`;

/**
 * One counter code per card the shop runs. Each card enrols through its own code — the link carries
 * the programme — so a shop with two cards prints two posters, and a customer joins the one they scan.
 * A frozen card has no poster: it takes no new members.
 */
export function CounterQR({
  merchantId,
  merchantName,
  cards,
  failed,
  onRetry,
}: {
  merchantId: string;
  merchantName: string;
  /** The cards that are on; null while they load. */
  cards: Program[] | null;
  failed: boolean;
  onRetry: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!cards && failed) {
    return (
      <div className="mx-auto flex w-full max-w-[460px] flex-col items-center gap-3">
        <p className="text-ink-2 text-sm">Couldn't load your card.</p>
        <button type="button" onClick={onRetry} className="sf-btn">
          Retry
        </button>
      </div>
    );
  }
  if (!cards) return <p className="text-ink-3 text-sm">Loading your card…</p>;
  const program = cards.find((c) => c.id === chosen) ?? cards[0];
  if (!program) return <p className="text-ink-2 text-sm">Turn a card on in Settings to get its counter code.</p>;
  const multi = cards.length >= 2;

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
          {multi
            ? "Each card has its own code. Print one for every card you run and put them on your counter. Customers scan the one they want with their phone camera — no app install needed."
            : "Print this and put it on your counter. Customers scan it with their phone camera to get your stamp card — no app install needed."}
        </p>
      </header>

      {multi && (
        <CardSwitcher
          cards={cards}
          value={program.id}
          onChange={(id) => {
            setChosen(id);
            setCopied(false);
          }}
        />
      )}

      {/*
        The printable poster. `print-poster` is what the @media print rule keeps on the page. It is
        paper in both themes, so its words use the fixed pastel ink and the QR stays near-black on white.
      */}
      <div className="print-poster bg-paper text-on-pastel shadow-sf-2 flex flex-col items-center gap-3 rounded-[var(--radius-xl)] px-6 py-8 text-center">
        <span className="qrew-wordmark text-on-pastel">Qrew</span>
        <div className="text-xl font-medium">{merchantName}</div>
        {/* With more than one card on the counter, each poster says which card it gives. */}
        {multi && <div className="-mt-2 text-base">{program.name}</div>}
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
