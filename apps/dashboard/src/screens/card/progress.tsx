import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CardDesign, CardType } from "@/api";
import { cn } from "@/lib/utils";
import { FIELD, Group, ImageField, Labelled, NumberField, Segmented, Slider } from "./controls";

/**
 * The Progress section, one editor per card type.
 *
 * This is the half of a card type the domain deliberately does not own. Core declares what a scan
 * earns and what redeems; how a shop is asked about it is a React component, and describing form
 * controls in the domain would mean inventing a serialisable control language and letting the
 * server dictate a UI it never sees.
 */

export interface ProgressEditorProps {
  mechanics: Record<string, unknown>;
  setMechanics: (next: Record<string, unknown>) => void;
  /** The shared columns: what earns a reward, and the head start on signing up. */
  target: number;
  setTarget: (n: number) => void;
  bonus: number;
  setBonus: (n: number) => void;
  design: CardDesign;
  patch: (d: Partial<CardDesign>) => void;
  upload: (kind: "stamp" | "logo", file: File) => Promise<string>;
}

/**
 * The shop's mark, for the surfaces that can draw a glyph.
 *
 * The wallet strip cannot: it is composited on the server with no font engine, and colour-emoji
 * fonts are the case those handle worst. So an emoji reaches the app card and the poster, and only
 * uploaded artwork reaches the pass. Both are offered because most shops want the app card to look
 * like something on day one, before they have a designer make them a PNG.
 */
const STAMP_ICONS = ["☕", "✦", "★", "♥", "🍩", "🥐", "🍕", "🌮", "🍺", "💇", "🛍️", "🎁"];

const LAYOUTS = [
  { id: "grid" as const, label: "Grid" },
  { id: "row" as const, label: "Row" },
  { id: "top-heavy" as const, label: "Top heavy" },
  { id: "diamond" as const, label: "Diamond" },
];

