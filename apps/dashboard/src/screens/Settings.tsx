import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShopNameForm } from "@/components/ShopNameForm";
import { useApi } from "@/useApi";
import type { CardType, CardTypeOption, Program } from "@/api";

/** How the shop appears to customers: its name, and which cards it runs. */
export function Settings({
  merchantName,
  onRenamed,
  programs,
  onCardsChanged,
}: {
  merchantName?: string;
  onRenamed: (name: string) => void;
  /** Every card the shop has, on or frozen; null while loading. */
  programs: Program[] | null;
  onCardsChanged: (programs: Program[]) => void;
}) {
  const api = useApi();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="sf-display sf-twotone">
          <strong>Settings</strong>
        </h1>
        <p className="text-ink-3 mt-2 mb-0 text-[15px] sm:text-[17px]">How your shop appears to customers.</p>
      </header>
      {/* One column of fields in a card, max ~560px; nothing vivid but the Save button. */}
      <Card className="max-w-[560px] gap-3">
        <h2 className="sf-heading m-0">Shop name</h2>
        <p className="text-ink-2 m-0 text-sm">
          Shown on your customers' cards, the sign-up page, Google Wallet passes and your counter poster.
          Cards already saved in Google Wallet update too. If you've printed your counter poster, print
          it again.
        </p>
        {/* Not keyed on the name: a remount after saving would wipe the "Saved" confirmation. */}
        {merchantName === undefined ? (
          <Skeleton className="h-14 rounded-[var(--radius-md)]" />
        ) : (
          <ShopNameForm
            initial={merchantName}
            submitLabel="Save"
            busyLabel="Saving…"
            onSubmit={async (name) => {
              const renamed = await api.renameShop(name);
              onRenamed(renamed.name);
            }}
          />
        )}
      </Card>
      <CardTypes programs={programs} onChanged={onCardsChanged} />
    </div>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * Which kinds of card the shop runs — one of each at most. On creates the type's card the first time;
 * off freezes it, which customers feel only as "no longer collecting". The server keeps the last card
 * on and only lets the owner change any of this; the switches say so before anyone tries.
 */
function CardTypes({ programs, onChanged }: { programs: Program[] | null; onChanged: (p: Program[]) => void }) {
  const api = useApi();
  const [types, setTypes] = useState<CardTypeOption[] | null>(null);
  // The switch being changed, shown in its new position while the server answers; back if it refuses.
  const [busy, setBusy] = useState<{ type: CardType; enabled: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCardTypes()
      .then(setTypes)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [api]);

  async function toggle(type: CardType, enabled: boolean) {
    setBusy({ type, enabled });
    setErr(null);
    try {
      onChanged(await api.setCardType(type, enabled));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const on = (programs ?? []).filter((p) => p.status === "active");

  return (
    <Card className="max-w-[560px] gap-3">
      <h2 className="sf-heading m-0">Card types</h2>
      <p className="text-ink-2 m-0 text-sm">
        Run one card of each type. Each has its own design, counter code and customers. Turning a card
        off freezes it: customers keep it and can still use what they've earned, but nobody new can
        join and it collects nothing more.
      </p>
      {!types || !programs ? (
        <Skeleton className="h-60 rounded-[var(--radius-lg)]" />
      ) : (
        <ul className="sf-rows sf-rows--wells">
          {types.map((t) => {
            const card = programs.find((p) => p.type === t.type);
            const enabled = card?.status === "active";
            const last = enabled && on.length === 1;
            const note = last
              ? "Your only card, so it stays on until you turn another on."
              : card?.status === "frozen" && card.frozenAt
                ? `Off since ${day(card.frozenAt)}. Customers keep their cards and can redeem them.`
                : null;
            return (
              <li key={t.type} className="sf-row sf-row--well">
                <label className="sf-spread col-span-full cursor-pointer has-[:disabled]:cursor-default">
                  <span className="sf-row__main">
                    <span className="sf-row__title">{t.label}</span>
                    <span id={`card-type-${t.type}`} className="sf-row__meta whitespace-normal">
                      {t.blurb}
                      {note && (
                        <>
                          <br />
                          <span className="text-ink-2">{note}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="sf-switch disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={t.label}
                    aria-describedby={`card-type-${t.type}`}
                    checked={busy?.type === t.type ? busy.enabled : enabled}
                    disabled={busy !== null || last}
                    onChange={(e) => void toggle(t.type, e.target.checked)}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {err && (
        <p role="alert" className="sf-field__error m-0">
          {err}
        </p>
      )}
    </Card>
  );
}
