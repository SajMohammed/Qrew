import { useCallback, useEffect, useRef, useState } from "react";
import { SwitchCamera } from "lucide-react";
import { useApi, PinLocked, CounterError } from "./useApi";
import type { ScanResult, RedeemResult } from "./api";
import { cn } from "@/lib/utils";
import { PresentationTracker, newKey } from "@/lib/presentation";
import {
  CAMERA_COPY,
  RETRYABLE,
  cameraProblem,
  loadFacing,
  saveFacing,
  type CameraProblem,
  type Facing,
} from "@/lib/camera";
import { signal, type Feedback } from "@/lib/feedback";
import { useOnline } from "@/lib/device";

/** A result's buttons act on the card it names. Left up longer, they'd act on it for the next customer. */
const RESULT_TTL_MS = 60_000;
/** After an extra stamp lands, its button rests this long — so a double tap can't add two. */
const EXTRA_REST_MS = 1_200;
/** End a cashier's sign-in this long before their token does, so no scan is ever refused over it. */
const CASHIER_MARGIN_MS = 60_000;

/*
 * The camera's release, shared by every Scanner: a new one (a quick unmount and remount, or a switch
 * of camera) waits for the last to finish letting go. Clearing the old view clears #reader by id, so
 * a new view started before that would be wiped blank.
 */
let cameraReleased: Promise<void> = Promise.resolve();

interface Cashier {
  name: string;
  token: string;
  /** When this device stops using the token (local clock, counted from when it was issued). */
  endsAt: number;
}

