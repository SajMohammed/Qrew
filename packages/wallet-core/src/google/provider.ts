import type { WalletProvider, PassContent, PassRef, PassUpdate } from "../types";
import {
  ServiceAccountTokens,
  serviceAccountFromEnv,
  signJwtRs256,
  type ServiceAccount,
} from "./auth";

const API = "https://walletobjects.googleapis.com/walletobjects/v1";
const SAVE_LINK = "https://pay.google.com/gp/v/save/";

/**
 * Google Wallet, natively.
 *
 * Google's model is a CLASS (the template: shop name, colours, what the card is) and an OBJECT per
 * customer card. Ids are namespaced by the issuer, and we derive them deterministically —
 * `<issuer>.<programId>` and `<issuer>.<serial>` — so nothing extra has to be persisted and a retry
 * always addresses the same pass.
 *
 * The save link is a "fat" JWT carrying the whole object: Google creates the object when the
 * customer taps Save. That means we never create passes for the many customers who never add one,
 * and updates simply address the id we already know they'd have.
 */
export class GoogleWalletProvider implements WalletProvider {
  private readonly sa: ServiceAccount;
  private readonly tokens: ServiceAccountTokens;
  private readonly issuerId: string;
  private readonly origins: string[];
  /** Classes are per-programme and immutable enough to cache for the process's life. */
  private readonly ensuredClasses = new Set<string>();

