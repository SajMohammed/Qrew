import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { m } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import type { CardView, FailureKind } from "./api";
import type { QrState } from "@/lib/connection";
import { isIos } from "@/lib/platform";
import { textOn } from "./contrast";
import { CardFoot, CardTop, merchantStyle } from "./MerchantCard";
import { Confetti } from "@/components/Confetti";
import { buzz } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** How long the notification stays: Softform's `sf-notify` plays in, holds and leaves in 2.6s. */
const NOTICE_MS = 2700;

export function StampCard({
  card,
  busy,
  err,
  onBack,
  onStamp,
  onRedeem,
  connection = { qr: "live", failing: null },
  onRetry,
  footer,
}: {
  card: CardView;
  busy: boolean;
  err: string | null;
  onBack?: () => void;
  onStamp?: () => void;
  onRedeem?: () => void;
  /** Whether the QR can still be scanned, and why not if the card can't be reached. */
  connection?: { qr: QrState; failing: FailureKind | null };
  onRetry?: () => void;
  /** Shown under the card — e.g. the nudge to save it. */
  footer?: ReactNode;
}) {
  const expired = connection.qr === "expired";
  const total = card.stampsRequired;
  const remaining = Math.max(0, total - card.currentStamps);
  const cells = Array.from({ length: total }, (_, i) => i < card.currentStamps);

  // Which stamps arrived since the last poll — those are the ones worth animating and buzzing for.
  const prevCount = useRef(card.currentStamps);
  const [landedFrom, setLandedFrom] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const celebrated = useRef(card.rewardReady);
  // The news of a stamp (or a reward) dropping in at the top of the screen, as it happens at the counter.
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const say = (text: string) => setNotice((n) => ({ id: (n?.id ?? 0) + 1, text }));

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (card.currentStamps > prevCount.current) {
      setLandedFrom(prevCount.current);
      const added = card.currentStamps - prevCount.current;
      say(`${added > 1 ? `${added} stamps added` : "Stamp added"} · ${card.currentStamps} of ${card.stampsRequired}`);
      buzz(14);
      const t = window.setTimeout(() => setLandedFrom(null), 900);
      prevCount.current = card.currentStamps;
      return () => window.clearTimeout(t);
    }
    prevCount.current = card.currentStamps;
  }, [card.currentStamps]);

  // Fire once per completion, not on every 4s poll while the card sits full.
  useEffect(() => {
    if (card.rewardReady && !celebrated.current) {
      celebrated.current = true;
      setCelebrate(true);
      say(`Your reward is ready: ${card.rewardText}`);
      buzz([18, 60, 24]);
      // Comfortably longer than the burst itself, so it ends by finishing rather than by being cut.
      const t = window.setTimeout(() => setCelebrate(false), 1900);
      return () => window.clearTimeout(t);
    }
    if (!card.rewardReady) celebrated.current = false;
  }, [card.rewardReady]);

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:max-w-[520px]">
      {/* Floats over the card as the screen scrolls, in liquid glass. */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="sf-btn sf-liquid sf-liquid--tint sticky top-[calc(8px+env(safe-area-inset-top))] z-20 self-start px-4"
          data-liquid="9"
          data-bezel="18"
        >
          ‹ All cards
        </button>
      )}
      {notice &&
        createPortal(
          <div
            key={notice.id}
            role="status"
            className="sf-notify sf-liquid sf-liquid--tint card-notify"
            style={
              {
                "--notify-icon-bg": card.brandColor,
                "--notify-icon-ink": textOn(card.brandColor),
              } as CSSProperties
            }
            data-liquid="9"
            data-bezel="18"
          >
            <span className="sf-notify__icon" aria-hidden>
              {card.merchantName.slice(0, 1)}
            </span>
            <span>
              <b className="sf-notify__title">{card.merchantName}</b>
              {notice.text}
            </span>
            <span className="sf-notify__meta" aria-hidden>
              now
            </span>
          </div>,
          document.body,
        )}

      {/* The screen's one vivid surface: the shop's own card, in the shop's colour. */}
      <m.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        style={merchantStyle(card.brandColor)}
        className={cn("sf-aura sf-aura--tint qrew-card aspect-auto", card.rewardReady && "qrew-card--ready")}
      >
        {/* The shop's colours only — Qrew's lime stays off the merchant's card. */}
        <Confetti run={celebrate} colors={[textOn(card.brandColor), "#ffffff", card.brandColor]} />

        <CardTop
          heading
          name={card.merchantName}
          program={card.programName}
          count={card.currentStamps}
          total={total}
        />

        <ol
          className="sf-steps qrew-stamps"
          style={{ "--cols": Math.min(total, 5) } as CSSProperties}
          aria-label={`${card.currentStamps} of ${total} stamps`}
        >
          {cells.map((on, i) => {
            const justLanded = landedFrom !== null && on && i >= landedFrom;
            return (
              <m.li
                key={i}
                initial={false}
                animate={justLanded ? { scale: [0.3, 1.18, 1] } : { scale: 1 }}
                transition={
                  justLanded
                    ? { duration: 0.5, times: [0, 0.6, 1], delay: (i - (landedFrom ?? 0)) * 0.08 }
                    : { duration: 0 }
                }
                className={cn("sf-steps__dot", on && "sf-steps__dot--done")}
              >
                {/* Artwork where the shop has it, their emoji otherwise — the same order the
                    wallet strip and the designer preview use. */}
                {card.stampImageUrl ? (
                  <img src={on ? card.stampImageUrl : (card.emptyStampImageUrl ?? card.stampImageUrl)} alt="" />
                ) : on ? (
                  card.stampIcon
                ) : (
                  ""
                )}
              </m.li>
            );
          })}
        </ol>

        <CardFoot>
          {/* Ready, the tag turns into a drop of liquid glass that breathes: the card's one lens. */}
          <span
            // A fresh element when it turns ready, so liquid glass gives it its lens (it lenses glass as it mounts).
            key={card.rewardReady ? "ready" : "counting"}
            className={cn("sf-tag", card.rewardReady && "sf-liquid sf-liquid--light reward-chip")}
            data-liquid={card.rewardReady ? "" : undefined}
            data-bezel={card.rewardReady ? "12" : undefined}
          >
            {card.rewardReady ? "Reward ready" : card.frozen ? "No longer collecting" : `${remaining} to your reward`}
          </span>
          <span className="sf-tag">{card.rewardText}</span>
        </CardFoot>
      </m.div>

      {/*
        The QR is Qrew's, on its own card: a solid white panel with near-black modules in both
        themes. It used to sit on the shop's colour, which only scanned because the card was always
        dark — a pale brand colour or a light theme made it unreadable.
      */}
      <section aria-label="Your code" className="sf-card items-center gap-3 text-center">
        <div className="qrew-qr">
          {/*
            A lapsed code fails at the till, so it must not look scannable: faded under a notice
            on the same white panel (Qrew's words, never on the shop's colour). The card and its
            count stay — the customer's progress is still theirs to see.
          */}
          <div className={cn(expired && "opacity-25 blur-[3px]")} aria-hidden={expired}>
            <QRCodeSVG value={card.qrToken || card.serial} size={168} bgColor="#ffffff" fgColor="#121512" level="M" />
          </div>
          {expired && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center">
              <span className="text-[15px] font-medium">QR expired</span>
              {/* The typed code below doesn't expire — staff can still stamp the card by it. */}
              <span className="text-[12.5px] leading-tight">Reconnect for a fresh one, or give staff the code below</span>
              {onRetry && (
                <button type="button" onClick={onRetry} className="sf-btn sf-btn--ink mt-2">
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
        {!expired && (
          <p className="text-ink-2 m-0 text-sm">
            {/* The shop turned this card off: it earns nothing more, but a reward on it is still theirs. */}
            {!card.frozen
              ? "Show this to staff to earn a stamp"
              : card.rewardReady
                ? "This card is no longer collecting. Show this to staff to redeem your reward."
                : "This card is no longer collecting stamps."}
          </p>
        )}
        {/* The code a cashier types when the QR won't read — a glare, a cracked screen. */}
        {card.shortCode && (
          <p className="text-ink-3 m-0 flex flex-wrap items-center justify-center gap-x-3 text-[12.5px]">
            Can't scan? Code{" "}
            <span className="sf-code text-ink [word-spacing:-0.3em]">{card.shortCode}</span>
          </p>
        )}
      </section>

      {/*
        Shown only when the provider actually produced a save link, so a wallet outage or an
        unconfigured environment simply omits it rather than offering a dead button. Never on iOS:
        there is no Google Wallet there.

        Google's own colours, not Qrew's: the button stands in for their badge.
        NOTE before launch: Google's brand guidelines require their official "Add to Google Wallet"
        badge asset. This is a faithful stand-in; drop the downloaded asset into public/ and swap it
        in when publishing access is requested.
      */}
      {card.wallet.google && !isIos() && (
        <a
          href={card.wallet.google}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => buzz(10)}
          className="sf-btn sf-btn--block bg-[#202124] text-white"
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path
              fill="#4285F4"
              d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
            />
            <path fill="#fff" d="M14 10.5h6v3h-6a1.5 1.5 0 0 1 0-3Z" />
          </svg>
          Add to Google Wallet
        </a>
      )}

      {import.meta.env.DEV && onStamp && onRedeem && (
        <div className="sf-card sf-card--sunken sf-card--compact flex-row items-center">
          <span className="sf-tag bg-surface">Dev</span>
          <button type="button" onClick={onStamp} disabled={busy} className="sf-btn sf-btn--sm ml-auto">
            + Stamp
          </button>
          <button type="button" onClick={onRedeem} disabled={busy || !card.rewardReady} className="sf-btn sf-btn--sm">
            Redeem
          </button>
        </div>
      )}

      {footer}

      <p className="text-ink-3 m-0 flex items-center justify-center gap-2 text-[12.5px]" aria-live="polite">
        {connection.qr === "live" ? (
          <>
            <span className="live-dot" aria-hidden />
            Live — updates as staff stamp your card
          </>
        ) : connection.qr === "reconnecting" ? (
          <>
            <span className="bg-ink-3 inline-block size-2 rounded-full" aria-hidden />
            {connection.failing === "offline" ? "No connection — reconnecting…" : "Can't reach Qrew — retrying…"}
          </>
        ) : (
          <>
            <span className="bg-danger inline-block size-2 rounded-full" aria-hidden />
            Your code needs a connection to refresh
          </>
        )}
      </p>

      {err && <p className="text-danger-ink m-0 text-center text-sm">{err}</p>}
    </div>
  );
}