function StampEditor({ target, setTarget, bonus, setBonus, design, patch, upload }: ProgressEditorProps) {
  /*
   * The mode is UI state, seeded from whether a custom strip is stored.
   *
   * It cannot be derived from the URL alone: switching to "use my own image" has to show the
   * upload control BEFORE there is anything to show, and an empty URL would flip the mode straight
   * back. Switching to "draw the stamps for me" clears the stored URL explicitly rather than by
   * omission, because the server merges a patch over the current design — an absent key means
   * "unchanged", so leaving it out would keep serving the old image while the UI claimed otherwise.
   */
  const [custom, setCustom] = useState(Boolean(design.customStripUrl));
  return (
    <>
      <Group
        label="Your mark"
        hint={
          design.stampImageUrl
            ? "Your artwork is used everywhere it can be, so this shows only where the artwork is missing."
            : "Shown on the app card and the printed poster. Wallet passes need artwork instead — neither wallet can draw an emoji."
        }
      >
        <div className="mt-1.5 flex flex-wrap gap-2">
          {STAMP_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => patch({ stampIcon: i })}
              aria-pressed={i === design.stampIcon}
              className={cn(
                "grid size-11 cursor-pointer place-items-center rounded-xl border text-lg transition",
                i === design.stampIcon
                  ? "border-primary bg-primary/12"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              {i}
            </button>
          ))}
        </div>
      </Group>

      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Stamps to reward">
          <NumberField value={target} onChange={setTarget} min={1} max={20} />
        </Labelled>
        <Labelled label="Head start on signup" hint="A few free stamps makes people far likelier to finish.">
          <NumberField value={bonus} onChange={setBonus} min={0} max={10} />
        </Labelled>
      </div>

      <Segmented
        value={custom ? "custom" : "auto"}
        onChange={(v) => {
          setCustom(v === "custom");
          if (v === "auto") patch({ customStripUrl: "" });
        }}
        options={[
          { id: "auto", label: "Draw the stamps for me" },
          { id: "custom", label: "Use my own image" },
        ]}
      />

      {custom ? (
        <ImageField
          label="Your finished strip"
          value={design.customStripUrl || undefined}
          onChange={(url) => patch({ customStripUrl: url ?? "" })}
          onUpload={(f) => upload("stamp", f)}
          hint="Used exactly as supplied. Your card will not fill up as they collect — the image cannot change — so pick this only when the artwork matters more than the live count."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <ImageField
              label="Earned stamp"
              value={design.stampImageUrl}
              onChange={(url) => patch({ stampImageUrl: url ?? "" })}
              onUpload={(f) => upload("stamp", f)}
              hint="Square PNG with a transparent background. Leave empty for plain circles."
            />
            <ImageField
              label="Not yet earned"
              value={design.emptyStampImageUrl}
              onChange={(url) => patch({ emptyStampImageUrl: url ?? "" })}
              onUpload={(f) => upload("stamp", f)}
              hint="Optional. Without one, the earned stamp is drawn faded."
            />
          </div>

          <Group label="Arrangement">
            <Segmented
              value={design.stampLayout ?? "grid"}
              onChange={(v) => patch({ stampLayout: v })}
              options={LAYOUTS}
            />
          </Group>

          <div className="grid gap-4 sm:grid-cols-2">
            <Slider
              label="Stamp size"
              value={design.stampScale ?? 1}
              onChange={(n) => patch({ stampScale: n })}
              min={0.5}
              max={1.4}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <Slider
              label="Fade before earning"
              value={design.unearnedOpacity ?? 0.28}
              onChange={(n) => patch({ unearnedOpacity: n })}
              min={0.05}
              max={1}
            />
            <Slider
              label="Space across"
              value={design.stampGapX ?? 0.18}
              onChange={(n) => patch({ stampGapX: n })}
              min={0}
              max={0.6}
            />
            <Slider
              label="Space down"
              value={design.stampGapY ?? 0.18}
              onChange={(n) => patch({ stampGapY: n })}
              min={0}
              max={0.6}
            />
          </div>
          {design.emptyStampImageUrl && (
            <p className="text-muted-foreground text-[12px]">
              Fade is ignored while you have artwork for an unearned stamp — yours is drawn as you made it.
            </p>
          )}
        </>
      )}
    </>
  );
}

function PointsEditor({ mechanics, setMechanics, target, setTarget, bonus, setBonus }: ProgressEditorProps) {
  const unitLabel = String(mechanics.unitLabel ?? "points");
  const perVisit = Number(mechanics.perVisit ?? 10);
  const perCurrency = Number(mechanics.perCurrency ?? 0);
  const set = (next: Record<string, unknown>) => setMechanics({ ...mechanics, ...next });

  return (
    <>
      <Labelled label="What you call them" hint="Points, beans, stars — whatever your customers hear at the counter.">
        <input
          value={unitLabel}
          onChange={(e) => set({ unitLabel: e.target.value })}
          maxLength={20}
          className={`${FIELD} mt-1.5`}
        />
      </Labelled>

      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label={`${unitLabel} per visit`}>
          <NumberField value={perVisit} onChange={(n) => set({ perVisit: n })} min={0} max={10000} />
        </Labelled>
        <Labelled label={`${unitLabel} to earn the reward`}>
          <NumberField value={target} onChange={setTarget} min={1} max={1_000_000} />
        </Labelled>
      </div>

      <Labelled
        label={`${unitLabel} per AED spent`}
        hint="Set this for spend-based earning. Your till does not send the amount yet, so today every visit earns the per-visit rate — this takes over the moment it does."
      >
        <NumberField value={perCurrency} onChange={(n) => set({ perCurrency: n })} min={0} max={1000} />
      </Labelled>

      <Labelled label={`Head start on signup`}>
        <NumberField value={bonus} onChange={setBonus} min={0} max={10} />
      </Labelled>
    </>
  );
}

