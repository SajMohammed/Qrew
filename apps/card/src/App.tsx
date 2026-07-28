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

export function App() {
  const auth = useCustomerAuth();
  const [shop, setShop] = useState(() => ({ m: param("m"), p: param("p") }));
  const [localSerials, setLocalSerials] = useState<string[]>(readLocal);
  const [tiles, setTiles] = useState<CardTile[]>([]);
  const [selected, setSelected] = useState<string | null>(() => param("card") || null);
  const [card, setCard] = useState<CardView | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [enrollCtx, setEnrollCtx] = useState<{ serial: string; enrollmentId: string; merchantId: string } | null>(null);
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
    if (shop.m && shop.p) getShopPreview(shop.m, shop.p).then(setPreview).catch(() => setPreview(null));
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
      setTiles(settled.flatMap((r) => (r.status === "fulfilled" ? [tileFromCardView(r.value)] : [])));
    }
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

  const openCard = (serial: string) => {
    setSelected(serial);
    window.history.replaceState(null, "", `?card=${serial}`);
  };
  const backHome = () => {
    setSelected(null);
    setCard(null);
    window.history.replaceState(null, "", window.location.pathname);
    void loadTiles();
  };

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

  // ── card detail ──────────────────────────────────────────────────────────────
  if (selected && card) {
    const enrolled = enrollCtx?.serial === selected;
    return (
      <StampCard
        card={card}
        busy={busy}
        err={err}
        onBack={backHome}
        onStamp={enrolled ? devStamp : undefined}
        onRedeem={enrolled ? devRedeem : undefined}
      />
    );
  }
  if (selected && detailError) {
    return (
      <div className="screen center">
        <button className="back" onClick={backHome}>
          ‹ All cards
        </button>
        <div className="empty">
          <div className="empty-art">🔍</div>
          <h1>Card not found</h1>
          <p className="sub">This card may have been removed. Head back to your cards.</p>
        </div>
      </div>
    );
  }
  if (selected && !card) {
    return (
      <div className="screen center">
        <p className="sub">Loading your card…</p>
      </div>
    );
  }

  // ── home ─────────────────────────────────────────────────────────────────────
  return (
    <div className="screen home">
      <header className="home-top">
        <div className="wordmark">
          <span className="q">Q</span>rew
        </div>
        {auth.signedIn && (
          <button className="link" onClick={() => void auth.signOut()}>
            Sign out
          </button>
        )}
      </header>

      {shop.m && shop.p && (
        <div className="enroll-shop">
          {preview && <CardPreview preview={preview} />}
          <button className="shop-cta" disabled={busy} onClick={addShopCard}>
            {busy ? "Getting your card…" : "＋ Get this shop's card"}
          </button>
        </div>
      )}

      {tiles.length > 0 ? (
        <>
          <h1 className="home-h1">{auth.signedIn ? "Your cards" : "Cards on this device"}</h1>
          <CardsGrid cards={tiles} onOpen={openCard} />
        </>
      ) : shop.m && shop.p ? null : (
        <div className="empty">
          <div className="empty-art">🎟️</div>
          <h1>No cards yet</h1>
          <p className="sub">Scan a shop's Qrew code to get your first stamp card.</p>
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
      {err && <p className="err">{err}</p>}
    </div>
  );
}
