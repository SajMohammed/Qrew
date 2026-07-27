import { useCallback, useEffect, useRef, useState } from "react";
import {
  enroll,
  getCard,
  simulateStamp,
  redeemReward,
  getMyCards,
  claimCard,
  tileFromMyCard,
  tileFromCardView,
  type CardView,
  type CardTile,
} from "./api";
import { useCustomerAuth } from "./useCustomerAuth";
import { StampCard } from "./StampCard";
import { CardsGrid } from "./CardsGrid";
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
  const [enrollCtx, setEnrollCtx] = useState<{ serial: string; enrollmentId: string; merchantId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const claimedRef = useRef(false);

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
    if (auth.ready) void loadTiles();
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
      for (const s of locals) {
        try {
          await claimCard(auth.token!, s);
        } catch {
          /* a card already owned / gone — skip it */
        }
      }
      writeLocal([]);
      setLocalSerials([]);
      await loadTiles();
    })();
  }, [auth.token, loadTiles]);

  // Card detail: fetch + poll so stamps added by staff appear live.
  useEffect(() => {
    if (!selected) {
      setCard(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const c = await getCard(selected);
        if (alive) setCard(c);
      } catch {
        if (alive) setCard(null);
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
      const r = await enroll({ merchantId: shop.m, programId: shop.p, name: auth.signedIn ? undefined : "Guest" }, auth.token);
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
        <button className="shop-cta" disabled={busy} onClick={addShopCard}>
          {busy ? "Getting your card…" : "＋ Get this shop's card"}
        </button>
      )}

      {tiles.length > 0 ? (
        <>
          <h1 className="home-h1">{auth.signedIn ? "Your cards" : "Cards on this device"}</h1>
          <CardsGrid cards={tiles} onOpen={openCard} />
        </>
      ) : (
        <div className="empty">
          <div className="empty-art">🎟️</div>
          <h1>No cards yet</h1>
          <p className="sub">Scan a shop's Qrew code to get your first stamp card.</p>
        </div>
      )}

      {!auth.signedIn && auth.ready && (
        <SignInPanel onGoogle={auth.signInGoogle} onDev={auth.signInDev} compact={tiles.length > 0} />
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
