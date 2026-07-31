import { useCallback, useEffect, useRef, useState } from "react";
import { SignIn, useAuth } from "@clerk/react";
import type { Analytics, AnalyticsRange, CustomerFilter } from "./api";
import { useApi, NeedsOnboarding, Forbidden } from "./useApi";
import { AppShell, Wordmark, type ManageView } from "@/components/AppShell";
import { Dashboard } from "@/screens/Dashboard";
import { Customers } from "@/screens/Customers";
import { Team } from "@/screens/Team";
import { CounterMode } from "@/screens/CounterMode";
import { CounterQR } from "./CounterQR";
import { Designer } from "./Designer";
import { Card } from "@/components/ui/card";
import { isCounterMode, setCounterModeFlag } from "@/lib/counter-mode";

/** The dashboard is a live view of the till, but each load is a handful of aggregates. */
const POLL_MS = 60_000;

export function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Wordmark />
        <h1 className="text-center text-2xl font-extrabold tracking-tight">Sign in to your shop</h1>
        <SignIn />
      </div>
    );
  }

  return <ShopApp />;
}

function ShopApp() {
  const api = useApi();
  const [view, setView] = useState<ManageView>("dashboard");
  const [counterMode, setCounterMode] = useState(isCounterMode);
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>("all");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  // The poll must not overlap a slow first login: a re-entrant call would fire POST /onboarding a
  // second time while the first is still provisioning.
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setErr(null);
    setLoading(true);
    try {
      setData(await api.getAnalytics(range));
    } catch (e) {
      if (e instanceof NeedsOnboarding) {
        // First login: no merchant yet — provision one, then retry.
        try {
          await api.onboard();
          setData(await api.getAnalytics(range));
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : String(e2));
        }
      } else if (e instanceof Forbidden) {
        setForbidden(true);
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [api, range]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const enterCounter = useCallback(() => {
    setCounterModeFlag(true);
    setCounterMode(true);
  }, []);

  const exitCounter = useCallback(() => {
    setCounterModeFlag(false);
    setCounterMode(false);
  }, []);

  const openCustomers = useCallback((filter: CustomerFilter) => {
    setCustomerFilter(filter);
    setView("customers");
  }, []);

  if (counterMode) {
    return <CounterMode shopName={data?.merchantName} onExit={exitCounter} />;
  }

  // A cashier who signs in on the office machine gets told why, not a broken dashboard.
  if (forbidden) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <Card className="max-w-sm items-center gap-2 p-8 text-center">
          <Wordmark />
          <h1 className="mt-2 text-lg font-bold">Counter access only</h1>
          <p className="text-muted-foreground text-sm">
            Your account can stamp cards but can't open the shop's dashboard or customer list. Ask
            the owner if you need access.
          </p>
          <button
            type="button"
            onClick={enterCounter}
            className="bg-primary text-primary-foreground mt-3 min-h-11 w-full rounded-xl text-sm font-bold"
          >
            Open counter mode
          </button>
        </Card>
      </div>
    );
  }

  return (
    <AppShell
      view={view}
      onNavigate={setView}
      onEnterCounter={enterCounter}
      shopName={data?.merchantName}
    >
      {err && (
        <Card className="border-destructive/40 mb-3 p-4">
          <p className="text-destructive text-sm">{err}</p>
        </Card>
      )}

      {/* Keyed on the view so each screen replays its entrance instead of swapping abruptly. */}
      <div key={view} className="rise">
        {view === "dashboard" && (
          <Dashboard
            data={data}
            range={range}
            onRangeChange={setRange}
            onRefresh={() => void load()}
            onViewCustomers={openCustomers}
            loading={loading}
          />
        )}
        {view === "customers" && <Customers key={customerFilter} initialFilter={customerFilter} />}
        {view === "team" && <Team />}
        {view === "designer" && <Designer merchantName={data?.merchantName} />}
        {view === "counterqr" &&
          (data ? (
            <CounterQR merchantId={data.merchantId} merchantName={data.merchantName} />
          ) : (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ))}
      </div>
    </AppShell>
  );
}
