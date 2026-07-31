import type { WalletProvider, PassContent, PassRef } from "../types";
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
  async updateStamps(ref: PassRef, currentStamps: number): Promise<void> {
    const id = ref.googleObjectId ?? this.objectId(ref.serial);
    await this.request("PATCH", `/loyaltyObject/${encodeURIComponent(id)}`, {
      loyaltyPoints: { balance: { int: currentStamps }, label: "Stamps" },
    });
  }

  /**
   * A lock-screen nudge. Google delivers this to everyone holding the pass when the message is
   * added to the object, so this is the free push channel the wallet buys us.
   */
  async pushUpdate(ref: PassRef, message: string): Promise<void> {
    const id = ref.googleObjectId ?? this.objectId(ref.serial);
    await this.request("POST", `/loyaltyObject/${encodeURIComponent(id)}/addMessage`, {
      message: { header: "Qrew", body: message },
    });
  }

  /** Expire rather than delete — Google has no delete, and an expired pass leaves the wallet. */
  async revoke(ref: PassRef): Promise<void> {
    const id = ref.googleObjectId ?? this.objectId(ref.serial);
    await this.request("PATCH", `/loyaltyObject/${encodeURIComponent(id)}`, { state: "EXPIRED" });
  }

  // ── payload mapping ──────────────────────────────────────────────────────────

  /** The template. Programme-scoped, so every card of one programme shares it. */
  toClass(content: PassContent): Record<string, unknown> {
    return {
      id: this.classId(content.programName || content.merchantName),
      issuerName: content.merchantName,
      programName: content.programName,
      reviewStatus: "UNDER_REVIEW", // becomes APPROVED automatically for loyalty classes
      hexBackgroundColor: content.brandColor ?? "#146A2E",
      ...(content.logoUrl
        ? { programLogo: { sourceUri: { uri: content.logoUrl } } }
        : {}),
    };
  }

  /** One customer's card. The barcode carries the same rotating token the staff app scans. */
  toObject(content: PassContent): Record<string, unknown> {
    return {
      id: this.objectId(content.serial),
      classId: this.classId(content.programName || content.merchantName),
      state: "ACTIVE",
      accountId: content.serial,
      accountName: content.merchantName,
      loyaltyPoints: {
        label: "Stamps",
        balance: { int: content.currentStamps },
      },
      barcode: {
        type: "QR_CODE",
        value: content.qrToken,
        alternateText: `${content.currentStamps}/${content.stampsRequired}`,
      },
      textModulesData: [
        { header: "Reward", body: content.rewardText, id: "reward" },
        {
          header: "Progress",
          body: `${content.currentStamps} of ${content.stampsRequired} stamps`,
          id: "progress",
        },
      ],
      hexBackgroundColor: content.brandColor ?? "#146A2E",
    };
  }

  // ── transport ────────────────────────────────────────────────────────────────

  private async ensureClass(content: PassContent): Promise<void> {
    const id = this.classId(content.programName || content.merchantName);
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
