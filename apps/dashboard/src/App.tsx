import { useEffect, useState } from "react";
import { getDashboard, type Dashboard } from "./api";

function queryParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function App() {
  const [merchantId, setMerchantId] = useState(queryParam("m"));
  const [entered, setEntered] = useState(Boolean(queryParam("m")));
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      setData(await getDashboard(merchantId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!entered || !merchantId) return;
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, merchantId]);

  if (!entered) {
    return (
      <div className="wrap gate">
        <div className="wordmark">
          <span className="q">Q</span>rew <span className="tag">Dashboard</span>
        </div>
        <h1>Open your dashboard</h1>
        <label>
          Merchant ID
          <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="merchant uuid" />
        </label>
        <button className="primary" disabled={!merchantId} onClick={() => setEntered(true)}>
          Open
        </button>
        {err && <p className="err">{err}</p>}
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="head">
        <div>
          <div className="wordmark">
            <span className="q">Q</span>rew <span className="tag">Dashboard</span>
          </div>
          <div className="mname">{data?.merchantName ?? "…"}</div>
        </div>
        <button className="refresh" onClick={load} disabled={loading}>
          {loading ? "…" : "↻ Refresh"}
        </button>
      </header>

      {err && <p className="err">{err}</p>}

      <section className="stats">
        <Stat label="Enrollments" value={data?.stats.enrollments} />
        <Stat label="Active cards" value={data?.stats.activeCards} />
        <Stat label="Reward-ready" value={data?.stats.rewardReady} accent />
        <Stat label="Stamps issued" value={data?.stats.stampsIssued} />
        <Stat label="Rewards redeemed" value={data?.stats.rewardsRedeemed} />
        <Stat label="Avg stamps / card" value={avgStampsPerCard(data)} />
      </section>

      <section className="recent">
        <h2>Recent enrollments</h2>
        <div className="list">
          {(data?.recent ?? []).map((r) => {
            const pct = Math.min(100, Math.round((r.currentStamps / r.stampsRequired) * 100));
            return (
              <div className="row" key={r.id}>
                <div className="who">
                  <div className="name">{r.customerName || "Guest"}</div>
                  <div className="sub">
                    {r.customerPhone || "—"} · {r.programName}
                  </div>
                </div>
                <div className="prog">
                  <div className="bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="pnum">
                    {r.currentStamps}/{r.stampsRequired}
                  </div>
                </div>
                <div className="when">{rel(r.createdAt)}</div>
              </div>
            );
          })}
          {data && data.recent.length === 0 && <div className="empty">No enrollments yet.</div>}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value?: number;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className={`stat${accent ? " accent" : ""}`}>
      <div className="v">
        {value ?? "—"}
        {value != null && suffix ? suffix : ""}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}

// A clean engagement proxy. (A true redemption rate — redeemed / rewards-earned — is a
// Phase-3 analytics refinement once we track earned rewards.)
function avgStampsPerCard(d: Dashboard | null): number | undefined {
  if (!d || d.stats.enrollments === 0) return undefined;
  return Math.round((d.stats.stampsIssued / d.stats.enrollments) * 10) / 10;
}

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
