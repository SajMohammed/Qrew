import { useState } from "react";
import { enroll, getCard, simulateStamp, redeemReward, type CardView } from "./api";
import { StampCard } from "./StampCard";

function queryParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function App() {
  const [merchantId, setMerchantId] = useState(queryParam("m"));
  const [programId, setProgramId] = useState(queryParam("p"));
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [card, setCard] = useState<CardView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(serial: string) {
    setCard(await getCard(serial));
  }

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
      await refresh(r.serial);
    });

  const onStamp = () =>
    run(async () => {
      if (!card || !enrollmentId) return;
      await simulateStamp(merchantId, enrollmentId);
      await refresh(card.serial);
    });

  const onRedeem = () =>
    run(async () => {
      if (!card || !enrollmentId) return;
      await redeemReward(merchantId, enrollmentId);
      await refresh(card.serial);
    });

  if (card) {
    return (
      <StampCard card={card} busy={busy} err={err} onStamp={onStamp} onRedeem={onRedeem} />
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
        <input
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          placeholder="merchant uuid"
        />
      </label>
      <label>
        Program ID
        <input
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          placeholder="program uuid"
        />
      </label>
      <button className="primary" disabled={!merchantId || !programId || busy} onClick={onJoin}>
        {busy ? "Joining…" : "Join & get my card"}
      </button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
