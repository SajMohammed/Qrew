import { useEffect, useState, type CSSProperties } from "react";
import { Palette, Stamp, ListPlus, Bell, Trash2, Plus } from "lucide-react";
import { useApi } from "@/useApi";
import type { CardDesign, Program } from "@/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The card designer.
 *
 * It captures the shop's INTENT — colour, mark, stamp icon, reward, extra rows, location — never
 * platform field names. One design then drives four surfaces: the Qrew app card, a Google Wallet
 * pass, an Apple Wallet pass and the printed counter poster. Designing against Google's field names
 * would produce something Apple cannot satisfy, so every control here is expressible on both.
 */

const PRESET_COLORS = [
  "#146A2E", "#0C2712", "#6C2A4B", "#1F5673",
  "#8A4B2F", "#3B2E5A", "#B0413E", "#2E7D57",
];
const STAMP_ICONS = ["☕", "✦", "★", "♥", "🍩", "🥐", "🍕", "🌮", "🍺", "💇", "🛍️", "🎁"];
const MAX_DETAILS = 4;

type Tab = "brand" | "stamps" | "details" | "nearby";

const TABS: { id: Tab; label: string; icon: typeof Palette }[] = [
  { id: "brand", label: "Brand", icon: Palette },
  { id: "stamps", label: "Stamps", icon: Stamp },
  { id: "details", label: "Details", icon: ListPlus },
  { id: "nearby", label: "Nearby", icon: Bell },
];

const FIELD =
  "border-border bg-card placeholder:text-faint focus-visible:ring-ring w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

/** Luminance pick, so text stays legible on a pale brand colour. */
function textOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#fbfbf7";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 > 0.62 ? "#1c1a15" : "#fbfbf7";
}

