import { useCallback, useEffect, useRef, useState } from "react";
import {
  enroll,
  getCard,
  simulateStamp,
  redeemReward,
  getMyCards,
  claimCard,
  getShopPreview,
  tileFromMyCard,
  tileFromCardView,
  heldCardFor,
  failureKind,
  friendlyError,
  type CardView,
  type CardTile,
  type EnrollResult,
  type FailureKind,
  type ShopPreview,
} from "./api";
import { useCustomerAuth } from "./useCustomerAuth";
import { StampCard } from "./StampCard";
import { CardsGrid } from "./CardsGrid";
import { CardPreview } from "./CardPreview";
import { SignInPanel } from "./SignInPanel";
import { SaveCardNudge } from "./SaveCardNudge";
import { ConnectionNotice } from "./ConnectionNotice";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Icon } from "@/components/Icon";
import { PullToRefresh } from "@/components/PullToRefresh";
import { CardsSkeleton, CardDetailSkeleton, Skeleton } from "@/components/Skeleton";
import { buzz } from "@/lib/haptics";
import {
  POLL_MS,
  MISSING_POLL_MS,
  DEFAULT_QR_TTL_MS,
  shouldAdoptToken,
  qrExpiresAt,
  qrState,
} from "@/lib/connection";

function param(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

// Anonymous, device-local card list (a signed-in user's cards live server-side via /me/cards).
const LOCAL_KEY = "qrew.cards";
function readLocal(): string[] {
  let list: string[] = [];
  try {
    const arr: unknown = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    if (Array.isArray(arr)) list = arr.filter((s): s is string => typeof s === "string");
  } catch {
    list = [];
  }
  const legacy = localStorage.getItem("qrew.card"); // migrate the old single-card key
  if (legacy && !list.includes(legacy)) list.push(legacy);
  return list;
}
function writeLocal(serials: string[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(serials));
  localStorage.removeItem("qrew.card");
}
/**
 * Add a card to the device's list, merged with what's stored now — another tab may have saved one
 * since this one read the list, and writing this tab's copy back would erase it.
 */
function addLocal(serial: string): string[] {
  const next = [...new Set([...readLocal(), serial])];
  writeLocal(next);
  return next;
}

/*
 * Which programme each card on this device belongs to, remembered. A card that can't be checked
 * right now (no signal, Qrew down) still counts as this shop's card when its counter code is
 * scanned again — otherwise the landing would offer a second card, with a second head start.
 */
const PROGRAMS_KEY = "qrew.cards.programs";
function readPrograms(): Record<string, string> {
  try {
    const o: unknown = JSON.parse(localStorage.getItem(PROGRAMS_KEY) ?? "{}");
    return o && typeof o === "object" ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function rememberPrograms(entries: Record<string, string>): void {
  try {
    localStorage.setItem(PROGRAMS_KEY, JSON.stringify({ ...readPrograms(), ...entries }));
  } catch {
    /* not remembered — the card is still checked when it loads */
  }
}

// "Not now" on the save-your-card nudge, remembered for this device.
const NUDGE_KEY = "qrew.saveNudge.dismissed";
function readNudgeDismissed(): boolean {
  try {
    return localStorage.getItem(NUDGE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeNudgeDismissed(): void {
  try {
    localStorage.setItem(NUDGE_KEY, "1");
  } catch {
    /* shown again next visit — harmless */
  }
}

type PreviewState =
  | { status: "idle" | "loading" }
  | { status: "ready"; preview: ShopPreview }
  | { status: "failed"; reason: FailureKind };

const SCREEN = "mx-auto w-full max-w-[440px] sm:max-w-[560px]";

export function App() {
  const auth = useCustomerAuth();
  const [shop, setShop] = useState(() => ({ m: param("m"), p: param("p") }));
  const [localSerials, setLocalSerials] = useState<string[]>(readLocal);
  const [tiles, setTiles] = useState<CardTile[]>([]);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  // Cards that couldn't be checked just now (missing: how many; null when it's the whole account list).
  // `unknown`: how many of them this device can't place at a shop — while any can't, getting a new card
  // waits, since one of them may be that shop's.
  const [tilesProblem, setTilesProblem] = useState<{ kind: FailureKind; missing: number | null; unknown: number } | null>(
    null,
  );
  const [selected, setSelected] = useState<string | null>(() => param("card") || null);
  const [card, setCard] = useState<CardView | null>(null);
  // Why the open card hasn't loaded (before it ever has).
  const [detailError, setDetailError] = useState<FailureKind | null>(null);
  // Whether the open card's polls are failing. A new object each time, so the code's age is re-judged.
  const [sync, setSync] = useState<{ failing: FailureKind | null; at: number }>({ failing: null, at: 0 });
  const [qrHeld, setQrHeld] = useState<{ at: number; ttlMs: number } | null>(null);
  const retryDetailRef = useRef<() => void>(() => {});
  const [nudgeDismissed, setNudgeDismissed] = useState(readNudgeDismissed);
  const [enrollCtx, setEnrollCtx] = useState<{
    serial: string;
    enrollmentId: string;
    merchantId: string;
  } | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const claimedRef = useRef(false);
  // The QR's signed token is valid ~2 min; hold it steady across the 4s stamp-poll (refresh only near
  // expiry) so it doesn't visibly change every few seconds while the customer is showing it to staff.
  const qrRef = useRef<{ token: string; at: number; ttlMs: number } | null>(null);

  // Fetch the shop's card preview when arriving from a counter QR (?m=&p=), so the customer sees what
  // they'll get before enrolling.
  useEffect(() => {
    if (!shop.m || !shop.p) {
      setPreview({ status: "idle" });
      return;
    }
    let alive = true;
    setPreview({ status: "loading" });
    getShopPreview(shop.m, shop.p).then(
      (p) => alive && setPreview({ status: "ready", preview: p }),
      (e) => alive && setPreview({ status: "failed", reason: failureKind(e) }),
    );
    return () => {
      alive = false;
    };
  }, [shop.m, shop.p, previewAttempt]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // The grid: signed in → /me/cards; anonymous → each device-local serial via the public getCard.
  const loadTiles = useCallback(async () => {
    // Not before sign-in has been restored: until then a signed-in person would look anonymous.
    if (!auth.ready) return;
    try {
      if (auth.token) {
        try {
          setTiles((await getMyCards(auth.token)).map(tileFromMyCard));
          setTilesProblem(null);
        } catch (e) {
          // Keep whatever is on screen, and say why it may be out of date. (The server dedupes a
          // signed-in enrol, so nothing here needs to hold the enrol button.)
          setTilesProblem({ kind: failureKind(e), missing: null, unknown: 0 });
        }
      } else if (!auth.stalled) {
        const settled = await Promise.allSettled(localSerials.map((s) => getCard(s)));
        const fresh = new Map<string, CardTile>();
        const unchecked = new Set<string>();
        let offline = false;
        settled.forEach((r, i) => {
          const serial = localSerials[i]!;
          if (r.status === "fulfilled") {
            fresh.set(serial, tileFromCardView(r.value));
          } else if (failureKind(r.reason) !== "not_found") {
            unchecked.add(serial);
            offline ||= failureKind(r.reason) === "offline";
          }
          // A card that answers 404 is hidden but stays stored: a misrouted deploy answers 404 for
          // everything, and pruning on it would wipe every customer's cards for good.
        });
        rememberPrograms(Object.fromEntries([...fresh.values()].map((t) => [t.serial, t.programId])));
        // A card that couldn't be checked keeps the tile it had, rather than vanishing.
        setTiles((prev) =>
          localSerials.flatMap((s) => {
            const t = fresh.get(s) ?? (unchecked.has(s) ? prev.find((p) => p.serial === s) : undefined);
            return t ? [t] : [];
          }),
        );
        const programs = readPrograms();
        const unknown = [...unchecked].filter((s) => !programs[s]).length;
        setTilesProblem(
          unchecked.size ? { kind: offline ? "offline" : "server", missing: unchecked.size, unknown } : null,
        );
      }
    } finally {
      setTilesLoaded(true);
    }
  }, [auth.ready, auth.token, auth.stalled, localSerials]);

  useEffect(() => {
    if (auth.ready) void loadTiles();
  }, [auth.ready, loadTiles]);

  // Back online: check the cards again, and the shop's card if that's what failed.
  useEffect(() => {
    const onOnline = () => {
      void loadTiles();
      if (preview.status === "failed" && preview.reason !== "not_found") setPreviewAttempt((n) => n + 1);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loadTiles, preview]);

  // Reset the one-shot claim guard whenever we're signed out, so a later sign-in claims again.
  useEffect(() => {
    if (!auth.signedIn) claimedRef.current = false;
  }, [auth.signedIn]);

  // On sign-in, fold any anonymous local cards into the account, then clear local + reload.
  useEffect(() => {
    if (!auth.token || claimedRef.current) return;
    claimedRef.current = true;
    const locals = readLocal();
    if (locals.length === 0) return;
    void (async () => {
      // Keep any serial that failed for a TRANSIENT reason (network / just-expired token) so the card
      // isn't wiped from the device before it lands on the account — claimCard returns false in that case.
      const done = new Set<string>();
      for (const s of locals) {
        if (await claimCard(auth.token!, s)) done.add(s);
      }
      // Against what's stored now, not the list read above: another tab may have added a card since.
      const remaining = readLocal().filter((s) => !done.has(s));
      writeLocal(remaining);
      setLocalSerials(remaining);
      await loadTiles().catch(() => {});
    })();
  }, [auth.token, loadTiles]);

  // Card detail: fetch + poll so stamps added by staff appear live.
  useEffect(() => {
    setCard(null);
    setDetailError(null);
    setSync({ failing: null, at: 0 });
    setQrHeld(null);
    qrRef.current = null; // new card → adopt a fresh stable token on first load
    if (!selected) return;

    let alive = true;
    let loaded = false; // once we've shown the card, a later poll blip must NOT flip to an error screen
    let inFlight = false;
    let lastLoadAt = 0;
    let timer: number | undefined;

    // Each poll schedules the next once it has answered, so a slow one never piles up behind itself.
    const load = async () => {
      if (inFlight || !alive) return;
      inFlight = true;
      window.clearTimeout(timer);
      let next = POLL_MS;
      // The token is minted before the answer is sent, so its age counts from when we asked — on a
      // slow connection that answer can take seconds, and the code would look fresher than it is.
      const askedAt = Date.now();
      try {
        const c = await getCard(selected);
        if (!alive) return;
        const now = Date.now();
        // Hold the QR steady: only adopt a fresh token when we have none or the current is near expiry.
        // Stamp counts still update every poll; the code just stops flickering every 4s.
        if (!qrRef.current || shouldAdoptToken(qrRef.current.at, qrRef.current.ttlMs, now)) {
          qrRef.current = { token: c.qrToken, at: askedAt, ttlMs: c.qrTtlMs ?? DEFAULT_QR_TTL_MS };
          setQrHeld({ at: askedAt, ttlMs: qrRef.current.ttlMs });
        }
        setCard({ ...c, qrToken: qrRef.current.token });
        loaded = true;
        setDetailError(null);
        setSync({ failing: null, at: now });
      } catch (e) {
        if (!alive) return;
        const kind = failureKind(e);
        if (loaded) {
          setSync({ failing: kind, at: Date.now() }); // keep the card; say it's reconnecting
        } else {
          setDetailError(kind);
          // Most likely gone for good — but a misrouted deploy answers 404 too, so keep looking, slowly.
          if (kind === "not_found") next = MISSING_POLL_MS;
        }
      } finally {
        inFlight = false;
        lastLoadAt = Date.now();
        if (alive) timer = window.setTimeout(() => void load(), next);
      }
    };

    const onOnline = () => void load();
    // Back from the background: judge the code's age now (the phone may have slept past it), and
    // reload if the last answer is older than a poll. A quick app switch costs nothing extra.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setSync((s) => ({ ...s, at: Date.now() }));
      if (Date.now() - lastLoadAt > POLL_MS) void load();
    };
    retryDetailRef.current = () => void load();

    void load();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selected]);

  // Re-judge the code the moment it lapses, rather than at whichever poll comes next.
  useEffect(() => {
    if (!qrHeld) return;
    const wait = Math.max(0, qrExpiresAt(qrHeld.at, qrHeld.ttlMs) - Date.now()) + 50;
    const t = window.setTimeout(() => setSync((s) => ({ ...s, at: Date.now() })), wait);
    return () => window.clearTimeout(t);
  }, [qrHeld]);

  /*
   * Keep a card opened from its link. An iOS Home Screen app has its own storage, separate from
   * Safari's, and the card link it opens with is how a card gets there; it also keeps a card someone
   * reopened from its link. Only for someone signed out — a signed-in person's cards live on their
   * account — and never while a session is waiting to be restored.
   */
  useEffect(() => {
    if (!card || !auth.ready || auth.signedIn || auth.stalled || localSerials.includes(card.serial)) return;
    rememberPrograms({ [card.serial]: card.programId });
    setLocalSerials(addLocal(card.serial));
  }, [card, auth.ready, auth.signedIn, auth.stalled, localSerials]);

  /*
   * Real history entries, so the phone's Back button moves from a card to the wallet instead of
   * closing the app. `popstate` is the single source of truth for which screen is showing.
   */
  const openCard = useCallback((serial: string) => {
    window.history.pushState({ card: serial }, "", `?card=${serial}`);
    setSelected(serial);
  }, []);

  /*
   * Scanning a counter code for a programme this device already holds opens that card — never a
   * second one with a second head start. The landing entry is replaced, so Back from the card goes
   * to the wallet rather than into this redirect again.
   */
  useEffect(() => {
    // Only from the landing itself — never pull someone off a card they've opened since.
    if (!shop.p || !tilesLoaded || selected) return;
    const programs = auth.signedIn ? {} : readPrograms();
    const held = heldCardFor(tiles, shop.p)?.serial ?? localSerials.find((s) => programs[s] === shop.p);
    if (!held) return;
    window.history.replaceState(null, "", window.location.pathname);
    setShop({ m: "", p: "" });
    openCard(held);
  }, [shop.p, tilesLoaded, selected, tiles, localSerials, auth.signedIn, openCard]);

  const backHome = useCallback(() => {
    if ((window.history.state as { card?: string } | null)?.card) {
      window.history.back(); // popstate below clears the selection
      return;
    }
    // Deep-linked straight to a card: there's nothing to go back to, so rewrite in place.
    window.history.replaceState(null, "", window.location.pathname);
    setSelected(null);
    void loadTiles();
  }, [loadTiles]);

  useEffect(() => {
    const onPop = () => {
      const next = new URLSearchParams(window.location.search).get("card");
      setSelected(next || null);
      if (!next) void loadTiles();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [loadTiles]);

  const addShopCard = () =>
    void run(async () => {
      let r: EnrollResult;
      // A lapsed access token would be read as no sign-in at all, and the card saved nowhere: it would
      // be on no account, and (signed in) not kept on the device either. Refresh it first.
      const token = await auth.freshToken();
      try {
        r = await enroll({ merchantId: shop.m, programId: shop.p }, token);
      } catch (e) {
        // The shop's card went away between the preview and the tap.
        if (failureKind(e) === "not_found") {
          setPreview({ status: "failed", reason: "not_found" });
          return;
        }
        throw e;
      }
      setEnrollCtx({ serial: r.serial, enrollmentId: r.enrollmentId, merchantId: shop.m });
      if (!token) {
        rememberPrograms({ [r.serial]: shop.p });
        setLocalSerials(addLocal(r.serial));
        // Ask the browser not to clear the only copy of this card. Quietly: most say yes or no unasked.
        void navigator.storage?.persist?.().catch(() => false);
      }
      setShop({ m: "", p: "" }); // got it — hide the CTA
      buzz([12, 40, 16]);
      openCard(r.serial);
    });

  // DEV self-test controls (only for a card we just enrolled, so we hold its ids). Development builds
  // only: they call the API with x-merchant-id, which a deployed API rejects.
  const devStamp = () => {
    if (!enrollCtx) return;
    void run(async () => {
      await simulateStamp(enrollCtx.merchantId, enrollCtx.enrollmentId);
      setCard(await getCard(enrollCtx.serial));
    });
  };
  const devRedeem = () => {
    if (!enrollCtx) return;
    void run(async () => {
      await redeemReward(enrollCtx.merchantId, enrollCtx.enrollmentId);
      setCard(await getCard(enrollCtx.serial));
    });
  };

  const screen = selected
    ? card
      ? "detail"
      : detailError === "not_found"
        ? "missing"
        : detailError
          ? "unreachable"
          : "loading"
    : "home";

  const qr = qrHeld ? qrState({ heldAt: qrHeld.at, ttlMs: qrHeld.ttlMs, failing: sync.failing, now: Date.now() }) : "live";
  // The counter-QR landing: the shop's card is this screen's vivid surface, so the wallet below it lists rows.
  const landing = Boolean(shop.m && shop.p && tilesLoaded);
  const joining = landing && preview.status === "ready" ? preview.preview.merchantName : null;
  const cardsTitle = auth.signedIn ? (
    <>
      <span className="sf-lead">Your</span> <strong>cards</strong>
    </>
  ) : (
    <>
      <span className="sf-lead">Cards on</span> <strong>this device</strong>
    </>
  );

  const showNudge =
    Boolean(card) && auth.ready && !auth.signedIn && !auth.stalled && !nudgeDismissed && localSerials.includes(card!.serial);

  return (
    <div
      key={screen === "detail" ? `detail:${selected}` : screen}
      className="screen-in min-h-dvh"
    >
        {screen === "detail" && card && (
          <StampCard
            card={card}
            busy={busy}
            err={err}
            onBack={backHome}
            onStamp={import.meta.env.DEV && enrollCtx?.serial === selected ? devStamp : undefined}
            onRedeem={import.meta.env.DEV && enrollCtx?.serial === selected ? devRedeem : undefined}
            connection={{ qr, failing: sync.failing }}
            onRetry={() => retryDetailRef.current()}
            footer={
              showNudge ? (
                <SaveCardNudge
                  serial={card.serial}
                  onGoogle={auth.signInGoogle}
                  onDev={auth.signInDev}
                  onDismiss={() => {
                    writeNudgeDismissed();
                    setNudgeDismissed(true);
                  }}
                />
              ) : null
            }
          />
        )}

        {screen === "missing" && (
          <div className={`${SCREEN} flex flex-col gap-4 px-4 pt-4`}>
            <button type="button" onClick={backHome} className="sf-btn sf-btn--ghost -ml-2 self-start px-3">
              ‹ All cards
            </button>
            <div className="sf-empty">
              <span className="sf-bubble sf-bubble--lens sf-bubble--lg pointer-events-none" aria-hidden>
                <Icon name="search" />
              </span>
              <h1 className="sf-title sf-twotone">
                <span className="sf-lead">Card</span> <strong>not found</strong>
              </h1>
              <p>This card may have been removed. Head back to your cards.</p>
              <button type="button" onClick={() => retryDetailRef.current()} className="sf-btn mt-2">
                Try again
              </button>
            </div>
          </div>
        )}

        {screen === "unreachable" && (
          <div className={`${SCREEN} flex flex-col gap-4 px-4 pt-4`}>
            <button type="button" onClick={backHome} className="sf-btn sf-btn--ghost -ml-2 self-start px-3">
              ‹ All cards
            </button>
            <div className="sf-empty">
              <span className="sf-bubble sf-bubble--lens sf-bubble--lg pointer-events-none" aria-hidden>
                <Icon name={detailError === "offline" ? "wifiOff" : "cloudOff"} />
              </span>
              <h1 className="sf-title sf-twotone">
                <span className="sf-lead">Can't load</span> <strong>your card</strong>
              </h1>
              <p>
                {detailError === "offline"
                  ? "No connection. Your stamps are safe — your card will load as soon as you're back online."
                  : "Qrew isn't responding right now. Your stamps are safe — try again in a moment."}
              </p>
              <button type="button" onClick={() => retryDetailRef.current()} className="sf-btn sf-btn--primary mt-2">
                Try again
              </button>
            </div>
          </div>
        )}

        {screen === "loading" && (
          <div className={`${SCREEN} px-4 pt-[76px]`}>
            <CardDetailSkeleton />
          </div>
        )}

        {screen === "home" && (
          <PullToRefresh onRefresh={loadTiles}>
            <div
              className={`${SCREEN} flex min-h-dvh flex-col gap-6 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]`}
            >
              <header className="sf-spread">
                <span className="qrew-wordmark">Qrew</span>
                <div className="sf-cluster">
                  <ThemeToggle />
                  {auth.signedIn && (
                    <button type="button" onClick={() => void auth.signOut()} className="sf-btn sf-btn--ghost px-4">
                      Sign out
                    </button>
                  )}
                </div>
              </header>

              {auth.stalled && (
                <ConnectionNotice
                  title={auth.stalled === "offline" ? "No connection" : "Can't reach Qrew right now"}
                  body={
                    auth.stalled === "offline"
                      ? "You're signed in — your cards will show when you're back online."
                      : "You're signed in, and your stamps are safe — try again in a moment."
                  }
                  onRetry={auth.retry}
                />
              )}

              {/* Only once this device's cards are known: one of them may be this shop's (see the redirect). */}
              {landing && (
                <div className="flex flex-col gap-4">
                  {preview.status === "ready" ? (
                    <>
                      <h1 className="sf-display sf-twotone">
                        <span className="sf-lead">Join</span> <strong>{joining}</strong>
                      </h1>
                      <CardPreview preview={preview.preview} />
                      <button
                        type="button"
                        // Not while a signed-in session is waiting (this would make an anonymous card), nor
                        // while a card here that can't be checked might be this shop's.
                        disabled={busy || Boolean(auth.stalled) || Boolean(tilesProblem?.unknown)}
                        onClick={addShopCard}
                        className="sf-btn sf-btn--primary sf-btn--lg sf-btn--block"
                      >
                        {busy ? (
                          "Getting your card…"
                        ) : (
                          <>
                            <Icon name="plus" />
                            Get this shop's card
                          </>
                        )}
                      </button>
                    </>
                  ) : preview.status === "failed" ? (
                    preview.reason === "not_found" ? (
                      <ConnectionNotice
                        tone="neutral"
                        title="This code isn't active"
                        body="This shop's card isn't available right now — ask the staff for help."
                      />
                    ) : (
                      <ConnectionNotice
                        title={preview.reason === "offline" ? "No connection" : "Couldn't load this shop's card"}
                        body={
                          preview.reason === "offline"
                            ? "Connect to the internet to get this card."
                            : "Try again in a moment."
                        }
                        onRetry={() => setPreviewAttempt((n) => n + 1)}
                      />
                    )
                  ) : (
                    <>
                      <Skeleton className="h-[260px] rounded-xl" />
                      <button type="button" disabled className="sf-btn sf-btn--primary sf-btn--lg sf-btn--block">
                        Loading…
                      </button>
                    </>
                  )}
                </div>
              )}

              {tilesProblem && (
                <ConnectionNotice
                  title={tilesProblem.kind === "offline" ? "No connection" : "Can't reach Qrew right now"}
                  body={
                    tilesProblem.kind !== "offline"
                      ? "Your stamps are safe — try again in a moment."
                      : tilesProblem.missing !== null
                        ? `${tilesProblem.missing} card${tilesProblem.missing === 1 ? "" : "s"} on this device couldn't be checked — they'll update when you're back online.`
                        : tiles.length
                          ? "Showing your cards from earlier."
                          : "Your cards will show when you're back online."
                  }
                  onRetry={() => void loadTiles()}
                />
              )}

              {!tilesLoaded ? (
                <CardsSkeleton />
              ) : tiles.length > 0 ? (
                <>
                  {joining ? (
                    <h2 className="sf-heading sf-twotone">{cardsTitle}</h2>
                  ) : (
                    <h1 className="sf-display sf-twotone">{cardsTitle}</h1>
                  )}
                  <CardsGrid cards={tiles} onOpen={openCard} lead={!landing} />
                </>
              ) : (shop.m && shop.p) || tilesProblem || auth.stalled ? null : (
                <div className="sf-empty">
                  <span className="sf-bubble sf-bubble--lens sf-bubble--lg pointer-events-none" aria-hidden>
                    <Icon name="ticket" />
                  </span>
                  <h1 className="sf-title sf-twotone">
                    <span className="sf-lead">No cards</span> <strong>yet</strong>
                  </h1>
                  <p>Scan a shop's Qrew code to get your first stamp card.</p>
                </div>
              )}

              {!auth.signedIn && auth.ready && !auth.stalled && (
                <SignInPanel
                  onGoogle={auth.signInGoogle}
                  onDev={auth.signInDev}
                  // compact = follow the content instead of anchoring to the bottom (avoids a big gap under
                  // the enroll preview / when cards are shown); only the bare empty state pins it to the bottom.
                  compact={tiles.length > 0 || Boolean(shop.m && shop.p)}
                />
              )}
              {err && <p className="text-danger-ink m-0 text-center text-sm">{err}</p>}
            </div>
          </PullToRefresh>
        )}
    </div>
  );
}