  constructor() {
    this.issuerId = process.env.GOOGLE_WALLET_ISSUER_ID ?? "";
    if (!this.issuerId) throw new Error("GOOGLE_WALLET_ISSUER_ID is required for the Google wallet provider");
    this.sa = serviceAccountFromEnv();
    this.tokens = new ServiceAccountTokens(this.sa);
    this.origins = (process.env.GOOGLE_WALLET_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }

  classId(programKey: string): string {
    return `${this.issuerId}.${sanitiseId(programKey)}`;
  }

  objectId(serial: string): string {
    return `${this.issuerId}.${sanitiseId(serial)}`;
  }

  /**
   * Which object a stored ref actually points at.
   *
   * An enrollment may carry an id written by a DIFFERENT provider — the in-memory fake stores
   * `google_<serial>`, and a shop that switched vendors would have others. Those are meaningless
   * here, so anything outside this issuer's namespace is ignored in favour of the deterministic id.
   * Without this, every update silently 404s against an object that was never ours.
   */
  private resolveObjectId(ref: PassRef): string {
    const stored = ref.googleObjectId;
    return stored?.startsWith(`${this.issuerId}.`) ? stored : this.objectId(ref.serial);
  }

  /**
   * The "Add to Google Wallet" link. Ensures the class exists, then signs the object into a JWT.
   * Returns null rather than throwing: a wallet link is a nice-to-have on a card screen that must
   * render regardless.
   */
  async getSaveUrl(content: PassContent): Promise<string | null> {
    try {
      await this.ensureClass(content);
      return `${SAVE_LINK}${this.buildSaveJwt(content)}`;
    } catch (err) {
      console.error("[wallet] could not build a Google save link:", err);
      return null;
    }
  }

  /**
   * The signed save-to-wallet assertion. Pure — no network — so the payload Google will act on can
   * be asserted directly in tests rather than inferred from a mocked HTTP call.
   */
  buildSaveJwt(content: PassContent): string {
    return signJwtRs256(
      {
        iss: this.sa.clientEmail,
        aud: "google",
        typ: "savetowallet",
        iat: Math.floor(Date.now() / 1000),
        origins: this.origins,
        payload: { loyaltyObjects: [this.toObject(content)] },
      },
      this.sa,
    );
  }

  /**
   * Create the object server-side. The save-link flow doesn't need this — Google creates the object
   * on save — but issuing eagerly is what the port promises, and a pre-existing object is simply
   * adopted when the customer saves.
   */
  async issuePass(content: PassContent): Promise<PassRef> {
    await this.ensureClass(content);
    const id = this.objectId(content.serial);
    const existing = await this.request("GET", `/loyaltyObject/${encodeURIComponent(id)}`);
    if (!existing) await this.request("POST", "/loyaltyObject", this.toObject(content));
    return { serial: content.serial, googleObjectId: id };
  }

  /**
   * Reflect the current count. A 404 means the customer has not added this card to their wallet —
   * the overwhelmingly common case, and not an error worth failing a stamp over.
   */
  async updateStamps(ref: PassRef, update: PassUpdate): Promise<void> {
    const id = this.resolveObjectId(ref);
    await this.request("PATCH", `/loyaltyObject/${encodeURIComponent(id)}`, {
      loyaltyPoints: { balance: { int: update.currentStamps }, label: "Stamps" },
      /*
       * Re-point the pass at its programme's class.
       *
       * A loyalty object carries a frozen snapshot of its class, so a pass issued against an older
       * template keeps that template's branding forever — editing the design updates a class the
       * pass no longer belongs to, and nothing the customer can see ever changes. Rewriting classId
       * is what actually moves it.
       */
      ...(update.programId ? { classId: this.classId(update.programId) } : {}),
      /*
       * PATCH MERGES nested objects rather than replacing them, so a field left out simply survives
       * — an old caption or a stale row will sit on the pass forever unless it is explicitly
       * nulled. That is why alternateText is cleared by name rather than by omission.
       */
      barcode: { type: "QR_CODE", value: update.serial, alternateText: null },
      ...(update.rewardText
        ? { textModulesData: [{ header: "Reward", body: update.rewardText, id: "reward" }] }
        : {}),
      // Re-point the strip as well. Its URL carries the count, so leaving it alone would keep the
      // customer looking at the picture drawn before this scan.
      ...(update.stripUrl ? { heroImage: { sourceUri: { uri: update.stripUrl } } } : {}),
    });
  }

  /**
   * A lock-screen nudge. Google delivers this to everyone holding the pass when the message is
   * added to the object, so this is the free push channel the wallet buys us.
   */
  async pushUpdate(ref: PassRef, message: string): Promise<void> {
    const id = this.resolveObjectId(ref);
    await this.request("POST", `/loyaltyObject/${encodeURIComponent(id)}/addMessage`, {
      message: { header: "Qrew", body: message },
    });
  }

  /** Expire rather than delete — Google has no delete, and an expired pass leaves the wallet. */
  async revoke(ref: PassRef): Promise<void> {
    const id = this.resolveObjectId(ref);
    await this.request("PATCH", `/loyaltyObject/${encodeURIComponent(id)}`, { state: "EXPIRED" });
  }

  // ── payload mapping ──────────────────────────────────────────────────────────

  /**
   * The template. Programme-scoped, so every card of one programme shares it.
   *
   * Google REJECTS a loyalty class with no program logo, and it fetches that image itself — so it
   * has to be a publicly reachable HTTPS URL, not a localhost asset or a data URI. The merchant's
   * own logo takes precedence once we store one; until then every class falls back to the Qrew mark
   * configured in the environment.
   */
  toClass(content: PassContent): Record<string, unknown> {
    const logoUrl = content.logoUrl ?? process.env.GOOGLE_WALLET_LOGO_URL;
    if (!logoUrl) {
      throw new Error(
        "Google requires a program logo on every loyalty class. Set GOOGLE_WALLET_LOGO_URL to a " +
          "publicly reachable HTTPS image (PNG/JPEG, square, min 100x100) — Google fetches it, so " +
          "a localhost URL will not work.",
      );
    }
    return {
      id: this.classId(content.programId),
      issuerName: content.merchantName,
      programName: content.programName,
      reviewStatus: "UNDER_REVIEW", // becomes APPROVED automatically for loyalty classes
      hexBackgroundColor: content.brandColor ?? "#146A2E",
      programLogo: { sourceUri: { uri: logoUrl } },
      /*
       * Say where things go, rather than accepting Google's default arrangement.
       *
       * Left to itself the pass repeats one number in three places — the points field, the barcode
       * caption and a progress row — while the reward, the thing the customer is actually working
       * towards, is buried in the details list below the fold. This puts the reward under the
       * barcode and lets the points field and the stamp strip carry the count between them.
       */
      classTemplateInfo: {
        cardBarcodeSectionDetails: {
          firstTopDetail: {
            fieldSelector: { fields: [{ fieldPath: "object.textModulesData['reward']" }] },
          },
        },
      },
      // Intent → platform: the shop's extra rows become Google text modules.
      ...(content.details?.length
        ? {
            textModulesData: content.details.map((d, i) => ({
              header: d.label,
              body: d.value,
              id: `detail_${i}`,
            })),
          }
        : {}),
      // …and their address becomes a geofenced lock-screen reminder.
      ...(content.location
        ? { locations: [{ latitude: content.location.lat, longitude: content.location.lng }] }
        : {}),
    };
  }

  /** One customer's card. The barcode carries the same rotating token the staff app scans. */
  toObject(content: PassContent): Record<string, unknown> {
    return {
      id: this.objectId(content.serial),
      classId: this.classId(content.programId),
      state: "ACTIVE",
      accountId: content.serial,
      // The member is the CUSTOMER. The shop is already the issuer/title above.
      ...(content.customerName ? { accountName: content.customerName } : {}),
      loyaltyPoints: {
        label: "Stamps",
        balance: { int: content.currentStamps },
      },
      /*
       * The barcode carries the SERIAL, not the app's rotating token.
       *
       * A wallet pass is a stored object: whatever goes in here is frozen until we patch it, and a
       * card token lives two minutes. Embedding one would produce a pass that scans for two minutes
       * and then tells the customer "card not found" at the till. The serial is already the card's
       * capability — the same value the app's QR falls back to — so this loses nothing.
       */
      // No alternateText: it is meant as a fallback for manual entry, and a UUID serial is not
      // something a cashier can type. Filling it with the count just repeated the points field.
      barcode: {
        type: "QR_CODE",
        value: content.serial,
      },
      // The count already appears as the points field AND on the stamp strip. A third copy in a
      // "Progress" row is what made the pass feel cluttered, so only the reward lives here.
      textModulesData: [{ header: "Reward", body: content.rewardText, id: "reward" }],
      /*
       * NO hexBackgroundColor here on purpose.
       *
       * Colour is a TEMPLATE concern — it belongs to the shop, not to one customer's card — and an
       * object-level colour OVERRIDES the class. Setting it here meant that editing the brand colour
       * in the card designer updated the class correctly and changed nothing anybody could see,
       * because every saved pass kept the colour frozen into it at save time.
       */
      // The stamp strip. It belongs on the OBJECT, not the class, because it is redrawn every time
      // this customer's count changes — the class is shared by everyone on the programme.
      ...(content.stripUrl ? { heroImage: { sourceUri: { uri: content.stripUrl } } } : {}),
    };
  }

  // ── transport ────────────────────────────────────────────────────────────────

  /**
   * Push the current design onto the class. Unlike ensureClass this always writes, because it is
   * called when the owner has just changed something and expects to see it.
   */
  async syncTemplate(content: PassContent): Promise<void> {
    const id = this.classId(content.programId);
    const body = this.toClass(content);
    const existing = await this.request("GET", `/loyaltyClass/${encodeURIComponent(id)}`);
    if (existing) await this.request("PATCH", `/loyaltyClass/${encodeURIComponent(id)}`, body);
    else await this.request("POST", "/loyaltyClass", body);
    this.ensuredClasses.add(id);
  }

  private async ensureClass(content: PassContent): Promise<void> {
    const id = this.classId(content.programId);
    if (this.ensuredClasses.has(id)) return;
    const existing = await this.request("GET", `/loyaltyClass/${encodeURIComponent(id)}`);
    if (!existing) await this.request("POST", "/loyaltyClass", this.toClass(content));
    this.ensuredClasses.add(id);
  }

  /** Returns undefined on 404 so "does this exist?" reads naturally at the call sites. */
  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown> | undefined> {
    const token = await this.tokens.get();
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return undefined;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Google Wallet ${method} ${path} -> ${res.status} ${detail.slice(0, 300)}`);
    }
    return res.status === 204 ? undefined : ((await res.json()) as Record<string, unknown>);
  }
}

/** Google ids allow only [A-Za-z0-9._-]; anything else would be rejected at create time. */
function sanitiseId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
