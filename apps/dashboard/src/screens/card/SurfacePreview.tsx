import { useEffect, useRef, useState } from "react";
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
  /** Whether this product shows a filling-up strip at all. */
  showsProgress: boolean;
}

export function SurfacePreview(props: PreviewInput) {
  const [surface, setSurface] = useState<Surface>("app");

  return (
    <div className="flex flex-col gap-3">
      <div className="border-border bg-card flex gap-1 rounded-xl border p-1">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSurface(s.id)}
            aria-pressed={surface === s.id}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition",
              surface === s.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
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

function AppCard({ design, shopName, title, rewardText, progressLabel, showsProgress, stampsRequired }: PreviewInput) {
  const ink = textOn(design.brandColor);
  const shown = Math.min(stampsRequired, 10);
  const filled = Math.ceil(shown * 0.7);
  return (
    <figure className="m-0">
      <div
        className="overflow-hidden rounded-2xl p-4 shadow-lg"
        style={{ background: design.brandColor, color: ink }}
      >
        <div className="flex items-center gap-2">
          <span
            className="grid size-7 place-items-center overflow-hidden rounded-full text-[11px] font-extrabold"
            style={{ background: `${ink}26` }}
          >
            {design.logoUrl ? (
              <img src={design.logoUrl} alt="" className="size-full object-cover" />
            ) : (
              shopName.charAt(0)
            )}
          </span>
          <span className="truncate text-[13px] font-semibold">{shopName}</span>
          <span className="ml-auto text-[12px] opacity-80">{progressLabel}</span>
        </div>

        <div className="mt-1 text-[15px] font-bold">{title || "Loyalty Card"}</div>

        {showsProgress && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {Array.from({ length: shown }, (_, i) =>
              design.stampImageUrl ? (
                <img
                  key={i}
                  src={i < filled ? design.stampImageUrl : (design.emptyStampImageUrl ?? design.stampImageUrl)}
                  alt=""
                  className="size-8 object-contain"
                  style={{
                    opacity: i < filled || design.emptyStampImageUrl ? 1 : (design.unearnedOpacity ?? 0.28),
                  }}
                />
              ) : (
                <span
                  key={i}
                  className="size-7 rounded-full"
                  style={
                    i < filled
                      ? { background: ink }
                      : { border: `2px solid ${ink}`, opacity: design.unearnedOpacity ?? 0.28 }
                  }
                />
              ),
            )}
          </div>
        )}

        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="text-[10px] tracking-wide uppercase opacity-75">
            Reward
            <b className="block text-[13px] tracking-normal normal-case opacity-100">
              {rewardText || "reward"}
            </b>
          </span>
        </div>
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12px]">
        Their card in the Qrew app.
      </figcaption>
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
  platform,
}: PreviewInput & { platform: "google" | "apple" }) {
  const api = useApi();
  const [stripUrl, setStripUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const current = useRef<string | null>(null);
  const ink = textOn(design.brandColor);
  const key = JSON.stringify([design, stampsRequired, platform]);

  useEffect(() => {
    if (!showsProgress) return;
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
  }, [key, showsProgress]);

  // Revoke the last URL when the preview unmounts, not just when it is replaced.
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current); }, []);

  return (
    <figure className="m-0">
      <div
        className="overflow-hidden rounded-2xl shadow-lg"
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

        {showsProgress &&
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
          <span className="text-[14px] font-extrabold">{progressLabel}</span>
        </div>
      </div>
      <figcaption className="text-muted-foreground mt-2 text-[12px]">
        {platform === "google"
          ? "The real image Google downloads — 1032×812."
          : "The real image Apple bundles — 1125×369."}
      </figcaption>
    </figure>
  );
}

function Poster({ design, shopName, rewardText, progressLabel }: PreviewInput) {
  const ink = textOn(design.brandColor);
  return (
    <figure className="m-0">
      <div
        className="grid aspect-[3/4] place-items-center rounded-2xl p-6 text-center shadow-lg"
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
      <figcaption className="text-muted-foreground mt-2 text-[12px]">
        The counter poster customers scan to join.
      </figcaption>
    </figure>
  );
}
