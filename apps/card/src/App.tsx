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
  type CardView,
  type CardTile,
  type ShopPreview,
} from "./api";
import { useCustomerAuth } from "./useCustomerAuth";
import { StampCard } from "./StampCard";
import { CardsGrid } from "./CardsGrid";
import { CardPreview } from "./CardPreview";
import { SignInPanel } from "./SignInPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PullToRefresh } from "@/components/PullToRefresh";
import { CardsSkeleton, CardDetailSkeleton } from "@/components/Skeleton";
import { buzz } from "@/lib/haptics";

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

const SCREEN = "mx-auto w-full max-w-[440px] sm:max-w-[560px]";

export function App() {
  const auth = useCustomerAuth();
  const [shop, setShop] = useState(() => ({ m: param("m"), p: param("p") }));
  const [localSerials, setLocalSerials] = useState<string[]>(readLocal);
  const [tiles, setTiles] = useState<CardTile[]>([]);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(() => param("card") || null);
  const [card, setCard] = useState<CardView | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [enrollCtx, setEnrollCtx] = useState<{
    serial: string;
    enrollmentId: string;
    merchantId: string;
  } | null>(null);
  const [preview, setPreview] = useState<ShopPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const claimedRef = useRef(false);
  // The QR's signed token is valid ~2 min; hold it steady across the 4s stamp-poll (refresh only near
  // expiry) so it doesn't visibly change every few seconds while the customer is showing it to staff.
  const qrRef = useRef<{ token: string; at: number } | null>(null);

  // Fetch the shop's card preview when arriving from a counter QR (?m=&p=), so the customer sees what
  // they'll get before enrolling.
  useEffect(() => {
    if (shop.m && shop.p)
      getShopPreview(shop.m, shop.p)
        .then(setPreview)
        .catch(() => setPreview(null));
  }, [shop.m, shop.p]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // The grid: signed in → /me/cards; anonymous → each device-local serial via the public getCard.
  const loadTiles = useCallback(async () => {
    if (auth.token) {
      setTiles((await getMyCards(auth.token)).map(tileFromMyCard));
    } else {
      const settled = await Promise.allSettled(localSerials.map((s) => getCard(s)));
      setTiles(
        settled.flatMap((r) => (r.status === "fulfilled" ? [tileFromCardView(r.value)] : [])),
      );
    }
    setTilesLoaded(true);
  }, [auth.token, localSerials]);

  useEffect(() => {
    // surface load failures (e.g. an expired token 401) instead of silently showing an empty grid
    if (auth.ready) loadTiles().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [auth.ready, loadTiles]);

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
      const remaining: string[] = [];
      for (const s of locals) {
        if (!(await claimCard(auth.token!, s))) remaining.push(s);
      }
      writeLocal(remaining);
      setLocalSerials(remaining);
      await loadTiles().catch(() => {});
    })();
  }, [auth.token, loadTiles]);

  // Card detail: fetch + poll so stamps added by staff appear live.
  useEffect(() => {
    if (!selected) {
      setCard(null);
      setDetailError(false);
      return;
    }
    setDetailError(false);
    qrRef.current = null; // new card → adopt a fresh stable token on first load
    let alive = true;
    let loaded = false; // once we've shown the card, a later poll blip must NOT flip to the error screen
    const load = async () => {
      try {
        const c = await getCard(selected);
        if (alive) {
          // Hold the QR steady: only adopt a fresh token when we have none or the current is near expiry.
          // Stamp counts still update every poll; the code just stops flickering every 4s.
          if (!qrRef.current || Date.now() - qrRef.current.at > 100_000) {
            qrRef.current = { token: c.qrToken, at: Date.now() };
          }
          setCard({ ...c, qrToken: qrRef.current.token });
          loaded = true;
          setDetailError(false);
        }
      } catch {
        if (alive && !loaded) setDetailError(true); // only a dead-end if the card never loaded
      }
    };
    void load();
    const t = window.setInterval(load, 4000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [selected]);

  /*
   * Real history entries, so the phone's Back button moves from a card to the wallet instead of
   * closing the app. `popstate` is the single source of truth for which screen is showing.
   */
  const openCard = useCallback((serial: string) => {
    window.history.pushState({ card: serial }, "", `?card=${serial}`);
    setSelected(serial);
  }, []);

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
      const r = await enroll({ merchantId: shop.m, programId: shop.p }, auth.token);
      setEnrollCtx({ serial: r.serial, enrollmentId: r.enrollmentId, merchantId: shop.m });
      if (!auth.token) {
        const next = [...new Set([...localSerials, r.serial])];
        writeLocal(next);
        setLocalSerials(next);
      }
      setShop({ m: "", p: "" }); // got it — hide the CTA
      buzz([12, 40, 16]);
      openCard(r.serial);
    });

  // DEV self-test controls (only for a card we just enrolled, so we hold its ids).
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

  const screen = selected ? (card ? "detail" : detailError ? "missing" : "loading") : "home";

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
            onStamp={enrollCtx?.serial === selected ? devStamp : undefined}
            onRedeem={enrollCtx?.serial === selected ? devRedeem : undefined}
          />
        )}

        {screen === "missing" && (
          <div className={`${SCREEN} flex flex-col gap-4 px-5 pt-4`}>
            <button
              type="button"
              onClick={backHome}
              className="text-muted-foreground -ml-1 self-start rounded-lg px-1 py-2 text-sm font-semibold"
            >
              ‹ All cards
            </button>
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="text-4xl" aria-hidden>
                🔍
              </span>
              <h1 className="text-xl font-extrabold">Card not found</h1>
              <p className="text-muted-foreground text-sm">
                This card may have been removed. Head back to your cards.
              </p>
            </div>
          </div>
        )}

        {screen === "loading" && (
          <div className={`${SCREEN} px-5 pt-14`}>
            <CardDetailSkeleton />
          </div>
        )}

        {screen === "home" && (
          <PullToRefresh onRefresh={loadTiles}>
            <div
              className={`${SCREEN} flex min-h-dvh flex-col gap-4 px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]`}
            >
              <header className="flex items-center gap-3">
                <span className="font-display text-2xl tracking-wide">
                  <span className="text-primary">Q</span>rew
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <ThemeToggle />
                  {auth.signedIn && (
                    <button
                      type="button"
                      onClick={() => void auth.signOut()}
                      className="text-muted-foreground rounded-lg px-2 py-2 text-[13px] font-semibold"
                    >
                      Sign out
                    </button>
                  )}
                </div>
              </header>

              {shop.m && shop.p && (
                <div className="flex flex-col gap-3">
                  {preview && <CardPreview preview={preview} />}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={addShopCard}
                    className="bg-primary text-primary-foreground min-h-13 w-full rounded-2xl text-[15px] font-extrabold transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy ? "Getting your card…" : "＋ Get this shop's card"}
                  </button>
                </div>
              )}

              {!tilesLoaded ? (
                <CardsSkeleton />
              ) : tiles.length > 0 ? (
                <>
                  <h1 className="text-xl font-extrabold tracking-tight">
                    {auth.signedIn ? "Your cards" : "Cards on this device"}
                  </h1>
                  <CardsGrid cards={tiles} onOpen={openCard} />
                </>
              ) : shop.m && shop.p ? null : (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <span className="text-4xl" aria-hidden>
                    🎟️
                  </span>
                  <h1 className="text-xl font-extrabold">No cards yet</h1>
                  <p className="text-muted-foreground text-sm">
                    Scan a shop's Qrew code to get your first stamp card.
                  </p>
                </div>
              )}

              {!auth.signedIn && auth.ready && (
                <SignInPanel
                  onGoogle={auth.signInGoogle}
                  onDev={auth.signInDev}
                  // compact = follow the content instead of anchoring to the bottom (avoids a big gap under
                  // the enroll preview / when cards are shown); only the bare empty state pins it to the bottom.
                  compact={tiles.length > 0 || Boolean(shop.m && shop.p)}
                />
              )}
              {err && <p className="text-destructive text-center text-sm">{err}</p>}
            </div>
          </PullToRefresh>
        )}
    </div>
  );
}
