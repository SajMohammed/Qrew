import { useEffect, useState } from "react";
import { Lock, Palette, Signature, LayoutGrid, ListPlus, MapPin, Plus, Trash2, Check } from "lucide-react";
import { useApi } from "@/useApi";
import type { CardDesign, CardType, Program } from "@/api";
import { Card as Panel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SurfacePreview, textOn } from "./card/SurfacePreview";
import { FIELD, ImageField, Labelled, NumberField } from "./card/controls";
import { PROGRESS_EDITORS } from "./card/progress";

/**
 * The card: what kind it is, how it works, and how it looks.
 *
 * One page rather than a wizard. A wizard suits first-time setup, but a shop comes back here to
 * change one colour, and Back/Next between them to reach it would be worse every time after the
 * first. The preview stays on screen instead, because the card is the product.
 */

const PRESET_COLORS = [
  "#146A2E", "#0C2712", "#6C2A4B", "#1F5673",
  "#8A4B2F", "#3B2E5A", "#B0413E", "#2E7D57",
];

interface CardTypeOption {
  type: CardType;
  label: string;
  blurb: string;
  accrues: boolean;
}

export function CardScreen({ merchantName }: { merchantName?: string }) {
  const api = useApi();
  const [program, setProgram] = useState<Program | null>(null);
  const [types, setTypes] = useState<CardTypeOption[]>([]);
  const [name, setName] = useState("");
  const [rewardText, setRewardText] = useState("");
  const [target, setTarget] = useState(10);
  const [bonus, setBonus] = useState(2);
  const [type, setType] = useState<CardType>("stamp");
  const [mechanics, setMechanics] = useState<Record<string, unknown>>({});
  const [design, setDesign] = useState<CardDesign>({ brandColor: "#146A2E", stampIcon: "☕" });
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getProgram(), api.getCardTypes()])
      .then(([p, t]) => {
        setProgram(p);
        setName(p.name);
        setRewardText(p.rewardText);
        setTarget(p.stampsRequired);
        setBonus(p.bonusStamps);
        setType(p.type);
        setMechanics((p.mechanics ?? {}) as Record<string, unknown>);
        setDesign(p.cardDesign);
        setTypes(t);
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
        type,
        mechanics,
        rewardText,
        stampsRequired: target,
        bonusStamps: bonus,
        cardDesign: design,
      });
      setProgram(updated);
      setType(updated.type);
      setMechanics((updated.mechanics ?? {}) as Record<string, unknown>);
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const shopName = merchantName || program.name;
  const details = design.details ?? [];
  const chosen = types.find((t) => t.type === type);
  const progress = PROGRESS_EDITORS[type];
  const upload = async (kind: "stamp" | "logo", file: File) => (await api.uploadAsset(kind, file)).url;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Card</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-[15px]">
          One design, everywhere your customers meet it.
        </p>
      </header>

      {/*
        Preview first in the DOM so it is what a phone shows before any editing — and sticky beside
        the editor from the width where a sticky column has somewhere to stick.
      */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4">
          <p className="text-faint mb-2 text-[11px] font-semibold tracking-[0.12em] uppercase">
            Everywhere it appears
          </p>
          <SurfacePreview
            design={design}
            shopName={shopName}
            title={name}
            rewardText={rewardText}
            stampsRequired={target}
            progressLabel={previewLabel(type, target, mechanics)}
            showsProgress={chosen?.accrues ?? true}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Section icon={LayoutGrid} title="What kind of card" hint={typeHint(program)}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {types.map((t) => {
                const active = t.type === type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => {
                      setType(t.type);
                      setMechanics({}); // let the server fill in that type's defaults
                    }}
                    aria-pressed={active}
                    className={cn(
                      "cursor-pointer rounded-xl border p-3 text-left transition",
                      active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent",
                    )}
                  >
                    <span className="block text-[13px] font-semibold">{t.label}</span>
                    <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">
                      {t.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section icon={Signature} title="Identity">
            <Labelled label="Card title" hint="The pass title on both wallets.">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className={`${FIELD} mt-1.5`}
              />
            </Labelled>
            <Labelled label="Reward" hint="What they get. Shown on every surface.">
              <input
                value={rewardText}
                onChange={(e) => setRewardText(e.target.value)}
                maxLength={60}
                className={`${FIELD} mt-1.5`}
              />
            </Labelled>
            <ImageField
              label="Shop logo"
              value={design.logoUrl}
              onChange={(url) => patch({ logoUrl: url ?? "" })}
              onUpload={(f) => upload("logo", f)}
              hint="Square PNG. Google masks it to a circle, so keep the edges clear."
            />
          </Section>

          <Section icon={Palette} title="Colour">
            <Labelled label="Brand colour" hint="Backs the app card and both passes.">
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => patch({ brandColor: c })}
                    aria-label={c}
                    aria-pressed={c.toLowerCase() === design.brandColor.toLowerCase()}
                    style={{ background: c }}
                    className={cn(
                      "size-11 cursor-pointer rounded-xl border-2 transition",
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
            <p className="text-muted-foreground text-[12px]">
              Text and stamps are drawn in{" "}
              {textOn(design.brandColor) === "#fbfbf7" ? "white" : "near-black"} against this, picked
              for contrast.
            </p>
          </Section>

          <Section icon={LayoutGrid} title={progress.title} hint={progress.hint}>
            <progress.Editor
              mechanics={mechanics}
              setMechanics={setMechanics}
              target={target}
              setTarget={setTarget}
              bonus={bonus}
              setBonus={setBonus}
              design={design}
              patch={patch}
              upload={upload}
            />
          </Section>

          <Section
            icon={ListPlus}
            title="Extra rows"
            hint="Up to four. Apple shows about four fields on the front of a card, so this is the ceiling on both."
          >
            {details.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={row.label}
                  onChange={(e) =>
                    patch({ details: details.map((d, j) => (i === j ? { ...d, label: e.target.value } : d)) })
                  }
                  placeholder="Opening hours"
                  maxLength={30}
                  className={cn(FIELD, "w-2/5")}
                />
                <input
                  value={row.value}
                  onChange={(e) =>
                    patch({ details: details.map((d, j) => (i === j ? { ...d, value: e.target.value } : d)) })
                  }
                  placeholder="8am – 6pm daily"
                  maxLength={120}
                  className={FIELD}
                />
                <button
                  type="button"
                  onClick={() => patch({ details: details.filter((_, j) => j !== i) })}
                  aria-label={`Remove ${row.label || "row"}`}
                  className="border-border bg-card hover:bg-accent grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            {details.length < 4 && (
              <button
                type="button"
                onClick={() => patch({ details: [...details, { label: "", value: "" }] })}
                className="border-border bg-card hover:bg-accent inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-semibold"
              >
                <Plus className="size-3.5" aria-hidden /> Add a row
              </button>
            )}
          </Section>

          <Section
            icon={MapPin}
            title="Nearby reminder"
            hint="Both wallets can surface the card on the lock screen when a customer is near your shop."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Labelled label="Latitude">
                <NumberField
                  value={design.location?.lat ?? 25.2048}
                  onChange={(n) =>
                    patch({ location: { lat: n, lng: design.location?.lng ?? 55.2708 } })
                  }
                  min={-90}
                  max={90}
                />
              </Labelled>
              <Labelled label="Longitude">
                <NumberField
                  value={design.location?.lng ?? 55.2708}
                  onChange={(n) =>
                    patch({ location: { lat: design.location?.lat ?? 25.2048, lng: n } })
                  }
                  min={-180}
                  max={180}
                />
              </Labelled>
            </div>
            {design.location && (
              <button
                type="button"
                onClick={() => patch({ location: null })}
                className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-[12px] underline"
              >
                Turn the reminder off
              </button>
            )}
          </Section>

          <div className="border-border bg-card sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
            <button
              type="button"
              onClick={() => void save()}
              disabled={status === "saving"}
              className="bg-primary text-primary-foreground cursor-pointer rounded-xl px-5 py-2.5 text-sm font-bold disabled:cursor-wait disabled:opacity-70"
            >
              {status === "saving" ? "Saving…" : "Save card"}
            </button>
            {status === "saved" && (
              <span className="text-primary inline-flex items-center gap-1 text-[13px] font-semibold">
                <Check className="size-4" aria-hidden /> Saved
              </span>
            )}
            {err && <span className="text-destructive text-[13px]">{err}</span>}
            {!err && status !== "saved" && (
              <span className="text-muted-foreground text-[13px]">
                Saved changes reach passes already in customers' phones.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Palette;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="gap-3.5 p-4">
      <div className="flex items-start gap-2">
        <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <h2 className="text-[15px] font-bold">{title}</h2>
          {hint && <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">{hint}</p>}
        </div>
      </div>
      {children}
    </Panel>
  );
}

/**
 * Why the type may be stuck.
 *
 * The server refuses the change once passes exist, so this explains it before they try rather than
 * after — a wallet object cannot move between class types, and switching means re-issuing to
 * everyone who already saved the card.
 */
function typeHint(program: Program): string {
  return `Choose before you start issuing. A pass cannot change type once it is in someone's wallet — switching means re-issuing "${program.name}" and asking every customer to save it again.`;
}

/** What the preview shows in the corner: the card type's own wording. */
function previewLabel(type: CardType, target: number, mechanics: Record<string, unknown>): string {
  const part = Math.ceil(target * 0.7);
  switch (type) {
    case "points":
      return `${part.toLocaleString("en-AE")} ${String(mechanics.unitLabel ?? "points")}`;
    case "discount":
      return mechanics.unit === "currency"
        ? `AED ${Number(mechanics.amount ?? 10)} off`
        : `${Number(mechanics.amount ?? 10)}% off`;
    case "membership": {
      const tiers = (Array.isArray(mechanics.tiers) ? mechanics.tiers : []) as { name: string; at: number }[];
      const tier = tiers.reduce<string>((best, t) => (part >= t.at ? t.name : best), tiers[0]?.name ?? "Member");
      return `${tier} · ${part}`;
    }
    default:
      return `${part}/${target}`;
  }
}
