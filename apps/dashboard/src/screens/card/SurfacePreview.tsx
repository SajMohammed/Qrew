import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Smartphone, Wallet, Apple, Printer } from "lucide-react";
import { useApi } from "@/useApi";
import type { CardDesign } from "@/api";
import { cn } from "@/lib/utils";

/**
 * The card as the customer meets it, in every place it appears.
 *
 * The wallet surfaces render the ACTUAL PNG the wallet downloads, from the same function that
 * serves it in production. The previous designer drew its own approximation in CSS and the two
 * drifted: pale artwork looked blank here and correct on the phone. A preview that can disagree
 * with the thing it previews is worse than no preview.
 */

type Surface = "app" | "google" | "apple" | "print";

const SURFACES: { id: Surface; label: string; icon: typeof Smartphone }[] = [
  { id: "app", label: "Qrew app", icon: Smartphone },
  { id: "google", label: "Google", icon: Wallet },
  { id: "apple", label: "Apple", icon: Apple },
  { id: "print", label: "Poster", icon: Printer },
];

/** Luminance pick, so text stays legible on a pale brand colour. */
export function textOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#fbfbf7";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 > 0.62 ? "#1c1a15" : "#fbfbf7";
}

export interface PreviewInput {
  design: CardDesign;
  shopName: string;
  title: string;
  rewardText: string;
  stampsRequired: number;
  /** What the card reads as at this progress — the card type decides the wording. */
  progressLabel: string;
  /** Whether this product accumulates anything at all. */
  showsProgress: boolean;
  /**
   * Whether progress reads as a row of marks. Only a stamp card does: drawing ten discs for a
   * hundred-point balance would say something untrue about how the card works.
   */
  showsStamps: boolean;
  /**
   * Whether a wallet pass can be issued for this product at all. A discount card maps to a Google
   * offer and has no adapter yet, so previewing a pass for it would promise something the customer
   * will never be offered.
   */
  issuable: boolean;
}

export function SurfacePreview(props: PreviewInput) {
  const [surface, setSurface] = useState<Surface>("app");

  return (
    <div className="flex flex-col gap-3">
      <div className="sf-tabs w-full">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSurface(s.id)}
            aria-pressed={surface === s.id}
            aria-label={s.label}
            className="sf-tabs__tab flex flex-1 items-center justify-center gap-1.5 px-2 text-[13px]"
          >
            <s.icon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {surface === "app" && <AppCard {...props} />}
      {surface === "google" && <WalletPass {...props} platform="google" />}
      {surface === "apple" && <WalletPass {...props} platform="apple" />}
      {surface === "print" && <Poster {...props} />}
    </div>
  );
}

