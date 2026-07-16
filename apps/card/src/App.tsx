import { useEffect, useState } from "react";
import { enroll, getCard, simulateStamp, redeemReward, type CardView } from "./api";
import { StampCard } from "./StampCard";

function queryParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}
const STORE_KEY = "qrew.card";

export function App() {
  const [merchantId, setMerchantId] = useState(queryParam("m"));
  const [programId, setProgramId] = useState(queryParam("p"));
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  // The card identity is persisted (URL + localStorage) so a refresh / re-open lands here.
  const [serial, setSerial] = useState<string | null>(
    () => queryParam("card") || localStorage.getItem(STORE_KEY) || null,
  );
  const [card, setCard] = useState<CardView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(s: string) {
    try {
      setCard(await getCard(s));
    } catch {
      // stale/invalid serial — forget it and fall back to the join screen
      localStorage.removeItem(STORE_KEY);
      setSerial(null);
      setCard(null);
    }
  }

  // Load the card on mount, then poll so stamps added by staff appear live.
  useEffect(() => {
    if (!serial) return;
    refresh(serial);
    const timer = window.setInterval(() => refresh(serial), 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial]);

  async function run(fn: () => Promise<void>) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const onJoin = () =>
    run(async () => {
      const r = await enroll({ merchantId, programId, name: "Guest" });
      setEnrollmentId(r.enrollmentId);
      localStorage.setItem(STORE_KEY, r.serial);
      window.history.replaceState(null, "", `?card=${r.serial}`);
      setSerial(r.serial); // triggers the load + poll effect
    });

  const onStamp = () =>
    run(async () => {
      if (!enrollmentId || !serial) return;
      await simulateStamp(merchantId, enrollmentId);
      await refresh(serial);
    });

  const onRedeem = () =>
    run(async () => {
      if (!enrollmentId || !serial) return;
      await redeemReward(merchantId, enrollmentId);
      await refresh(serial);
    });

  function forget() {
    localStorage.removeItem(STORE_KEY);
    window.history.replaceState(null, "", window.location.pathname);
    setSerial(null);
    setCard(null);
    setEnrollmentId(null);
  }

  if (serial && card) {
    return (
      <StampCard
        card={card}
        busy={busy}
        err={err}
        onStamp={enrollmentId ? onStamp : undefined}
        onRedeem={enrollmentId ? onRedeem : undefined}
        onForget={forget}
      />
    );
  }

  if (serial && !card) {
    return (
      <div className="screen join">
        <div className="wordmark">
          <span className="q">Q</span>rew
        </div>
        <p className="sub">Loading your card…</p>
      </div>
    );
  }

  return (
    <div className="screen join">
      <div className="wordmark">
        <span className="q">Q</span>rew
      </div>
      <h1>Join the card</h1>
      <p className="sub">
        Paste the demo merchant &amp; program ids (from the seed command), or open this page
        with <code>?m=…&amp;p=…</code>.
      </p>
      <label>
        Merchant ID
        <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="merchant uuid" />
      </label>
      <label>
        Program ID
        <input value={programId} onChange={(e) => setProgramId(e.target.value)} placeholder="program uuid" />
      </label>
      <button className="primary" disabled={!merchantId || !programId || busy} onClick={onJoin}>
        {busy ? "Joining…" : "Join & get my card"}
      </button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
