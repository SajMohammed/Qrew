import { useEffect, useRef, useState } from "react";
import { Palette, Signature, LayoutGrid, ListPlus, MapPin, Plus, Trash2, Check } from "lucide-react";
import { useApi } from "@/useApi";
import type { CardDesign, CardType, CardTypeOption, Program, WalletSync } from "@/api";
import { Card as Panel } from "@/components/ui/card";
import { CardSwitcher } from "@/components/CardSwitcher";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SurfacePreview, textOn } from "./card/SurfacePreview";
import { FIELD, Group, ImageField, Labelled, NumberField } from "./card/controls";
import { PROGRESS_EDITORS } from "./card/progress";

/**
 * The card: what kind it is, how it works, and how it looks.
 *
 * One page rather than a wizard. A wizard suits first-time setup, but a shop comes back here to
 * change one colour, and Back/Next between them to reach it would be worse every time after the
 * first. The preview stays on screen instead, because the card is the product.
 *
 * A shop that runs two or more cards picks which one to edit. Each card keeps its own editor while
 * the screen is open, so switching to look at the other card never throws away unsaved changes.
 */

const PRESET_COLORS = [
  "#146A2E", "#0C2712", "#6C2A4B", "#1F5673",
  "#8A4B2F", "#3B2E5A", "#B0413E", "#2E7D57",
];

export function CardScreen({
  merchantName,
  cards,
  failed,
  onRetry,
  onSaved,
}: {
  merchantName?: string;
  /** The cards that are on; null while they load. */
  cards: Program[] | null;
  failed: boolean;
  onRetry: () => void;
  onSaved: (program: Program) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);

  if (!cards) {
    return failed ? (
      <div className="flex flex-col items-start gap-3">
        <p className="text-danger-ink m-0 text-sm">Couldn't load your cards.</p>
        <button type="button" onClick={onRetry} className="sf-btn">
          Retry
        </button>
      </div>
    ) : (
      <EditorSkeleton />
    );
  }
  const current = cards.find((c) => c.id === chosen) ?? cards[0];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="sf-display sf-twotone">
          <strong>Cards</strong>
        </h1>
        <p className="text-ink-3 mt-2 mb-0 text-[15px] sm:text-[17px]">
          One design, everywhere your customers meet it.
        </p>
      </header>

      {!current && <p className="text-ink-2 m-0 text-sm">Turn a card on in Settings to design it.</p>}
      {cards.length >= 2 && current && <CardSwitcher cards={cards} value={current.id} onChange={setChosen} />}

      {cards.map((c) => (
        <div key={c.id} hidden={c.id !== current?.id}>
          <CardEditor
            programId={c.id}
            merchantName={merchantName}
            // With one card the shop may still change what kind it is. With two or more, each card IS
            // its type, and types are turned on and off in Settings.
            typePicker={cards.length < 2}
            onSaved={onSaved}
          />
        </div>
      ))}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Skeleton className="h-96 rounded-lg lg:order-1" />
      <Skeleton className="h-80 rounded-xl lg:order-2" />
    </div>
  );
}

