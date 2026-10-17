import { useCallback, useEffect, useRef, useState } from "react";
import { SignIn, useAuth } from "@clerk/react";
import type { Analytics, AnalyticsRange, CustomerFilter, Program } from "./api";
import { useApi, NeedsOnboarding, Forbidden } from "./useApi";
import { AppShell, Wordmark, type ManageView } from "@/components/AppShell";
import { Dashboard } from "@/screens/Dashboard";
import { Customers } from "@/screens/Customers";
import { Team } from "@/screens/Team";
import { CounterMode } from "@/screens/CounterMode";
import { CounterQR } from "./CounterQR";
import { CardScreen } from "@/screens/Card";
import { CreateShop } from "@/screens/CreateShop";
import { Settings } from "@/screens/Settings";
import { Card } from "@/components/ui/card";
import { runningCards } from "@/components/CardSwitcher";
import { isCounterMode, setCounterModeFlag } from "@/lib/counter-mode";
// Softform's liquid glass script, copied verbatim beside its CSS: re-copy to update, never edit.
import { liquidGlass } from "./styles/liquid-glass.js";

/** The dashboard is a live view of the till, but each load is a handful of aggregates. */
const POLL_MS = 60_000;

export function App() {
  const { isLoaded, isSignedIn } = useAuth();
  // Liquid glass's pointer light and (in Chromium) lens, for every `.sf-liquid` on every screen.
  useEffect(() => liquidGlass(), []);

  if (!isLoaded) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <p className="text-ink-3 text-sm">Loading…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Wordmark />
        <h1 className="sf-title sf-twotone text-center">
          <span className="sf-lead">Sign in to</span> <strong>your shop</strong>
        </h1>
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
  // Which card the overview and the customer list are about; null is the whole shop. Only offered
  // when the shop runs two or more cards.
  const [overviewCard, setOverviewCard] = useState<string | null>(null);
  const [customerCard, setCustomerCard] = useState<string | null>(null);
  // Every card the shop has, on or frozen. Screens show the ones that are on.
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [programsFailed, setProgramsFailed] = useState(false);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  // Signed in, but no shop yet: the owner names it before anything is created.
  const [needsShop, setNeedsShop] = useState(false);

  // Polls must not overlap a slow load and stack up requests.
  const inFlight = useRef(false);
  // A rename made while a poll was out: that poll's answer still carries the old name.
  const renamed = useRef<{ name: string; at: number } | null>(null);

  const cards = runningCards(programs);
  // A card filter only means something while there is a choice, and while that card is still on.
  const card = (id: string | null) => (cards.length >= 2 && cards.some((c) => c.id === id) ? id : null);
  const overviewProgram = card(overviewCard);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setErr(null);
    setLoading(true);
    try {
      const askedAt = Date.now();
      const fresh = await api.getAnalytics(range, overviewProgram ?? undefined);
      const r = renamed.current;
      setData(r && r.at >= askedAt ? { ...fresh, merchantName: r.name } : fresh);
    } catch (e) {
      if (e instanceof NeedsOnboarding) {
        // First sign-in: there is no shop yet. Ask for its name; nothing is provisioned until then.
        setNeedsShop(true);
      } else if (e instanceof Forbidden) {
        setForbidden(true);
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [api, range, overviewProgram]);

  const loadPrograms = useCallback(async () => {
    setProgramsFailed(false);
    try {
      setPrograms(await api.listPrograms());
    } catch (e) {
      // No shop yet is the analytics load's to handle; anything else, the card screens offer a retry.
      if (!(e instanceof NeedsOnboarding)) setProgramsFailed(true);
    }
  }, [api]);

  useEffect(() => {
    if (!needsShop) void loadPrograms();
  }, [loadPrograms, needsShop]);

  useEffect(() => {
    // Nothing is worth polling until the shop exists — and a poll landing while the owner is naming
    // it would only answer "no shop" again. Creating the shop flips this and loads straight away.
    if (needsShop) return;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, needsShop]);

  const createShop = useCallback(
    async (name: string) => {
      await api.onboard(name);
      setNeedsShop(false);
    },
    [api],
  );

  const enterCounter = useCallback(() => {
    setCounterModeFlag(true);
    setCounterMode(true);
  }, []);

  const exitCounter = useCallback(() => {
    setCounterModeFlag(false);
    setCounterMode(false);
  }, []);

  // From the overview's "See who": the same segment, and the same card the overview is showing.
  const openCustomers = useCallback(
    (filter: CustomerFilter) => {
      setCustomerFilter(filter);
      setCustomerCard(overviewProgram);
      setView("customers");
    },
    [overviewProgram],
  );

  // A saved card replaces its entry, so a renamed card is renamed in every switcher.
  const cardSaved = useCallback((saved: Program) => {
    setPrograms((list) => list && list.map((p) => (p.id === saved.id ? saved : p)));
  }, []);

  // Before counter mode: a device left in counter mode with no shop behind it would land in a scanner
  // that can't work, with no way to create the shop.
  if (needsShop) return <CreateShop onCreate={createShop} />;

  if (counterMode) {
    return <CounterMode shopName={data?.merchantName} onExit={exitCounter} />;
  }

  // A cashier who signs in on the office machine gets told why, not a broken dashboard.
  if (forbidden) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <Card className="max-w-sm items-center gap-3 p-8 text-center">
          <Wordmark />
          <h1 className="sf-title sf-twotone mt-2">
            <span className="sf-lead">Counter access</span> <strong>only</strong>
          </h1>
          <p className="text-ink-2 m-0 text-sm">
            Your account can stamp cards but can't open the shop's dashboard or customer list. Ask
            the owner if you need access.
          </p>
          <button type="button" onClick={enterCounter} className="sf-btn sf-btn--primary sf-btn--block mt-2">
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
        <div className="sf-card sf-card--compact bg-danger-soft mb-4 shadow-none">
          <p className="text-danger-ink m-0 text-sm">{err}</p>
        </div>
      )}

      {/* Keyed on the view so each screen replays its entrance instead of swapping abruptly. */}
      <div key={view} className="rise">
        {view === "dashboard" && (
          <Dashboard
            data={data}
            range={range}
            onRangeChange={setRange}
            cards={cards}
            card={overviewProgram}
            onCardChange={setOverviewCard}
            onRefresh={() => void load()}
            onViewCustomers={openCustomers}
            loading={loading}
          />
        )}
        {view === "customers" && (
          <Customers
            key={`${customerFilter}:${customerCard}`}
            initialFilter={customerFilter}
            cards={cards}
            initialCard={card(customerCard)}
          />
        )}
        {view === "team" && <Team />}
        {view === "card" && (
          <CardScreen
            merchantName={data?.merchantName}
            cards={programs && cards}
            failed={programsFailed}
            onRetry={() => void loadPrograms()}
            onSaved={cardSaved}
          />
        )}
        {view === "settings" && (
          <Settings
            programs={programs}
            onCardsChanged={setPrograms}
            merchantName={data?.merchantName}
            // Update everything that shows the name now, rather than at the next poll.
            onRenamed={(name) => {
              renamed.current = { name, at: Date.now() };
              setData((d) => (d ? { ...d, merchantName: name } : d));
            }}
          />
        )}
        {view === "counterqr" &&
          (data ? (
            <CounterQR
              merchantId={data.merchantId}
              merchantName={data.merchantName}
              cards={programs && cards}
              failed={programsFailed}
              onRetry={() => void loadPrograms()}
            />
          ) : (
            <p className="text-ink-3 text-sm">Loading…</p>
          ))}
      </div>
    </AppShell>
  );
}
