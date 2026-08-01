import { useEffect, useRef, useState } from "react";
import { useApi } from "./useApi";
import type { ScanResult, RedeemResult } from "./api";
import { cn } from "@/lib/utils";

// The counter surface, inside the shop app. The device holds the owner/manager's Clerk session
// (→ the merchant); an optional cashier PIN attributes each scan to a specific staff member.
export function Scanner() {
  const api = useApi();
  const staffTokenRef = useRef<string | null>(null); // the camera callback reads the latest via the ref
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
    setRedeemed(null);
    try {
      setResult(await api.scan(s, staffTokenRef.current ?? undefined));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      window.setTimeout(() => (busyRef.current = false), 1200);
    }
  }

  async function doRedeem() {
    if (!result?.enrollmentId || redeeming) return;
    setRedeeming(true);
    setErr(null);
    try {
      const r = await api.redeem(result.enrollmentId, staffTokenRef.current ?? undefined);
      setRedeemed(r);
      setResult(null);
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
        if (cancelled) {
          // Unmounted during camera startup — start() only just acquired the stream, so the cleanup
          // below couldn't stop it (it wasn't "scanning" yet). Stop it here or the camera leaks (light stays on).
          await instance.stop().catch(() => {});
          instance.clear();
          return;
        }
        setCamState("on");
      } catch {
        if (!cancelled) setCamState("off");
      }
    })();
    return () => {
      cancelled = true;
      // html5-qrcode.stop() THROWS synchronously if it isn't scanning yet, so it can't be chained off
      // a promise — guard it. (The startup-window leak is handled by the cancelled check above.)
      const s = scanner;
      if (!s) return;
      try {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
      } catch {
        try {
          s.clear();
        } catch {
          /* not started — nothing to release */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3.5">
      <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-xl border p-2.5">
        {cashier ? (
          <>
            <span className="text-sm font-bold">👤 {cashier}</span>
            <button
              type="button"
              onClick={switchCashier}
              className="text-primary ml-auto text-[13px] font-bold hover:underline"
            >
              Switch cashier
            </button>
          </>
        ) : (
          <div className="flex w-full items-center gap-2">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="Cashier PIN (optional)"
              aria-label="Cashier PIN"
              className="placeholder:text-faint min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={setCashierPin}
              disabled={pin.length < 4}
              className="text-primary shrink-0 px-2 py-2 text-[13px] font-bold hover:underline disabled:opacity-40"
            >
              Set
            </button>
          </div>
        )}
        {pinErr && <span className="text-destructive w-full text-xs">{pinErr}</span>}
      </div>

      {/* #reader must stay mounted unconditionally — html5-qrcode attaches to it by element id. */}
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-linear-[160deg,#cbfa5b_0%,#86e056_34%,#38ad4c_68%,#146a2e_100%] p-1.5 shadow-[0_24px_48px_-28px_rgba(20,106,46,0.5)]">
        <div id="reader" />
        {camState !== "on" && (
          <div className="absolute inset-1.5 grid place-items-center rounded-[18px] bg-[repeating-linear-gradient(45deg,#10240f,#10240f_12px,#143016_12px,#143016_24px)] p-6 text-center text-[13px] leading-relaxed font-semibold text-[#e4fb98]">
            {camState === "idle"
              ? "Starting camera…"
              : "Camera unavailable — use manual entry below"}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Card serial <span className="text-faint font-medium">(or scan above)</span>
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="paste the card serial"
            className="border-border bg-card placeholder:text-faint focus-visible:ring-ring w-full rounded-xl border px-3.5 py-3 text-sm font-normal outline-none focus-visible:ring-2"
          />
        </label>
        <button
          type="button"
          onClick={() => doScan(serial)}
          disabled={!serial}
          className="bg-primary text-primary-foreground min-h-12 w-full rounded-xl text-sm font-bold transition hover:brightness-110 disabled:opacity-40"
        >
          + Stamp
        </button>
      </div>

      {result && <ResultBanner result={result} />}
      {result?.found && result.rewardReady && result.enrollmentId && (
        <button
          type="button"
          onClick={doRedeem}
          disabled={redeeming}
          className="bg-lime min-h-12 w-full rounded-xl text-sm font-extrabold text-[#0c2712] transition hover:brightness-105 disabled:opacity-50"
        >
          {redeeming ? "Redeeming…" : "🎁 Redeem reward"}
        </button>
      )}
      {redeemed?.redeemed && (
        <Banner tone="ok">
          ✓ Reward redeemed{redeemed.rewardText ? ` — ${redeemed.rewardText}` : ""}
        </Banner>
      )}
      {err && <p className="text-destructive text-sm">{err}</p>}
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn" | "bad" | "ready"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-xl px-3.5 py-3 text-center text-sm font-bold",
        tone === "ok" && "bg-success/13 text-success",
        tone === "warn" && "bg-warning/15 text-warning",
        tone === "bad" && "bg-destructive/13 text-destructive",
        tone === "ready" && "bg-lime/30 text-primary",
      )}
    >
      {children}
    </div>
  );
}

function ResultBanner({ result }: { result: ScanResult }) {
  if (!result.found) return <Banner tone="bad">✗ Card not found for this store</Banner>;
  if (result.reason === "cooldown") return <Banner tone="warn">⏳ Just stamped — wait a moment</Banner>;
  if (result.reason === "duplicate") return <Banner tone="warn">↺ Already counted</Banner>;
  // Nothing to collect on this kind of card — scanning it is how staff check it is genuine.
  if (result.reason === "no_accrual") return <Banner tone="ok">✓ Valid card — apply the offer</Banner>;
  if (result.reason === "reward_ready")
    return (
      <Banner tone="ready">
        🎉 Reward ready — redeem it below · {result.currentStamps}/{result.stampsRequired}
      </Banner>
    );
  return (
    <Banner tone={result.rewardReady ? "ready" : "ok"}>
      {result.rewardReady ? "🎉 Reward ready!" : "✓ Stamp added"} · {result.currentStamps}/
      {result.stampsRequired}
    </Banner>
  );
}