function CardEditor({
  programId,
  merchantName,
  typePicker,
  onSaved,
}: {
  programId: string;
  merchantName?: string;
  typePicker: boolean;
  onSaved: (program: Program) => void;
}) {
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
  // Bumped by every save, so a status check that started before a newer save is ignored instead of
  // overwriting that save's "pending" with the previous outcome.
  const saves = useRef(0);

  useEffect(() => {
    Promise.all([api.getProgram(programId), api.getCardTypes()])
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

  /*
   * Switching type carries nothing over, because nothing is comparable: a stamp card's threshold of
   * 10 would become a points card where a single visit earns the reward. Each type brings its own
   * sensible starting point instead.
   *
   * Coming back to the type the programme is actually saved as restores what was saved, so a shop
   * that clicks through the options to read them has not quietly rewritten their own settings.
   */
  function selectType(t: CardTypeOption) {
    if (!program) return;
    setType(t.type);
    const returning = t.type === program.type;
    setMechanics(returning ? ((program.mechanics ?? {}) as Record<string, unknown>) : {});
    setTarget(returning ? program.stampsRequired : t.defaultTarget);
  }

  // While passes are being updated, check back every few seconds (for up to two minutes) so the owner
  // sees the outcome. Only the wallet status is merged — the form being edited is never touched.
  const syncing = program?.walletSync.state === "pending";
  // Bumped by each save, so a save made while an earlier one is still pending gets its own two minutes.
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!syncing) return;
    let polls = 0;
    const timer = window.setInterval(() => {
      if (++polls > 24) return window.clearInterval(timer);
      const started = saves.current;
      api
        .getProgram(programId)
        .then((fresh) => {
          if (saves.current === started) setProgram((p) => p && { ...p, walletSync: fresh.walletSync });
        })
        .catch(() => {}); // a missed check is harmless; the next one tries again
    }, 5000);
    return () => window.clearInterval(timer);
  }, [syncing, api, round]);

  async function save() {
    if (!program) return;
    saves.current++;
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
      // Again on landing: a check that went out while this save was in flight read the state before it.
      saves.current++;
      setProgram(updated);
      onSaved(updated);
      setRound((n) => n + 1);
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
    return err ? <p className="text-danger-ink text-sm">{err}</p> : <EditorSkeleton />;
  }

  const shopName = merchantName || program.name;
  const details = design.details ?? [];
  const chosen = types.find((t) => t.type === type);
  const progress = PROGRESS_EDITORS[type];
  const upload = async (kind: "stamp" | "logo", file: File) => (await api.uploadAsset(kind, file)).url;

  return (
    <>
      {/*
        Preview first in the DOM, so a phone shows the card before the controls that change it —
        then ordered to the right column on a wide screen, where it sticks as the editor scrolls.
        Reordering with CSS rather than markup keeps both arrangements right from one source.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        {/* The screen's one vivid surface: the shop's own card, live as it is edited. */}
        <div className="lg:order-2 lg:sticky lg:top-6">
          <p className="text-ink-3 mt-0 mb-2 text-[12.5px]">Everywhere it appears</p>
          <SurfacePreview
            design={design}
            shopName={shopName}
            title={name}
            rewardText={rewardText}
            stampsRequired={target}
            progressLabel={previewLabel(type, target, mechanics)}
            showsProgress={chosen?.accrues ?? true}
            showsStamps={chosen?.drawsStampStrip ?? true}
            issuable={chosen?.issuable ?? true}
          />
        </div>

        <div className="flex flex-col gap-4 lg:order-1">
          {typePicker && (
            <Section icon={LayoutGrid} title="What kind of card" hint={typeHint(program)}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {types.map((t) => {
                  const active = t.type === type;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => selectType(t)}
                      aria-pressed={active}
                      className={cn(
                        "sf-press cursor-pointer rounded-[var(--radius-md)] p-3 text-left transition-colors",
                        // Chosen goes ink, like a pressed chip; lime stays for Save.
                        active ? "bg-surface-inverse text-on-inverse" : "bg-surface-sunken hover:text-ink",
                      )}
                    >
                      <span className="block text-sm font-medium">{t.label}</span>
                      <span className={cn("mt-0.5 block text-[12px] leading-snug", active ? "opacity-75" : "text-ink-2")}>
                        {t.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

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
            <Group label="Brand colour" hint="Backs the app card and both passes.">
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => patch({ brandColor: c })}
                    aria-label={c}
                    aria-pressed={c.toLowerCase() === design.brandColor.toLowerCase()}
                    style={{ background: c }}
                    className={cn(
                      "sf-press size-11 cursor-pointer rounded-full transition-shadow",
                      c.toLowerCase() === design.brandColor.toLowerCase() &&
                        "shadow-[0_0_0_3px_var(--surface),0_0_0_5px_var(--ink)]",
                    )}
                  />
                ))}
                <input
                  type="color"
                  value={design.brandColor}
                  onChange={(e) => patch({ brandColor: e.target.value })}
                  aria-label="custom colour"
                  className="bg-surface-sunken size-11 cursor-pointer overflow-hidden rounded-full p-1 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                />
              </div>
            </Group>
            <p className="text-ink-2 m-0 text-[12.5px]">
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
                  className="sf-bubble shrink-0"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            {details.length < 4 && (
              <button
                type="button"
                onClick={() => patch({ details: [...details, { label: "", value: "" }] })}
                className="sf-btn sf-btn--soft w-fit px-4"
              >
                <Plus className="size-4" aria-hidden /> Add a row
              </button>
            )}
          </Section>

          <Section
            icon={MapPin}
            title="Nearby reminder"
            hint="Both wallets can surface the card on the lock screen when a customer is near your shop."
          >
            {design.location ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Labelled label="Latitude">
                    <NumberField
                      value={design.location.lat}
                      onChange={(n) => patch({ location: { ...design.location!, lat: n } })}
                      min={-90}
                      max={90}
                    />
                  </Labelled>
                  <Labelled label="Longitude">
                    <NumberField
                      value={design.location.lng}
                      onChange={(n) => patch({ location: { ...design.location!, lng: n } })}
                      min={-180}
                      max={180}
                    />
                  </Labelled>
                </div>
                <button
                  type="button"
                  onClick={() => patch({ location: null })}
                  className="sf-btn sf-btn--ghost sf-btn--sm -ml-3 w-fit"
                >
                  Turn the reminder off
                </button>
              </>
            ) : (
              // Prefilled coordinates would read as a location already set. Nothing is, until asked.
              <button
                type="button"
                onClick={() => patch({ location: { lat: 25.2048, lng: 55.2708 } })}
                className="sf-btn sf-btn--soft w-fit px-4"
              >
                <MapPin className="size-4" aria-hidden /> Set your shop's location
              </button>
            )}
          </Section>

          {/* Floats over the form as it scrolls — above the phone dock, which sits at the bottom there. */}
          <div className="sf-glass sf-glass--strong sticky bottom-[calc(92px+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] p-2 pr-4 lg:bottom-4">
            <button
              type="button"
              onClick={() => void save()}
              disabled={status === "saving"}
              className="sf-btn sf-btn--primary disabled:cursor-wait"
            >
              {status === "saving" ? "Saving…" : "Save card"}
            </button>
            {status === "saved" && (
              <span className="text-signature-ink inline-flex items-center gap-1 text-[13px] font-medium">
                <Check className="size-4" aria-hidden /> Saved
              </span>
            )}
            {err && <span className="text-danger-ink text-[13px]">{err}</span>}
            {!err && status !== "saved" && <WalletSyncNote sync={program.walletSync} />}
          </div>
        </div>
      </div>
    </>
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
    <Panel>
      <div className="sf-card__head">
        <div>
          <h2 className="sf-heading m-0">{title}</h2>
          {hint && <p className="sf-card__meta mt-0.5 leading-snug">{hint}</p>}
        </div>
        <span className="sf-bubble pointer-events-none" aria-hidden>
          <Icon />
        </span>
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

/** What happened to the passes already in customers' phones after the last save. */
function WalletSyncNote({ sync }: { sync: WalletSync }) {
  const muted = "text-ink-2 text-[13px]";
  switch (sync.state) {
    case "pending":
      return <span className={muted}>Updating passes already in customers' phones…</span>;
    case "failed":
      return (
        <span className="text-danger-ink text-[13px]">
          Your card is saved, but passes already in customers' phones weren't updated. Save again to retry.
        </span>
      );
    case "ok":
      return (
        <span className={muted}>
          {sync.failedPasses > 0
            ? `Sent to passes in customers' phones. ${sync.failedPasses} couldn't be updated yet — they'll catch up at that customer's next visit.`
            : "Sent to passes already in customers' phones."}
        </span>
      );
    default:
      return <span className={muted}>Saved changes reach passes already in customers' phones.</span>;
  }
}
