import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Gift, SwitchCamera, UserRound } from "lucide-react";
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

  // The frame glows for a moment when a stamp lands or a reward is redeemed — the counter's success moment —
  // and the same news drops over the camera as a liquid glass notification, then slips away.
  const [glow, setGlow] = useState(false);
  const [moment, setMoment] = useState<(Moment & { id: number }) | null>(null);
  useEffect(() => {
    const landed =
      (result?.found && (result.reason === "applied" || result.reason === "duplicate" || result.reason === "no_accrual")) ||
      redeemed?.redeemed;
    if (!landed) return;
    const next = momentOf(result, redeemed);
    if (next) setMoment((m) => ({ ...next, id: (m?.id ?? 0) + 1 }));
    setGlow(true);
    const t = window.setTimeout(() => setGlow(false), 1600);
    return () => window.clearTimeout(t);
  }, [result, redeemed]);

  useEffect(() => {
    if (!moment) return;
    const t = window.setTimeout(() => setMoment(null), MOMENT_MS);
    return () => window.clearTimeout(t);
  }, [moment]);

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

      {/* The PIN field is bare inside this pill, so the pill takes the focus ring while it is focused. */}
      <div className="sf-card sf-card--compact flex-row flex-wrap items-center gap-2 p-2 pl-4 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[var(--focus)] has-[input:focus-visible]:outline-solid">
        {cashier ? (
          <>
            <span className="inline-flex items-center gap-2 text-[15px]">
              <UserRound className="text-ink-2 size-[18px]" aria-hidden />
              {cashier.name}
            </span>
            <button type="button" onClick={() => setCashier(null)} className="sf-btn sf-btn--soft ml-auto px-4">
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
              className="placeholder:text-ink-3 min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none"
            />
            <button
              type="button"
              onClick={() => void signInCashier()}
              disabled={pin.length < 4}
              className="sf-btn sf-btn--soft shrink-0 px-4"
            >
              Set
            </button>
          </div>
        )}
        {pinErr && <span className="text-danger-ink w-full pb-1 text-[13px]">{pinErr}</span>}
        {cashierNotice && !cashier && <span className="text-warning-ink w-full pb-1 text-[13px]">{cashierNotice}</span>}
      </div>

      {/*
        #reader must stay mounted unconditionally — html5-qrcode attaches to it by element id. The frame
        around it is Qrew's scan frame: lime corners on an ink well, glowing when a stamp lands.
      */}
      <div className={cn("qrew-scanframe", glow && "is-success")}>
        <div id="reader" />
        {camera !== "on" && (
          <div className="bg-surface-inverse text-on-inverse absolute inset-0 flex flex-col items-center justify-center gap-4 p-10 text-center text-sm leading-relaxed">
            {/* While starting, the browser may be asking for permission — say so, or staff wait on it. */}
            <p className="m-0 max-w-[30ch]">
              {camera === "starting" ? "Starting camera… allow it if the browser asks." : CAMERA_COPY[camera]}
            </p>
            {camera !== "starting" && RETRYABLE.has(camera) && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="sf-btn">
                Try again
              </button>
            )}
          </div>
        )}
        {/* Said by the banner below too, which is what assistive tech reads; this is for the eye at the till. */}
        {moment && (
          <div
            key={moment.id}
            aria-hidden
            className="sf-notify sf-liquid sf-liquid--tint counter-notify"
            data-liquid="9"
            data-bezel="18"
          >
            <span className="sf-notify__icon">{moment.gift ? <Gift /> : <Check />}</span>
            <span>
              <b className="sf-notify__title">{moment.title}</b>
              {moment.detail}
            </span>
          </div>
        )}
        {camera !== "starting" && camera !== "unsupported" && (
          <button
            type="button"
            onClick={switchCamera}
            aria-label="Switch camera"
            title="Switch camera"
            className="sf-bubble sf-liquid sf-liquid--tint absolute top-4 right-4 z-10"
            data-liquid="7"
            data-bezel="14"
          >
            <SwitchCamera aria-hidden />
          </button>
        )}
      </div>

      {/* The manual fallback: one field for the code printed under the customer's QR, in dot-matrix. */}
      <form onSubmit={submitCode} className="flex flex-col gap-3">
        <label className="sf-field">
          <span className="sf-field__label">
            Card code <span className="text-ink-3">(under the customer's QR)</span>
          </span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="K7M 4QX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="sf-code-field [word-spacing:-0.3em]"
          />
        </label>
        <button
          type="submit"
          disabled={!code.trim() || sending || busy !== null}
          className="sf-btn sf-btn--primary sf-btn--lg sf-btn--block"
        >
          {sending ? "Checking card…" : "+ Stamp"}
        </button>
      </form>

      {result && <ResultBanner result={result} />}
      {result?.found &&
        result.enrollmentId &&
        !result.rewardReady &&
        result.reason !== "no_accrual" &&
        result.reason !== "frozen" && (
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => void stampAgain()}
            disabled={busy !== null || extraResting}
            className="sf-btn sf-btn--lg sf-btn--block"
          >
            {busy === "extra" ? "Adding…" : "+ Add another stamp"}
          </button>
          <span className="text-ink-3 text-[12.5px]">For a second purchase on this visit</span>
        </div>
      )}
      {result?.found && result.rewardReady && result.enrollmentId && (
        <button
          type="button"
          onClick={() => void doRedeem()}
          disabled={busy !== null}
          className="sf-btn sf-btn--ink sf-btn--lg sf-btn--block"
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
        <p role="alert" className="text-danger-ink m-0 text-sm">
          {err}
        </p>
      )}
    </div>
  );
}

