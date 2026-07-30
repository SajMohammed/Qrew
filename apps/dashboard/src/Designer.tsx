import { useEffect, useState, type CSSProperties } from "react";
import { useApi } from "./useApi";
import type { Program } from "./api";
import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  "#146A2E", "#0C2712", "#6C2A4B", "#1F5673",
  "#8A4B2F", "#3B2E5A", "#B0413E", "#2E7D57",
];
const STAMP_ICONS = ["☕", "✦", "★", "♥", "🍩", "🥐", "🍕", "🌮", "🍺", "💇", "🛍️", "🎁"];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

function textOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#fbfbf7";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#1c1a15" : "#fbfbf7";
}

const FIELD =
  "border-border bg-card placeholder:text-faint focus-visible:ring-ring w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2";

export function Designer({ merchantName }: { merchantName?: string }) {
  const api = useApi();
  const [program, setProgram] = useState<Program | null>(null);
  const [name, setName] = useState("");
  const [rewardText, setRewardText] = useState("");
  const [stampsRequired, setStampsRequired] = useState(10);
  const [bonusStamps, setBonusStamps] = useState(2);
  const [brandColor, setBrandColor] = useState("#146A2E");
  const [stampIcon, setStampIcon] = useState("☕");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProgram()
      .then((p) => {
        setProgram(p);
        setName(p.name);
        setRewardText(p.rewardText);
        setStampsRequired(p.stampsRequired);
        setBonusStamps(p.bonusStamps);
        setBrandColor(p.cardDesign.brandColor);
        setStampIcon(p.cardDesign.stampIcon);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!program) return;
    setStatus("saving");
    setErr(null);
    try {
      const updated = await api.updateProgram(program.id, {
        name,
        rewardText,
        stampsRequired,
        bonusStamps,
        cardDesign: { brandColor, stampIcon },
      });
      setProgram(updated);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }

  if (!program) return <p className="text-muted-foreground text-sm">{err ?? "Loading…"}</p>;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Card designer</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-[15px]">
          This is the card your customers carry — the one place your own brand takes over.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Program name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Reward
            <input
              value={rewardText}
              onChange={(e) => setRewardText(e.target.value)}
              maxLength={60}
              className={FIELD}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              Stamps to reward
              <input
                type="number"
                min={1}
                max={20}
                value={stampsRequired}
                onChange={(e) => setStampsRequired(clamp(+e.target.value, 1, 20))}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              Bonus on signup
              <input
                type="number"
                min={0}
                max={10}
                value={bonusStamps}
                onChange={(e) => setBonusStamps(clamp(+e.target.value, 0, 10))}
                className={FIELD}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Brand colour</span>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBrandColor(c)}
                  aria-label={c}
                  aria-pressed={c.toLowerCase() === brandColor.toLowerCase()}
                  style={{ background: c }}
                  className={cn(
                    "size-11 rounded-xl border-2 transition",
                    c.toLowerCase() === brandColor.toLowerCase()
                      ? "border-foreground scale-105"
                      : "border-transparent",
                  )}
                />
              ))}
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                aria-label="custom colour"
                className="border-border size-11 cursor-pointer rounded-xl border bg-transparent"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Stamp icon</span>
            <div className="flex flex-wrap gap-2">
              {STAMP_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStampIcon(i)}
                  aria-pressed={i === stampIcon}
                  className={cn(
                    "grid size-11 place-items-center rounded-xl border text-lg transition",
                    i === stampIcon
                      ? "border-primary bg-primary/12"
                      : "border-border bg-card hover:bg-accent",
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={status === "saving"}
              className="bg-primary text-primary-foreground min-h-12 rounded-xl px-6 text-sm font-bold transition hover:brightness-110 disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : "Save card"}
            </button>
            <span className="text-faint text-xs">
              Customers see changes on their next card refresh.
            </span>
          </div>
          {err && <p className="text-destructive text-sm">{err}</p>}
        </div>

        <div className="flex flex-col items-center gap-2 lg:sticky lg:top-6 lg:self-start">
          <PreviewCard
            merchantName={merchantName || program.name}
            brandColor={brandColor}
            stampIcon={stampIcon}
            rewardText={rewardText}
            stampsRequired={stampsRequired}
            filled={Math.min(stampsRequired, bonusStamps + 3)}
          />
          <div className="text-faint font-mono text-[10px] tracking-[0.16em] uppercase">
            Live preview
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  merchantName,
  brandColor,
  stampIcon,
  rewardText,
  stampsRequired,
  filled,
}: {
  merchantName: string;
  brandColor: string;
  stampIcon: string;
  rewardText: string;
  stampsRequired: number;
  filled: number;
}) {
  const cells = Array.from({ length: stampsRequired }, (_, i) => i < filled);
  const style = {
    "--c": brandColor,
    "--ci": textOn(brandColor),
    "--cols": Math.min(stampsRequired, 5),
  } as CSSProperties;
  return (
    <div
      style={style}
      className="w-full max-w-[320px] rounded-3xl bg-[var(--c)] p-5 text-[var(--ci)] shadow-xl"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-full bg-[var(--ci)]/15 font-extrabold">
          {(merchantName || "Q").charAt(0)}
        </span>
        <span className="truncate font-extrabold">{merchantName || "Your shop"}</span>
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(var(--cols), minmax(0, 1fr))" }}
      >
        {cells.map((on, i) => (
          <span
            key={i}
            className={cn(
              "grid aspect-square place-items-center rounded-full border text-base",
              on ? "border-transparent bg-[var(--ci)]/20" : "border-[var(--ci)]/25 border-dashed",
            )}
          >
            {on ? stampIcon : ""}
          </span>
        ))}
      </div>
      <div className="mt-4 text-[13px] font-semibold opacity-90">
        {filled}/{stampsRequired} · {rewardText || "reward"}
      </div>
    </div>
  );
}
