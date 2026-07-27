import { useEffect, useRef, useState } from "react";
import { useAuth, SignIn, UserButton } from "@clerk/react";
import { useApi } from "./useApi";
import type { ScanResult, RedeemResult } from "./api";

export function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="screen login">
        <p className="sub">Loading…</p>
      </div>
    );
  }
  if (!isSignedIn) {
    return (
      <div className="screen login">
        <div className="login-hero">
          <div className="brand">
            <span className="dot" />
            Qrew <span className="tag">Staff</span>
          </div>
          <h1>Staff scanner</h1>
          <p className="sub">Sign in to start stamping cards at the counter.</p>
        </div>
        <SignIn />
      </div>
    );
  }
  return <Scanner />;
}

function Scanner() {
  const api = useApi();
  const staffTokenRef = useRef<string | null>(null); // camera callback reads the latest via the ref
  const [cashier, setCashier] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [redeemed, setRedeemed] = useState<RedeemResult | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [camState, setCamState] = useState<"idle" | "on" | "off">("idle");
  const busyRef = useRef(false);

  async function setCashierPin() {
    setPinErr(null);
    try {
      const c = await api.verifyPin(pin);
      staffTokenRef.current = c.staffToken;
      setCashier(c.name);
      setPin("");
    } catch {
      setPinErr("PIN not recognized");
    }
  }

  function switchCashier() {
    staffTokenRef.current = null;
    setCashier(null);
  }

  async function doScan(value: string) {
    const s = value.trim();
    if (!s || busyRef.current) return;
    busyRef.current = true;
    setErr(null);
    setRedeemed(null); // a fresh scan clears any prior redemption confirmation
    try {
      setResult(await api.scan(s, staffTokenRef.current ?? undefined));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      // brief debounce so a QR held in front of the camera doesn't spam stamps
      window.setTimeout(() => (busyRef.current = false), 1200);
    }
  }

  // Redeem the just-scanned reward-ready card (staff action; attributed to the cashier if a PIN is set).
  async function doRedeem() {
    if (!result?.enrollmentId || redeeming) return;
    setRedeeming(true);
    setErr(null);
    try {
      const r = await api.redeem(result.enrollmentId, staffTokenRef.current ?? undefined);
      setRedeemed(r);
      setResult(null); // swap the "reward ready" banner for the redeemed confirmation
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRedeeming(false);
    }
  }

  // Camera scanner (real devices). Falls back to manual entry if unavailable.
  useEffect(() => {
    let scanner: { stop: () => Promise<void>; clear: () => void } | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const instance = new Html5Qrcode("reader");
        scanner = instance;
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 220 },
          (text: string) => void doScan(text),
          () => {},
        );
        if (!cancelled) setCamState("on");
      } catch {
        if (!cancelled) setCamState("off");
      }
    })();
    return () => {
      cancelled = true;
      scanner?.stop().then(() => scanner?.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen scan">
      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          Qrew <span className="tag">Staff</span>
        </div>
        <UserButton />
      </div>

      <h2>Scan a customer's card</h2>

      <div className="cashier">
        {cashier ? (
          <>
            <span className="cashier-name">👤 {cashier}</span>
            <button className="link" onClick={switchCashier}>
              Switch cashier
            </button>
          </>
        ) : (
          <div className="pinrow">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="Cashier PIN (optional)"
            />
            <button className="link" onClick={setCashierPin} disabled={pin.length < 4}>
              Set
            </button>
          </div>
        )}
        {pinErr && <span className="err">{pinErr}</span>}
      </div>

      <div className="reader-wrap">
        <div id="reader" />
        {camState !== "on" && (
          <div className="cam-off">
            {camState === "idle" ? "Starting camera…" : "Camera unavailable — use manual entry below"}
          </div>
        )}
      </div>

      <div className="manual">
        <label>
          Card serial <span>(or scan above)</span>
          <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="paste the card serial" />
        </label>
        <button className="primary" onClick={() => doScan(serial)} disabled={!serial}>
          + Stamp
        </button>
      </div>

      {result && <ResultBanner result={result} />}
      {result?.found && result.rewardReady && result.enrollmentId && (
        <button className="redeem" onClick={doRedeem} disabled={redeeming}>
          {redeeming ? "Redeeming…" : "🎁 Redeem reward"}
        </button>
      )}
      {redeemed?.redeemed && (
        <div className="banner ok">✓ Reward redeemed{redeemed.rewardText ? ` — ${redeemed.rewardText}` : ""}</div>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function ResultBanner({ result }: { result: ScanResult }) {
  if (!result.found) return <div className="banner bad">✗ Card not found for this store</div>;
  if (result.reason === "cooldown") return <div className="banner warn">⏳ Just stamped — wait a moment</div>;
  if (result.reason === "duplicate") return <div className="banner warn">↺ Already counted</div>;
  if (result.reason === "reward_ready")
    return (
      <div className="banner ready">
        🎉 Reward ready — redeem it first · {result.currentStamps}/{result.stampsRequired}
      </div>
    );
  return (
    <div className={`banner ${result.rewardReady ? "ready" : "ok"}`}>
      {result.rewardReady ? "🎉 Reward ready!" : "✓ Stamp added"} · {result.currentStamps}/{result.stampsRequired}
    </div>
  );
}
