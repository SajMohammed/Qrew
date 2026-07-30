import { useEffect, useRef, useState, type CSSProperties } from "react";
import { m } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import type { CardView } from "./api";
import { textOn } from "./contrast";
import { Confetti } from "@/components/Confetti";
import { buzz } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export function StampCard({
  card,
  busy,
  err,
  onBack,
  onStamp,
  onRedeem,
}: {
  card: CardView;
  busy: boolean;
  err: string | null;
  onBack?: () => void;
  onStamp?: () => void;
  onRedeem?: () => void;
}) {
  const total = card.stampsRequired;
  const remaining = Math.max(0, total - card.currentStamps);
  const cells = Array.from({ length: total }, (_, i) => i < card.currentStamps);

  // Which stamps arrived since the last poll — those are the ones worth animating and buzzing for.
  const prevCount = useRef(card.currentStamps);
  const [landedFrom, setLandedFrom] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const celebrated = useRef(card.rewardReady);

  useEffect(() => {
    if (card.currentStamps > prevCount.current) {
      setLandedFrom(prevCount.current);
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
      buzz([18, 60, 24]);
      const t = window.setTimeout(() => setCelebrate(false), 1600);
      return () => window.clearTimeout(t);
    }
    if (!card.rewardReady) celebrated.current = false;
  }, [card.rewardReady]);

  const style = {
    "--card-color": card.brandColor,
    "--card-ink": textOn(card.brandColor),
  } as CSSProperties;

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4 px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:max-w-[520px]">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground -ml-1 self-start rounded-lg px-1 py-2 text-sm font-semibold active:scale-95"
        >
          ‹ All cards
        </button>
      )}

      <m.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        style={style}
        className={cn(
          "stampcard relative overflow-hidden rounded-3xl px-6 pt-6 pb-5",
          card.rewardReady && "ready",
        )}
      >
        <Confetti run={celebrate} colors={[card.brandColor, "#cbfa5b", "#ffffff", "#8ff992"]} />

        <div className="relative z-10 flex items-center gap-3">
          <span className="on-card-soft grid size-11 shrink-0 place-items-center rounded-full text-lg font-extrabold">
            {card.merchantName.charAt(0)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-extrabold">{card.merchantName}</span>
            <span className="block truncate text-[13px] opacity-75">{card.programName}</span>
          </span>
          <span className="text-2xl font-extrabold">
            {card.currentStamps}
            <span className="text-base opacity-70">/{total}</span>
          </span>
        </div>

        <div
          className="relative z-10 my-6 grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(total, 5)}, minmax(0, 1fr))` }}
        >
          {cells.map((on, i) => {
            const justLanded = landedFrom !== null && on && i >= landedFrom;
            return (
              <m.span
                key={i}
                initial={false}
                animate={justLanded ? { scale: [0.3, 1.18, 1] } : { scale: 1 }}
                transition={
                  justLanded
                    ? { duration: 0.5, times: [0, 0.6, 1], delay: (i - (landedFrom ?? 0)) * 0.08 }
                    : { duration: 0 }
                }
                className={cn(
                  "grid aspect-square place-items-center rounded-full text-lg",
                  on
                    ? "bg-white text-[var(--card-color)] shadow-[0_3px_10px_rgba(0,0,0,0.25)]"
                    : "on-card-line border-[1.5px] border-dashed",
                )}
              >
                {on ? card.stampIcon : ""}
              </m.span>
            );
          })}
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold">
            {card.rewardReady ? "🎉 Reward ready!" : `${remaining} to your reward`}
          </span>
          <span className="on-card-soft rounded-full px-3 py-1 text-xs font-semibold">
            {card.rewardText}
          </span>
        </div>

        {/*
          The QR sits on its own solid white panel with dark modules. It used to be white modules on
          the card itself, which only scanned because the card was always dark — a pale brand colour
          or a light theme made it unreadable.
        */}
        <div className="relative z-10 mt-6 flex flex-col items-center gap-2">
          <div className="rounded-2xl bg-white p-3 shadow-lg">
            <QRCodeSVG
              value={card.qrToken || card.serial}
              size={124}
              bgColor="#ffffff"
              fgColor="#0c2712"
              level="M"
            />
          </div>
          <span className="text-[12px] font-medium opacity-80">
            Show this to staff to earn a stamp
          </span>
        </div>
      </m.div>

      {onStamp && onRedeem && (
        <div className="border-border bg-surface flex items-center gap-2 rounded-xl border p-2.5">
          <span className="text-faint font-mono text-[10px] tracking-[0.12em] uppercase">Dev</span>
          <button
            type="button"
            onClick={onStamp}
            disabled={busy}
            className="border-border ml-auto rounded-lg border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
          >
            + Stamp
          </button>
          <button
            type="button"
            onClick={onRedeem}
            disabled={busy || !card.rewardReady}
            className="border-border rounded-lg border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
          >
            Redeem
          </button>
        </div>
      )}

      <p className="text-faint flex items-center justify-center gap-2 text-xs">
        <span className="live-dot bg-success inline-block size-2 rounded-full" aria-hidden />
        Live — updates as staff stamp your card
      </p>

      {err && <p className="text-destructive text-center text-sm">{err}</p>}
    </div>
  );
}