function DiscountEditor({ mechanics, setMechanics }: ProgressEditorProps) {
  const unit = mechanics.unit === "currency" ? "currency" : "percent";
  const amount = Number(mechanics.amount ?? 10);
  const terms = String(mechanics.terms ?? "");
  const set = (next: Record<string, unknown>) => setMechanics({ ...mechanics, ...next });

  return (
    <>
      <Group label="Discount">
        <Segmented
          value={unit as "percent" | "currency"}
          onChange={(v) => set({ unit: v })}
          options={[
            { id: "percent", label: "Percentage off" },
            { id: "currency", label: "Fixed amount off" },
          ]}
        />
      </Group>

      <Labelled label={unit === "percent" ? "Percent off" : "Amount off"}>
        <NumberField
          value={amount}
          onChange={(n) => set({ amount: n })}
          min={1}
          max={unit === "percent" ? 100 : 100000}
          suffix={unit === "percent" ? "%" : "AED"}
        />
      </Labelled>

      <Labelled label="Terms" hint="Shown on the back of the pass. Keep it to the exclusions that matter.">
        <textarea
          value={terms}
          onChange={(e) => set({ terms: e.target.value })}
          maxLength={300}
          rows={3}
          className={`${FIELD} mt-1.5 resize-y`}
        />
      </Labelled>

      <p className="text-muted-foreground text-[12px] leading-snug">
        Nothing to collect on this card — it is valid the day you issue it. Staff scanning it are checking
        it is genuine, not adding to it.
      </p>
    </>
  );
}

interface Tier {
  name: string;
  at: number;
}

function MembershipEditor({ mechanics, setMechanics }: ProgressEditorProps) {
  const tiers: Tier[] = Array.isArray(mechanics.tiers) ? (mechanics.tiers as Tier[]) : [];
  const expiryMonths = Number(mechanics.expiryMonths ?? 12);
  const set = (next: Record<string, unknown>) => setMechanics({ ...mechanics, ...next });
  const setTier = (i: number, next: Partial<Tier>) =>
    set({ tiers: tiers.map((t, j) => (i === j ? { ...t, ...next } : t)) });

  return (
    <>
      <div>
        <span className="text-[13px] font-semibold">Tiers</span>
        <p className="text-muted-foreground mt-0.5 text-[12px]">
          A member moves up as they visit and never moves back down — status is not spent.
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={t.name}
                onChange={(e) => setTier(i, { name: e.target.value })}
                maxLength={30}
                placeholder="Gold"
                className={FIELD}
              />
              <input
                type="number"
                min={0}
                value={t.at}
                onChange={(e) => setTier(i, { at: Math.max(0, Number(e.target.value) || 0) })}
                aria-label={`Visits needed for ${t.name || "this tier"}`}
                className={`${FIELD} w-24 shrink-0`}
              />
              <button
                type="button"
                onClick={() => set({ tiers: tiers.filter((_, j) => j !== i) })}
                aria-label={`Remove ${t.name || "tier"}`}
                className="border-border bg-card hover:bg-accent grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        {tiers.length < 6 && (
          <button
            type="button"
            onClick={() => set({ tiers: [...tiers, { name: "", at: 0 }] })}
            className="border-border bg-card hover:bg-accent mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-semibold"
          >
            <Plus className="size-3.5" aria-hidden /> Add a tier
          </button>
        )}
      </div>

      <Labelled label="Membership lasts" hint="Zero means it never expires.">
        <NumberField
          value={expiryMonths}
          onChange={(n) => set({ expiryMonths: n })}
          min={0}
          max={120}
          suffix="months"
        />
      </Labelled>
    </>
  );
}

export const PROGRESS_EDITORS: Record<
  CardType,
  { title: string; hint: string; Editor: (p: ProgressEditorProps) => React.ReactElement }
> = {
  stamp: { title: "Stamps", hint: "What they collect, and how it looks filling up.", Editor: StampEditor },
  points: { title: "Points", hint: "What a visit is worth and what it buys.", Editor: PointsEditor },
  discount: { title: "The offer", hint: "What the card entitles them to.", Editor: DiscountEditor },
  membership: { title: "Tiers", hint: "How status is earned.", Editor: MembershipEditor },
};
