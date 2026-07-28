import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, SignIn, UserButton } from "@clerk/react";
import { useApi, NeedsOnboarding } from "./useApi";
import type { Dashboard } from "./api";
import { Designer } from "./Designer";
import { Scanner } from "./Scanner";
import { CounterQR } from "./CounterQR";

type Tab = "overview" | "scan" | "counter" | "designer";

export function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="wrap gate">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!isSignedIn) {
    return (
      <div className="wrap gate">
        <div className="wordmark">
          <span className="q">Q</span>rew <span className="tag">Shop</span>
        </div>
        <h1>Sign in to your shop</h1>
        <SignIn />
      </div>
    );
  }
  return <DashboardApp />;
}

function DashboardApp() {
  const api = useApi();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    // The 10s poll must not overlap a slow first-login: a re-entrant call would fire POST /onboarding
    // a second time while the first is still provisioning.
    if (inFlight.current) return;
    inFlight.current = true;
    setErr(null);
    setLoading(true);
    try {
      setData(await api.getDashboard());
    } catch (e) {
      if (e instanceof NeedsOnboarding) {
        // First login: no merchant yet — provision one, then retry.
        try {
          await api.onboard();
          setData(await api.getDashboard());
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : String(e2));
        }
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [api]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wrap">
      <header className="head">
        <div>
          <div className="wordmark">
            <span className="q">Q</span>rew <span className="tag">Shop</span>
          </div>
          <div className="mname">{data?.merchantName ?? "…"}</div>
        </div>
        <div className="headright">
          {tab === "overview" && (
            <button className="refresh" onClick={load} disabled={loading}>
              {loading ? "…" : "↻ Refresh"}
            </button>
          )}
          <UserButton />
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={tab === "scan" ? "on" : ""} onClick={() => setTab("scan")}>
          Scan
        </button>
        <button className={tab === "counter" ? "on" : ""} onClick={() => setTab("counter")}>
          Counter QR
        </button>
        <button className={tab === "designer" ? "on" : ""} onClick={() => setTab("designer")}>
          Card designer
        </button>
      </nav>

      {tab === "scan" ? (
        <Scanner />
      ) : tab === "counter" ? (
        data ? (
          <CounterQR merchantId={data.merchantId} merchantName={data.merchantName} />
        ) : (
          <p className="muted">Loading…</p>
        )
      ) : tab === "designer" ? (
        <Designer merchantName={data?.merchantName} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div className={`stat${accent ? " accent" : ""}`}>
      <div className="v">{value ?? "—"}</div>
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