function AppCard({
  design,
  shopName,
  title,
  rewardText,
  progressLabel,
  showsProgress,
  showsStamps,
  stampsRequired,
}: PreviewInput) {
  const shown = Math.min(stampsRequired, 10);
  const filled = Math.ceil(shown * 0.7);
  const part = Math.ceil(stampsRequired * 0.7);
  return (
    <figure className="m-0">
      {/*
       * Mirrors apps/card/src/StampCard.tsx: the shop's card is a Softform tinted aura grown from their
       * brand colour, its count in dot-matrix at the top, stamps as dots in up to five columns, and the
       * foot's words on light glass tags. Inventing a layout here makes the preview a picture of a card
       * that does not exist. Qrew's own lime never appears on it.
       */}
      <div
        className="sf-aura sf-aura--tint qrew-card aspect-auto"
        style={{ "--card-color": design.brandColor, "--card-ink": textOn(design.brandColor) } as CSSProperties}
      >
        <div className="qrew-card__top">
          <div className="qrew-card__shop">
            <span className="qrew-card__logo">
              {design.logoUrl ? <img src={design.logoUrl} alt="" /> : shopName.charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="qrew-card__name truncate">{shopName}</p>
              <p className="qrew-card__program truncate">{title || "Loyalty Card"}</p>
            </div>
          </div>
          {/* A stamp card needs the count beside the row; the others print it large below, and
              showing it twice just reads as a mistake. */}
          {showsStamps && (
            <p className="sf-figure sf-figure-xl shrink-0">
              {part}
              <span className="sf-figure__sup">/{stampsRequired}</span>
            </p>
          )}
        </div>

        {showsStamps ? (
          <ol
            className="sf-steps qrew-stamps"
            style={{ "--cols": Math.min(shown, 5) } as CSSProperties}
            aria-hidden
          >
            {Array.from({ length: shown }, (_, i) => {
              const on = i < filled;
              const art = on ? design.stampImageUrl : (design.emptyStampImageUrl ?? design.stampImageUrl);
              return (
                <li key={i} className={cn("sf-steps__dot", on && "sf-steps__dot--done")}>
                  {design.stampImageUrl ? <img src={art} alt="" /> : on ? design.stampIcon : ""}
                </li>
              );
            })}
          </ol>
        ) : (
          // A balance, a discount or a tier reads as words, so it is set in the grotesk, not dot-matrix.
          showsProgress && <p className="sf-figure sf-figure-md">{progressLabel}</p>
        )}

        <div className="qrew-card__foot flex-wrap items-center">
          {showsStamps && <span className="sf-tag">{stampsRequired - part} to your reward</span>}
          <span className="sf-tag">{rewardText || "reward"}</span>
        </div>
      </div>
      <figcaption className="text-ink-3 mt-2 text-[12.5px]">Their card in the Qrew app.</figcaption>
    </figure>
  );
}

/**
 * A wallet pass, with the real generated strip in the middle.
 *
 * The strip is re-requested as the design changes, debounced — every keystroke would otherwise be
 * a render on the server. Object URLs are revoked as they are replaced; leaving them would leak a
 * blob per edit for as long as the tab is open.
 */
function WalletPass({
  design,
  shopName,
  title,
  rewardText,
  stampsRequired,
  progressLabel,
  showsProgress,
  showsStamps,
  issuable,
  platform,
}: PreviewInput & { platform: "google" | "apple" }) {
  const api = useApi();
  const [stripUrl, setStripUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const current = useRef<string | null>(null);
  const ink = textOn(design.brandColor);
  const key = JSON.stringify([design, stampsRequired, platform]);

  useEffect(() => {
    // Gated on showsStamps, not showsProgress: a points card accrues but renders its balance as a
    // number, and asking for a strip here would preview stamps the real pass will never carry.
    if (!showsStamps) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const url = await api.previewStrip({
          cardDesign: design,
          stampsRequired,
          currentStamps: Math.ceil(stampsRequired * 0.7),
          platform,
        });
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (current.current) URL.revokeObjectURL(current.current);
        current.current = url;
        setStripUrl(url);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, showsStamps]);

  // Revoke the last URL when the preview unmounts, not just when it is replaced.
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current); }, []);

  if (!issuable) {
    return (
      <figure className="sf-card sf-card--sunken m-0 gap-1 text-center">
        <p className="m-0 text-sm font-medium">No pass for this card yet</p>
        <p className="text-ink-2 m-0 text-[12.5px] leading-snug">
          {platform === "google" ? "Google" : "Apple"} files this kind of card under offers, which we
          have not built an adapter for. The card still works — customers just cannot add it to their
          wallet, so no button is shown.
        </p>
      </figure>
    );
  }

  return (
    <figure className="m-0">
      <div
        className="shadow-sf-2 overflow-hidden rounded-[var(--radius-md)]"
        style={{ background: design.brandColor, color: ink }}
      >
        <div className="flex items-center gap-2 px-4 pt-4">
          <span
            className="grid size-6 place-items-center overflow-hidden rounded-full text-[10px] font-extrabold"
            style={{ background: `${ink}26` }}
          >
            {design.logoUrl ? (
              <img src={design.logoUrl} alt="" className="size-full object-cover" />
            ) : (
              shopName.charAt(0)
            )}
          </span>
          <span className="truncate text-[12px] font-semibold">{shopName}</span>
        </div>
        <div className="px-4 pt-1 pb-3 text-[17px] font-bold">{title || "Loyalty Card"}</div>

        {showsStamps &&
          (failed ? (
            <div className="px-4 pb-3 text-[12px] opacity-80">
              Could not render the strip just now — the card itself is unaffected.
            </div>
          ) : (
            // The brand colour shows through the strip's transparency, exactly as on the pass.
            <img
              src={stripUrl ?? undefined}
              alt=""
              className={cn("w-full transition-opacity", stripUrl ? "opacity-100" : "opacity-0")}
              style={{ aspectRatio: platform === "apple" ? "1125 / 369" : "1032 / 812" }}
            />
          ))}

        <div className="flex items-end justify-between gap-2 px-4 pt-3 pb-4">
          <span className="text-[10px] tracking-wide uppercase opacity-75">
            Reward
            <b className="block text-[13px] tracking-normal normal-case opacity-100">
              {rewardText || "reward"}
            </b>
          </span>
          {showsProgress && <span className="text-[14px] font-extrabold">{progressLabel}</span>}
        </div>

        {/* The extra rows, where they actually land: Google text modules, Apple back fields. */}
        {(design.details ?? []).filter((d) => d.label || d.value).length > 0 && (
          <div className="border-t px-4 py-3" style={{ borderColor: `${ink}22` }}>
            {(design.details ?? [])
              .filter((d) => d.label || d.value)
              .map((d, i) => (
                <div key={i} className="flex justify-between gap-3 py-0.5 text-[11px]">
                  <span className="opacity-70">{d.label}</span>
                  <span className="truncate font-semibold">{d.value}</span>
                </div>
              ))}
          </div>
        )}
      </div>
      <figcaption className="text-ink-3 mt-2 text-[12.5px]">
        {showsStamps
          ? platform === "google"
            ? "The real image Google downloads — 1032×812."
            : "The real image Apple bundles — 1125×369."
          : "This card carries its balance as a number, so there is no strip image."}
      </figcaption>
    </figure>
  );
}

function Poster({ design, shopName, rewardText, progressLabel }: PreviewInput) {
  const ink = textOn(design.brandColor);
  return (
    <figure className="m-0">
      <div
        className="shadow-sf-2 grid aspect-[3/4] place-items-center rounded-[var(--radius-md)] p-6 text-center"
        style={{ background: design.brandColor, color: ink }}
      >
        <div>
          {design.logoUrl ? (
            <img src={design.logoUrl} alt="" className="mx-auto size-14 rounded-full object-cover" />
          ) : (
            <div
              className="mx-auto grid size-14 place-items-center rounded-full text-xl font-extrabold"
              style={{ background: `${ink}26` }}
            >
              {shopName.charAt(0)}
            </div>
          )}
          <p className="mt-3 text-[15px] font-extrabold">{shopName}</p>
          <p className="mt-1 text-[13px] opacity-85">{rewardText || "reward"}</p>
          <div
            className="mx-auto mt-4 grid size-24 place-items-center rounded-xl text-[10px]"
            style={{ background: ink, color: design.brandColor }}
          >
            QR
          </div>
          <p className="mt-3 text-[11px] opacity-75">Scan to start · {progressLabel}</p>
        </div>
      </div>
      <figcaption className="text-ink-3 mt-2 text-[12.5px]">
        The counter poster customers scan to join.
      </figcaption>
    </figure>
  );
}
