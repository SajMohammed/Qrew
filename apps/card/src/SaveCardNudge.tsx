import { SignInPanel, SIGN_IN_AVAILABLE } from "./SignInPanel";
import { isIosSafari, isStandalone } from "@/lib/platform";
import { Icon } from "@/components/Icon";

/**
 * Off if a real iPhone shows the Home Screen app opening without the card (see index.html): then
 * only the sign-in remains.
 */
const SHOW_A2HS_TIP = true;

/*
 * An anonymous card lives only in this browser's storage, which Safari clears after a week without a
 * visit. Signing in is the real keep — on any device. On iPhone, adding the card page to the Home
 * Screen helps too: that page keeps its own storage, and opens on this card.
 *
 * The Home Screen tip goes with ONE card (the first it is shown on): an icon opens on the page it was
 * added from, so offering it on every card would mean an icon per card.
 */
const A2HS_CARD_KEY = "qrew.a2hs.card";

function a2hsCard(serial: string): boolean {
  try {
    const held = localStorage.getItem(A2HS_CARD_KEY);
    if (held) return held === serial;
    localStorage.setItem(A2HS_CARD_KEY, serial);
    return true;
  } catch {
    return false;
  }
}

export function SaveCardNudge({
  serial,
  onGoogle,
  onDev,
  onDismiss,
}: {
  serial: string;
  onGoogle: (idToken: string) => Promise<void>;
  onDev: (email: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const a2hs = SHOW_A2HS_TIP && isIosSafari() && !isStandalone() && a2hsCard(serial);
  if (!SIGN_IN_AVAILABLE && !a2hs) return null;

  return (
    <section aria-label="Save this card" className="sf-card gap-3">
      <div className="sf-spread">
        <h2 className="sf-heading m-0">Don't lose this card</h2>
        <button type="button" onClick={onDismiss} className="sf-btn sf-btn--ghost -my-1 -mr-3 px-3">
          Not now
        </button>
      </div>
      <p className="text-ink-2 m-0 text-sm">
        {SIGN_IN_AVAILABLE
          ? "It's only saved on this phone. Sign in to keep it safe — on any device."
          : "It's only saved on this phone."}
      </p>
      {SIGN_IN_AVAILABLE && <SignInPanel bare onGoogle={onGoogle} onDev={onDev} />}
      {a2hs && (
        <p className="text-ink-3 m-0 text-[12.5px]">
          On iPhone, you can also tap <Icon name="share" className="inline size-3.5 -translate-y-px" /> Share, then
          “Add to Home Screen”, to keep this card one tap away.
        </p>
      )}
    </section>
  );
}