export function CardDesigner({ merchantName }: { merchantName?: string }) {
  const api = useApi();
  const [program, setProgram] = useState<Program | null>(null);
  const [tab, setTab] = useState<Tab>("brand");
  const [name, setName] = useState("");
  const [rewardText, setRewardText] = useState("");
  const [stampsRequired, setStampsRequired] = useState(10);
  const [bonusStamps, setBonusStamps] = useState(2);
  const [design, setDesign] = useState<CardDesign>({ brandColor: "#146A2E", stampIcon: "☕" });
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
        setDesign(p.cardDesign);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (next: Partial<CardDesign>) => setDesign((d) => ({ ...d, ...next }));

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
        cardDesign: design,
      });
      setProgram(updated);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }

  if (!program) {
    return err ? (
      <p className="text-destructive text-sm">{err}</p>
    ) : (
      <Skeleton className="h-96 rounded-xl" />
    );
  }

  const details = design.details ?? [];
  const shopName = merchantName || program.name;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Card designer</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-[15px]">
          One design, four places your customers see it.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition",
                  tab === t.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="size-3.5" aria-hidden />
                {t.label}
              </button>
            ))}
          </div>

          <Card className="gap-3.5 p-4">
            {tab === "brand" && (
              <>
                <Labelled label="Card title" hint="Shown as the pass title on both wallets">
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={FIELD} />
                </Labelled>

                <Labelled label="Brand colour" hint="Backs the app card and both passes">
                  <div className="flex flex-wrap items-center gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => patch({ brandColor: c })}
                        aria-label={c}
                        aria-pressed={c.toLowerCase() === design.brandColor.toLowerCase()}
                        style={{ background: c }}
                        className={cn(
                          "size-11 rounded-xl border-2 transition",
                          c.toLowerCase() === design.brandColor.toLowerCase()
                            ? "border-foreground scale-105"
                            : "border-transparent",
                        )}
                      />
                    ))}
                    <input
                      type="color"
                      value={design.brandColor}
                      onChange={(e) => patch({ brandColor: e.target.value })}
                      aria-label="custom colour"
                      className="border-border size-11 cursor-pointer rounded-xl border bg-transparent"
                    />
                  </div>
                </Labelled>

                <Labelled
                  label="Shop logo"
                  hint="A public https link to a square PNG. Google fetches this image itself, so a localhost URL will not work."
                >
                  <input
                    value={design.logoUrl ?? ""}
                    onChange={(e) => patch({ logoUrl: e.target.value })}
                    placeholder="https://…/logo.png"
                    className={FIELD}
                  />
                </Labelled>
              </>
            )}

            {tab === "stamps" && (
              <>
                <Labelled label="Stamp icon" hint="Drawn on the app card and the wallet stamp strip">
                  <div className="flex flex-wrap gap-2">
                    {STAMP_ICONS.map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => patch({ stampIcon: i })}
                        aria-pressed={i === design.stampIcon}
                        className={cn(
                          "grid size-11 place-items-center rounded-xl border text-lg transition",
                          i === design.stampIcon
                            ? "border-primary bg-primary/12"
                            : "border-border bg-card hover:bg-accent",
                        )}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </Labelled>

                <div className="grid grid-cols-2 gap-3">
                  <Labelled label="Stamps to reward">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={stampsRequired}
                      onChange={(e) => setStampsRequired(clamp(+e.target.value, 1, 20))}
                      className={FIELD}
                    />
                  </Labelled>
                  <Labelled label="Bonus on signup" hint="A head start makes people far likelier to finish">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={bonusStamps}
                      onChange={(e) => setBonusStamps(clamp(+e.target.value, 0, 10))}
                      className={FIELD}
                    />
                  </Labelled>
                </div>

                <Labelled
                  label="Stamp artwork (wallet)"
                  hint="A public https link to a square transparent PNG — your cup, pastry, whatever. Drawn into the wallet pass so it fills up as they visit. PNG only: the strip is composited on the server, which cannot read JPEG. Leave empty for plain circles."
                >
                  <input
                    value={design.stampImageUrl ?? ""}
                    onChange={(e) => patch({ stampImageUrl: e.target.value })}
                    placeholder="https://…/stamp.png"
                    className={FIELD}
                  />
                </Labelled>

                <Labelled label="Reward" hint="What they get — shown on every surface">
                  <input
                    value={rewardText}
                    onChange={(e) => setRewardText(e.target.value)}
                    maxLength={60}
                    className={FIELD}
                  />
                </Labelled>
              </>
            )}

            {tab === "details" && (
              <>
                <p className="text-muted-foreground text-[13px]">
                  Extra rows on the wallet pass — opening hours, a phone number, the terms. Up to{" "}
                  {MAX_DETAILS}, because that is what Apple's card back comfortably shows.
                </p>
                {details.map((row, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Labelled label={i === 0 ? "Label" : ""}>
                      <input
                        value={row.label}
                        onChange={(e) => {
                          const next = [...details];
                          next[i] = { ...row, label: e.target.value };
                          patch({ details: next });
                        }}
                        maxLength={30}
                        placeholder="Opening hours"
                        className={FIELD}
                      />
                    </Labelled>
                    <Labelled label={i === 0 ? "Value" : ""}>
                      <input
                        value={row.value}
                        onChange={(e) => {
                          const next = [...details];
                          next[i] = { ...row, value: e.target.value };
                          patch({ details: next });
                        }}
                        maxLength={120}
                        placeholder="8am – 6pm, daily"
                        className={FIELD}
                      />
                    </Labelled>
                    <button
                      type="button"
                      onClick={() => patch({ details: details.filter((_, j) => j !== i) })}
                      aria-label="Remove row"
                      className="border-border text-muted-foreground hover:text-destructive mb-0.5 grid size-10 shrink-0 place-items-center rounded-xl border"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                {details.length < MAX_DETAILS && (
                  <button
                    type="button"
                    onClick={() => patch({ details: [...details, { label: "", value: "" }] })}
                    className="border-border text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed text-[13px] font-semibold"
                  >
                    <Plus className="size-4" aria-hidden />
                    Add a row
                  </button>
                )}
              </>
            )}

            {tab === "nearby" && (
              <>
                <p className="text-muted-foreground text-[13px]">
                  Both wallets can surface the card on the lock screen when a customer is near your
                  shop. It costs nothing and is the closest thing to free advertising the wallet
                  gives you.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Labelled label="Latitude">
                    <input
                      value={design.location?.lat ?? ""}
                      onChange={(e) =>
                        patch({
                          location: {
                            lat: Number(e.target.value),
                            lng: design.location?.lng ?? 0,
                            label: design.location?.label,
                          },
                        })
                      }
                      inputMode="decimal"
                      placeholder="25.2048"
                      className={FIELD}
                    />
                  </Labelled>
                  <Labelled label="Longitude">
                    <input
                      value={design.location?.lng ?? ""}
                      onChange={(e) =>
                        patch({
                          location: {
                            lat: design.location?.lat ?? 0,
                            lng: Number(e.target.value),
                            label: design.location?.label,
                          },
                        })
                      }
                      inputMode="decimal"
                      placeholder="55.2708"
                      className={FIELD}
                    />
                  </Labelled>
                </div>
                {design.location && (
                  <button
                    type="button"
                    onClick={() => patch({ location: null })}
                    className="text-muted-foreground self-start text-[13px] font-semibold hover:underline"
                  >
                    Remove location
                  </button>
                )}
                <p className="text-faint text-xs">
                  Tip: open your shop in Google Maps, right-click the pin, and copy the coordinates.
                </p>
              </>
            )}
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={status === "saving"}
              className="bg-primary text-primary-foreground min-h-12 rounded-xl px-6 text-sm font-bold transition hover:brightness-110 disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : "Save design"}
            </button>
            <span className="text-faint text-xs">
              Saved changes reach wallet passes already in customers' phones.
            </span>
          </div>
          {err && <p className="text-destructive text-sm">{err}</p>}
        </div>

        {/* Every surface the one design drives, so a colour choice is never a surprise elsewhere. */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
          <p className="text-faint font-mono text-[10px] tracking-[0.16em] uppercase">
            Everywhere it appears
          </p>
          <Surface label="Qrew app card">
            <AppCard
              shopName={shopName}
              design={design}
              rewardText={rewardText}
              stampsRequired={stampsRequired}
              filled={Math.min(stampsRequired, bonusStamps + 3)}
            />
          </Surface>
          <Surface label="Wallet pass">
            <WalletPass
              shopName={shopName}
              title={name}
              design={design}
              rewardText={rewardText}
              stampsRequired={stampsRequired}
              filled={Math.min(stampsRequired, bonusStamps + 3)}
            />
          </Surface>
        </div>
      </div>
    </div>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-semibold">
      {label}
      {children}
      {hint && <span className="text-faint text-[11.5px] font-normal">{hint}</span>}
    </label>
  );
}

function Surface({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11.5px] font-semibold">{label}</span>
      {children}
    </div>
  );
}

/** The rich card — the one place stamps can be drawn natively. */
function AppCard({
  shopName,
  design,
  rewardText,
  stampsRequired,
  filled,
}: {
  shopName: string;
  design: CardDesign;
  rewardText: string;
  stampsRequired: number;
  filled: number;
}) {
  const style = { "--c": design.brandColor, "--ci": textOn(design.brandColor) } as CSSProperties;
  return (
    <div style={style} className="rounded-2xl bg-[var(--c)] p-4 text-[var(--ci)] shadow-lg">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-[var(--ci)]/15 text-sm font-extrabold">
          {design.logoUrl ? (
            <img src={design.logoUrl} alt="" className="size-full object-cover" />
          ) : (
            shopName.charAt(0)
          )}
        </span>
        <span className="truncate text-sm font-extrabold">{shopName}</span>
      </div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${Math.min(stampsRequired, 5)}, minmax(0,1fr))` }}
      >
        {Array.from({ length: stampsRequired }, (_, i) => (
          <span
            key={i}
            className={cn(
              "grid aspect-square place-items-center rounded-full text-xs",
              i < filled
                ? "bg-white text-[var(--c)]"
                : "border border-dashed border-[var(--ci)]/40",
            )}
          >
            {i < filled ? design.stampIcon : ""}
          </span>
        ))}
      </div>
      <div className="mt-3 text-[11px] font-semibold opacity-90">
        {filled}/{stampsRequired} · {rewardText || "reward"}
      </div>
    </div>
  );
}

/**
 * How the same design lands in a wallet. The stamp row stands in for the strip image we generate —
 * neither platform can draw circles from data, so that band is a picture we render per card state.
 */
function WalletPass({
  shopName,
  title,
  design,
  rewardText,
  stampsRequired,
  filled,
}: {
  shopName: string;
  title: string;
  design: CardDesign;
  rewardText: string;
  stampsRequired: number;
  filled: number;
}) {
  const ink = textOn(design.brandColor);
  const shown = Math.min(stampsRequired, 7);
  return (
    <div
      className="overflow-hidden rounded-2xl shadow-lg"
      style={{ background: design.brandColor, color: ink }}
    >
      <div className="flex items-center gap-2 px-4 pt-3.5">
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
        <span className="truncate text-[11px] font-semibold">{shopName}</span>
      </div>
      <div className="px-4 pt-2 text-base font-bold">{title || "Loyalty Card"}</div>

      {/* the generated strip / hero image */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5 bg-white px-3 py-2.5">
        {Array.from({ length: shown }, (_, i) =>
          design.stampImageUrl ? (
            // Mirrors what the server draws: the same artwork, faded until earned.
            <img
              key={i}
              src={design.stampImageUrl}
              alt=""
              className="size-6 object-contain"
              style={{ opacity: i < filled ? 1 : 0.28 }}
            />
          ) : (
            <span
              key={i}
              className="grid size-5 place-items-center rounded-full text-[9px]"
              style={
                i < filled
                  ? { background: design.brandColor, color: ink }
                  : { border: `1.5px dashed ${design.brandColor}66` }
              }
            >
              {i < filled ? design.stampIcon : ""}
            </span>
          ),
        )}
      </div>

      <div className="flex items-end justify-between gap-2 px-4 pt-2.5 pb-3.5">
        <span className="text-[10px] opacity-80">
          REWARD
          <b className="block text-[12px] opacity-100">{rewardText || "reward"}</b>
        </span>
        <span className="text-[13px] font-extrabold">
          {filled}/{stampsRequired}
        </span>
      </div>
    </div>
  );
}