// The counter surface, inside the shop app. The device holds the owner/manager's Clerk session
// (→ the merchant); an optional cashier PIN attributes each scan to a specific staff member.
export function Scanner() {
  const api = useApi();
  const online = useOnline();

  // The camera callback outlives renders, so everything it reads lives in refs.
  const [cashier, setCashierState] = useState<Cashier | null>(null);
  const cashierRef = useRef<Cashier | null>(null);
  const [cashierNotice, setCashierNotice] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  // Enter and "Set" both submit; a double submit would spend two of the shop's few wrong-PIN tries.
  const pinBusyRef = useRef(false);

  const trackerRef = useRef(new PresentationTracker());
  const inFlightRef = useRef(false);
  // One key per displayed result for each of its buttons — a retry after no answer reuses it.
  const keysRef = useRef({ extra: newKey("extra"), redeem: newKey("redeem") });
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  // A card is being looked up — shown, so a press meanwhile isn't silently ignored.
  const [sending, setSending] = useState(false);
  const [redeemed, setRedeemed] = useState<RedeemResult | null>(null);
  const [busy, setBusy] = useState<"extra" | "redeem" | null>(null);
  const [extraResting, setExtraResting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const [camera, setCamera] = useState<"starting" | "on" | CameraProblem>("starting");
  const [facing, setFacing] = useState<Facing>(loadFacing);
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" to restart the camera
  const onFrameRef = useRef<(text: string) => void>(() => {});

  function setCashier(next: Cashier | null) {
    cashierRef.current = next;
    setCashierState(next);
  }

  async function signInCashier() {
    if (pinBusyRef.current) return;
    pinBusyRef.current = true;
    setPinErr(null);
    setCashierNotice(null);
    try {
      const c = await api.verifyPin(pin);
      setCashier({ name: c.name, token: c.staffToken, endsAt: Date.now() + c.expiresInSeconds * 1000 - CASHIER_MARGIN_MS });
      setPin("");
    } catch (e) {
      const said = e instanceof PinLocked || (e instanceof CounterError && e.kind === "offline");
      setPinErr(said ? (e as Error).message : "PIN not recognized");
    } finally {
      pinBusyRef.current = false;
    }
  }

  /**
   * The cashier's sign-in has run out. Scans carry on, credited to nobody, until a PIN is entered.
   * Given a token, only if that token is still the current cashier's — someone who signed in while
   * a request with the old one was out keeps their sign-in.
   */
  const expireCashier = useCallback((token?: string) => {
    const was = cashierRef.current;
    if (!was || (token !== undefined && was.token !== token)) return;
    setCashier(null);
    setCashierNotice(
      `${was.name}'s cashier sign-in has ended. Scans still work — enter a PIN to credit them to a cashier.`,
    );
  }, []);

  // End it on time, rather than at whichever scan comes after.
  useEffect(() => {
    if (!cashier) return;
    const t = window.setTimeout(() => expireCashier(), Math.max(0, cashier.endsAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [cashier, expireCashier]);

  /**
   * Run a counter request as the current cashier. If the server says their token no longer counts
   * (expired, PIN changed, removed from the team), drop them and send the same request — same key —
   * once more without it: the customer still gets their stamp, just not credited to anyone.
   */
  async function asCashier<T>(fn: (staffToken?: string) => Promise<T>): Promise<T> {
    if (cashierRef.current && Date.now() >= cashierRef.current.endsAt) expireCashier();
    const token = cashierRef.current?.token;
    try {
      return await fn(token);
    } catch (e) {
      if (!(token && e instanceof CounterError && e.kind === "cashier_expired")) throw e;
      expireCashier(token);
      return fn(undefined);
    }
  }

  /** Show a failed request. Returns whether the same request is worth sending again. */
  function fail(e: unknown): boolean {
    signal("error");
    if (e instanceof CounterError && e.kind === "signed_out") {
      // Usually the device really was signed out — but a 401 can also be a passing failure to check
      // the sign-in, so the card in view is retried, and the banner goes at the next success.
      setSignedOut(true);
      return true;
    }
    setErr(e instanceof Error ? e.message : String(e));
    return e instanceof CounterError && (e.kind === "offline" || e.kind === "server");
  }

  function show(r: ScanResult) {
    setSignedOut(false);
    keysRef.current = { extra: newKey("extra"), redeem: newKey("redeem") };
    setResult(r);
    signal(feedbackFor(r));
  }

  // A result's buttons act on the card it names; left up, they would act on it for the next customer.
  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => setResult(null), RESULT_TTL_MS);
    return () => window.clearTimeout(t);
  }, [result]);

  async function send(value: string, key: string, via: "camera" | "typed") {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSending(true);
    setErr(null);
    setRedeemed(null);
    setResult(null); // the last card's buttons go the moment another card is being looked up
    try {
      const r = await asCashier((t) => api.scan(value, key, t));
      show(r);
      if (via === "typed" && r.found) setCode("");
    } catch (e) {
      if (fail(e) && via === "camera") trackerRef.current.failed(Date.now());
    } finally {
      inFlightRef.current = false;
      setSending(false);
    }
  }

  // Each decoded frame. The tracker decides whether it is a new presentation of a card (send), a
  // retry of one that got no answer (send, same key), or the same card still in view (nothing).
  useEffect(() => {
    onFrameRef.current = (text) => {
      const p = trackerRef.current.frame(text.trim(), Date.now(), inFlightRef.current);
      if (p) void send(p.value, p.key, "camera");
    };
  });

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    // Each press is its own request; typing the same code again within a minute meets the cooldown.
    if (value) void send(value, newKey("scan"), "typed");
  }

  /** A second purchase on the same visit: a deliberate stamp, which the cooldown doesn't apply to. */
  async function stampAgain() {
    const card = result;
    if (!card?.enrollmentId || inFlightRef.current || extraResting) return;
    inFlightRef.current = true;
    setBusy("extra");
    setErr(null);
    try {
      const outcome = await asCashier((t) => api.stampAgain(card.enrollmentId!, keysRef.current.extra, t));
      setSignedOut(false);
      // The key is spent once a stamp has landed under it ("duplicate": an earlier press that got no
      // answer did land). Until then it is kept, so pressing again after a failure can't add two.
      if (outcome.reason === "applied" || outcome.reason === "duplicate") keysRef.current.extra = newKey("extra");
      setResult((prev) => (prev && prev.enrollmentId === card.enrollmentId ? { ...prev, ...outcome } : prev));
      signal(feedbackFor({ found: true, ...outcome }));
      setExtraResting(true);
      window.setTimeout(() => setExtraResting(false), EXTRA_REST_MS);
    } catch (e) {
      fail(e);
    } finally {
      inFlightRef.current = false;
      setBusy(null);
    }
  }

  async function doRedeem() {
    const card = result;
    if (!card?.enrollmentId || inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy("redeem");
    setErr(null);
    try {
      const r = await asCashier((t) => api.redeem(card.enrollmentId!, keysRef.current.redeem, t));
      setSignedOut(false);
      setResult(null);
      if (r.redeemed) {
        setRedeemed(r);
        signal("success");
      } else {
        setErr("✗ Not enough stamps to redeem yet.");
        signal("error");
      }
    } catch (e) {
      fail(e);
    } finally {
      inFlightRef.current = false;
      setBusy(null);
    }
  }

  function switchCamera() {
    const next: Facing = facing === "environment" ? "user" : "environment";
    saveFacing(next);
    setFacing(next);
  }

  // Camera scanner (real devices). Falls back to the typed code if unavailable.
  useEffect(() => {
    let cancelled = false;
    let started: { stop: () => Promise<void>; clear: () => void } | undefined;
    const previous = cameraReleased;
    setCamera("starting");
    const run = (async () => {
      await previous; // a switch must release the old camera before asking for the new one
      if (cancelled) return;
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const instance = new Html5Qrcode("reader");
        await instance.start(
          { facingMode: facing },
          { fps: 10, qrbox: 220 },
          (text: string) => onFrameRef.current(text),
          () => {},
        );
        started = instance;
        if (!cancelled) setCamera("on");
      } catch (e) {
        if (!cancelled) setCamera(cameraProblem(e));
      }
    })();
    return () => {
      cancelled = true;
      // Release the camera once its start has settled. html5-qrcode's stop() throws if it isn't
      // scanning yet, so stopping mid-start would leave the stream (and the camera light) on.
      cameraReleased = run.then(async () => {
        if (!started) return;
        try {
          await started.stop();
          started.clear();
        } catch {
          /* already released */
        }
      });
    };
  }, [facing, attempt]);

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3.5">
      {!online && <Banner tone="warn">No internet connection — scans won't go through until it's back.</Banner>}
      {signedOut && (
        <Banner tone="bad">
          This device has been signed out. Ask the owner to sign in again.{" "}
          <button type="button" onClick={() => window.location.reload()} className="underline">
            Reload
          </button>
        </Banner>
      )}

      <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-xl border p-2.5">
        {cashier ? (
          <>
            <span className="text-sm font-bold">👤 {cashier.name}</span>
            <button
              type="button"
              onClick={() => setCashier(null)}
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
              onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && void signInCashier()}
              inputMode="numeric"
              placeholder="Cashier PIN (optional)"
              aria-label="Cashier PIN"
              className="placeholder:text-faint min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void signInCashier()}
              disabled={pin.length < 4}
              className="text-primary shrink-0 px-2 py-2 text-[13px] font-bold hover:underline disabled:opacity-40"
            >
              Set
            </button>
          </div>
        )}
        {pinErr && <span className="text-destructive w-full text-xs">{pinErr}</span>}
        {cashierNotice && !cashier && <span className="text-warning w-full text-xs font-semibold">{cashierNotice}</span>}
      </div>

      {/* #reader must stay mounted unconditionally — html5-qrcode attaches to it by element id. */}
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-linear-[160deg,#cbfa5b_0%,#86e056_34%,#38ad4c_68%,#146a2e_100%] p-1.5 shadow-[0_24px_48px_-28px_rgba(20,106,46,0.5)]">
        <div id="reader" />
        {camera !== "on" && (
          <div className="absolute inset-1.5 flex flex-col items-center justify-center gap-3 rounded-[18px] bg-[repeating-linear-gradient(45deg,#10240f,#10240f_12px,#143016_12px,#143016_24px)] p-6 text-center text-[13px] leading-relaxed font-semibold text-[#e4fb98]">
            {/* While starting, the browser may be asking for permission — say so, or staff wait on it. */}
            <p>{camera === "starting" ? "Starting camera… allow it if the browser asks." : CAMERA_COPY[camera]}</p>
            {camera !== "starting" && RETRYABLE.has(camera) && (
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="min-h-10 rounded-xl bg-[#e4fb98] px-4 text-[13px] font-bold text-[#10240f]"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {camera !== "starting" && camera !== "unsupported" && (
          <button
            type="button"
            onClick={switchCamera}
            aria-label="Switch camera"
            title="Switch camera"
            className="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur"
          >
            <SwitchCamera className="size-5" aria-hidden />
          </button>
        )}
      </div>

      <form onSubmit={submitCode} className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          <span>
            Card code <span className="text-faint font-medium">(under the customer's QR)</span>
          </span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. K7M 4QX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="border-border bg-card placeholder:text-faint focus-visible:ring-ring w-full rounded-xl border px-3.5 py-3 font-mono text-sm font-normal tracking-wider outline-none focus-visible:ring-2"
          />
        </label>
        <button
          type="submit"
          disabled={!code.trim() || sending || busy !== null}
          className="bg-primary text-primary-foreground min-h-12 w-full rounded-xl text-sm font-bold transition hover:brightness-110 disabled:opacity-40"
        >
          {sending ? "Checking card…" : "+ Stamp"}
        </button>
      </form>

      {result && <ResultBanner result={result} />}
      {result?.found && result.enrollmentId && !result.rewardReady && result.reason !== "no_accrual" && (
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => void stampAgain()}
            disabled={busy !== null || extraResting}
            className="border-primary text-primary min-h-11 w-full rounded-xl border-2 text-sm font-bold transition hover:bg-primary/5 disabled:opacity-50"
          >
            {busy === "extra" ? "Adding…" : "+ Add another stamp"}
          </button>
          <span className="text-faint text-xs">For a second purchase on this visit</span>
        </div>
      )}
      {result?.found && result.rewardReady && result.enrollmentId && (
        <button
          type="button"
          onClick={() => void doRedeem()}
          disabled={busy !== null}
          className="bg-lime min-h-12 w-full rounded-xl text-sm font-extrabold text-[#0c2712] transition hover:brightness-105 disabled:opacity-50"
        >
          {busy === "redeem" ? "Redeeming…" : "🎁 Redeem reward"}
        </button>
      )}
      {redeemed?.redeemed && (
        <Banner tone="ok">
          ✓ Reward redeemed{redeemed.rewardText ? ` — ${redeemed.rewardText}` : ""}
        </Banner>
      )}
      {err && (
        <p role="alert" className="text-destructive text-sm">
          {err}
        </p>
      )}
    </div>
  );
}

/** What a scan sounds like: a stamp (or a valid card), a repeat that added nothing, or a miss. */
function feedbackFor(r: ScanResult): Feedback {
  if (!r.found) return "error";
  if (r.reason === "cooldown" || r.reason === "reward_ready") return "repeat";
  return "success";
}

function Banner({
  tone,
  card,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "ready";
  /** The card this result is about, so staff can see which card the buttons below will act on. */
  card?: string;
  children: React.ReactNode;
}) {
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
      <div>{children}</div>
      {card && <div className="mt-0.5 font-mono text-[11px] font-semibold tracking-wider opacity-75">Card {card}</div>}
    </div>
  );
}

function ResultBanner({ result }: { result: ScanResult }) {
  if (!result.found) return <Banner tone="bad">✗ Card not found for this store</Banner>;
  const card = result.shortCode;
  if (result.reason === "cooldown")
    return (
      <Banner tone="warn" card={card}>
        ⏳ Already stamped just now · {result.currentStamps}/{result.stampsRequired}
      </Banner>
    );
  // Nothing to collect on this kind of card — scanning it is how staff check it is genuine.
  if (result.reason === "no_accrual")
    return (
      <Banner tone="ok" card={card}>
        ✓ Valid card — apply the offer
      </Banner>
    );
  if (result.reason === "reward_ready")
    return (
      <Banner tone="ready" card={card}>
        🎉 Reward ready — redeem it below · {result.currentStamps}/{result.stampsRequired}
      </Banner>
    );
  // "applied", or "duplicate": a retry of a request whose stamp had already landed — added either way.
  return (
    <Banner tone={result.rewardReady ? "ready" : "ok"} card={card}>
      {result.rewardReady ? "🎉 Reward ready!" : "✓ Stamp added"} · {result.currentStamps}/
      {result.stampsRequired}
    </Banner>
  );
}
