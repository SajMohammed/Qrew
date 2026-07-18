import { useEffect, useRef, useState } from "react";
import { scan, type ScanResult } from "./api";

function queryParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function App() {
  const [merchantId, setMerchantId] = useState(queryParam("m"));
  const [pin, setPin] = useState("");
  const [stage, setStage] = useState<"login" | "scan">("login");
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [camState, setCamState] = useState<"idle" | "on" | "off">("idle");
  const busyRef = useRef(false);

  async function doScan(value: string) {
    const s = value.trim();
    if (!s || busyRef.current) return;
    busyRef.current = true;
    setErr(null);
    try {
      setResult(await scan(merchantId, s));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      // brief debounce so a QR held in front of the camera doesn't spam stamps
      window.setTimeout(() => (busyRef.current = false), 1200);
    }
  }

  // Camera scanner (real devices). Falls back to manual entry if unavailable.
  useEffect(() => {
    if (stage !== "scan") return;
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
  }, [stage]);

  if (stage === "login") {
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
        <label>
          Merchant ID
          <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="merchant uuid" />
        </label>
        <label>
          PIN
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="4-digit PIN"
          />
        </label>
        <button className="primary" disabled={!merchantId || pin.length < 4} onClick={() => setStage("scan")}>
          Start scanning
        </button>
        <p className="note">Demo PIN: any 4 digits. Real staff auth (Clerk) comes later.</p>
      </div>
    );
  }

  return (
    <div className="screen scan">
      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          Qrew <span className="tag">Staff</span>
        </div>
        <button className="link" onClick={() => setStage("login")}>
          Sign out
        </button>
      </div>

      <h2>Scan a customer's card</h2>
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
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function ResultBanner({ result }: { result: ScanResult }) {
  if (!result.found) return <div className="banner bad">✗ Card not found for this store</div>;
  if (result.reason === "cooldown") return <div className="banner warn">⏳ Just stamped — wait a moment</div>;
  if (result.reason === "duplicate") return <div className="banner warn">↺ Already counted</div>;
  return (
    <div className={`banner ${result.rewardReady ? "ready" : "ok"}`}>
      {result.rewardReady ? "🎉 Reward ready!" : "✓ Stamp added"} · {result.currentStamps}/{result.stampsRequired}
    </div>
  );
}