/** What a scan sounds like: a stamp (or a valid card), a repeat that added nothing, or a miss. */
function feedbackFor(r: ScanResult): Feedback {
  if (!r.found) return "error";
  if (r.reason === "cooldown" || r.reason === "reward_ready" || r.reason === "frozen") return "repeat";
  return "success";
}

function Banner({
  tone,
  card,
  name,
  stamps,
  landed,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "ready";
  /** The card this result is about, so staff can see which card the buttons below will act on. */
  card?: string;
  /** Which of the shop's cards it is — said when the shop runs more than one, or the card is frozen. */
  name?: string;
  /** The card's stamps, drawn as dots — the same dots the customer sees on their card. */
  stamps?: { current: number; total: number };
  /** Whether a stamp just landed, so the newest dot springs in. */
  landed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-[var(--radius-lg)] px-4 py-4 text-center text-[15px] font-medium",
        tone === "ok" && "bg-signature-soft text-signature-ink",
        tone === "warn" && "bg-warning-soft text-warning-ink",
        tone === "bad" && "bg-danger-soft text-danger-ink",
        // A reward ready is the one lime fill on the screen.
        tone === "ready" && "bg-signature text-on-signature",
      )}
    >
      <div>{children}</div>
      {card && (
        <div className="text-[12.5px] font-normal opacity-80">
          {name && `${name} · `}Card {card}
        </div>
      )}
      {stamps && stamps.total > 0 && (
        <ol
          key={stamps.current}
          className={cn(
            "sf-steps mt-2 justify-center",
            tone === "ready" && "qrew-steps--on-lime",
          )}
          aria-hidden
        >
          {Array.from({ length: stamps.total }, (_, i) => (
            <li
              key={i}
              className={cn(
                "sf-steps__dot",
                i < stamps.current && "sf-steps__dot--done",
                landed && i === stamps.current - 1 && "qrew-land",
              )}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function stampsOf(r: ScanResult): { current: number; total: number } | undefined {
  return r.currentStamps !== undefined && r.stampsRequired !== undefined
    ? { current: r.currentStamps, total: r.stampsRequired }
    : undefined;
}

/** How long the notification over the camera stays: Softform's `sf-notify` plays in, holds and leaves in 2.6s. */
const MOMENT_MS = 2700;

type Moment = { title: string; detail?: string; gift?: boolean };

/** The one-line version of a result, for the notification over the camera. The banner keeps the detail. */
function momentOf(result: ScanResult | null, redeemed: RedeemResult | null): Moment | null {
  if (result?.found && (result.reason === "applied" || result.reason === "duplicate")) {
    const count = `${result.currentStamps} of ${result.stampsRequired}`;
    return result.rewardReady
      ? { title: "Reward ready", detail: `${count} · redeem it below`, gift: true }
      : { title: "Stamp added", detail: count };
  }
  if (result?.found && result.reason === "no_accrual") return { title: "Valid card", detail: "Apply the offer" };
  if (redeemed?.redeemed) return { title: "Reward redeemed", detail: redeemed.rewardText, gift: true };
  return null;
}

function ResultBanner({ result }: { result: ScanResult }) {
  if (!result.found) return <Banner tone="bad">✗ Card not found for this store</Banner>;
  const card = result.shortCode;
  const frozen = result.reason === "frozen" || result.program?.status === "frozen";
  const name = (result.cardsRunning ?? 1) >= 2 || frozen ? result.program?.name : undefined;
  // The shop turned this card off: it adds nothing, but a reward it already holds is still theirs.
  if (result.reason === "frozen")
    return result.rewardReady ? (
      <Banner tone="ready" card={card} name={name} stamps={stampsOf(result)}>
        Card no longer collecting — redeem the reward below · {result.currentStamps}/{result.stampsRequired}
      </Banner>
    ) : (
      <Banner tone="warn" card={card} name={name} stamps={stampsOf(result)}>
        Card no longer collecting — nothing added · {result.currentStamps}/{result.stampsRequired}
      </Banner>
    );
  if (result.reason === "cooldown")
    return (
      <Banner tone="warn" card={card} name={name} stamps={stampsOf(result)}>
        ⏳ Already stamped just now · {result.currentStamps}/{result.stampsRequired}
      </Banner>
    );
  // Nothing to collect on this kind of card — scanning it is how staff check it is genuine.
  if (result.reason === "no_accrual")
    return (
      <Banner tone="ok" card={card} name={name}>
        ✓ Valid card — apply the offer
      </Banner>
    );
  if (result.reason === "reward_ready")
    return (
      <Banner tone="ready" card={card} name={name} stamps={stampsOf(result)}>
        🎉 Reward ready — redeem it below · {result.currentStamps}/{result.stampsRequired}
      </Banner>
    );
  // "applied", or "duplicate": a retry of a request whose stamp had already landed — added either way.
  return (
    <Banner tone={result.rewardReady ? "ready" : "ok"} card={card} name={name} stamps={stampsOf(result)} landed>
      {result.rewardReady ? "🎉 Reward ready!" : "✓ Stamp added"} · {result.currentStamps}/
      {result.stampsRequired}
    </Banner>
  );
}
