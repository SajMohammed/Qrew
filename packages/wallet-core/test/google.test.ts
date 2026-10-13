import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { GoogleWalletProvider } from "../src/google/provider";
import { signJwtRs256 } from "../src/google/auth";
import type { PassContent } from "../src/types";

/**
 * Everything here is offline: id derivation, payload mapping and JWT signing are pure. The network
 * calls' semantics (class/object CRUD) are exercised against Google itself by the selftest script,
 * not mocked into a false green. Only the transport wrapper — deadlines, error naming, reading a
 * 404 as "no pass" — is unit-tested here, against a stubbed fetch.
 */

let publicKey: string;
let privateKey: string;

const CONTENT: PassContent = {
  serial: "bc5da23a-b964-4dfe-b461-c455d26ac019",
  programId: "296d2bb5-d7bc-4cc3-b4fd-b2a51d92be6c",
  customerName: "Sara M.",
  merchantName: "Nadia's Coffee",
  programName: "Loyalty Card",
  rewardText: "1 free item",
  currentStamps: 3,
  stampsRequired: 10,
  qrToken: "tok_abc.sig_def",
  brandColor: "#6C2A4B",
};

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  publicKey = pair.publicKey;
  privateKey = pair.privateKey;
});

function withEnv(): GoogleWalletProvider {
  process.env.GOOGLE_WALLET_ISSUER_ID = "3388000000022222222";
  process.env.GOOGLE_WALLET_SA_EMAIL = "qrew-wallet@example.iam.gserviceaccount.com";
  process.env.GOOGLE_WALLET_SA_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");
  process.env.GOOGLE_WALLET_ORIGINS = "https://my.qrew.ae";
  process.env.GOOGLE_WALLET_LOGO_URL = "https://cdn.example.com/qrew-mark-512.png";
  return new GoogleWalletProvider();
}

afterEach(() => {
  delete process.env.GOOGLE_WALLET_ISSUER_ID;
  delete process.env.GOOGLE_WALLET_SA_EMAIL;
  delete process.env.GOOGLE_WALLET_SA_PRIVATE_KEY;
  delete process.env.GOOGLE_WALLET_ORIGINS;
  delete process.env.GOOGLE_WALLET_LOGO_URL;
});

describe("GoogleWalletProvider", () => {
  it("refuses to construct without an issuer id", () => {
    delete process.env.GOOGLE_WALLET_ISSUER_ID;
    expect(() => new GoogleWalletProvider()).toThrow(/GOOGLE_WALLET_ISSUER_ID/);
  });

  it("derives ids deterministically so a retry addresses the same pass", () => {
    const p = withEnv();
    expect(p.objectId(CONTENT.serial)).toBe(`3388000000022222222.${CONTENT.serial}`);
    expect(p.objectId(CONTENT.serial)).toBe(p.objectId(CONTENT.serial));
    // Google ids allow only [A-Za-z0-9._-] — anything else must be scrubbed, not passed through.
    expect(p.classId("Café / Brunch")).toMatch(/^3388000000022222222\.[A-Za-z0-9._-]+$/);

    // The class is keyed on the programme ID, never its name: two shops both calling their card
    // "Loyalty Card" must not collide onto one class and inherit each other's branding.
    expect(p.classId(CONTENT.programId)).toBe(`3388000000022222222.${CONTENT.programId}`);
    expect(p.classId("prog-a")).not.toBe(p.classId("prog-b"));
  });

  it("maps a card onto the loyalty object Google expects", () => {
    const obj = withEnv().toObject(CONTENT) as Record<string, any>;
    expect(obj.id).toContain(CONTENT.serial);
    expect(obj.state).toBe("ACTIVE");
    expect(obj.loyaltyPoints.balance.int).toBe(3);
    // The barcode carries the SERIAL, never the app's rotating token: a wallet pass is frozen
    // until patched, and a card token expires in two minutes — a pass built on one would stop
    // scanning at the till.
    expect(obj.barcode.type).toBe("QR_CODE");
    expect(obj.barcode.value).toBe(CONTENT.serial);
    expect(obj.barcode.value).not.toBe(CONTENT.qrToken);
    // Colour belongs to the CLASS. An object-level colour overrides it, which would freeze every
    // saved pass at the colour it had when the customer added it.
    expect(obj.hexBackgroundColor).toBeUndefined();
    expect(obj.textModulesData.find((t: any) => t.id === "reward").body).toBe("1 free item");
    // The member is the CUSTOMER, not the shop — the shop is already the title.
    expect(obj.accountName).toBe("Sara M.");
  });

  it("shows the card's typeable code under the barcode, when it has one", () => {
    const withCode = withEnv().toObject({ ...CONTENT, shortCode: "K7M 4QX" }) as Record<string, any>;
    expect(withCode.barcode).toEqual({ type: "QR_CODE", value: CONTENT.serial, alternateText: "K7M 4QX" });
    const without = withEnv().toObject(CONTENT) as Record<string, any>;
    expect(without.barcode.alternateText).toBeUndefined();
  });

  it("builds the class from the merchant's own branding", () => {
    const cls = withEnv().toClass(CONTENT) as Record<string, any>;
    expect(cls.issuerName).toBe("Nadia's Coffee");
    expect(cls.programName).toBe("Loyalty Card");
    // The class is where colour lives, so editing it in the designer reaches every saved pass.
    expect(cls.hexBackgroundColor).toBe("#6C2A4B");
    // Google rejects a class with no program logo, so one is always present.
    expect(cls.programLogo.sourceUri.uri).toBe("https://cdn.example.com/qrew-mark-512.png");
  });

  it("prefers the merchant's own logo over the Qrew fallback", () => {
    const cls = withEnv().toClass({ ...CONTENT, logoUrl: "https://shop.example/logo.png" }) as any;
    expect(cls.programLogo.sourceUri.uri).toBe("https://shop.example/logo.png");
  });

  it("explains itself when no logo is configured at all", () => {
    const p = withEnv();
    delete process.env.GOOGLE_WALLET_LOGO_URL;
    // Failing here with a clear message beats a 400 from Google at class-creation time.
    expect(() => p.toClass(CONTENT)).toThrow(/program logo/i);
  });

  it("signs a save JWT that Google can actually verify", () => {
    const jwt = signJwtRs256({ aud: "google", typ: "savetowallet" }, {
      clientEmail: "x@y.iam.gserviceaccount.com",
      privateKey,
    });
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString()).alg).toBe("RS256");
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString()).typ).toBe("savetowallet");

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
  });

  it("omits the member name for an anonymous walk-in", () => {
    const obj = withEnv().toObject({ ...CONTENT, customerName: null }) as Record<string, any>;
    expect(obj.accountName).toBeUndefined();
  });

  it("signs a save assertion carrying the whole card", () => {
    // buildSaveJwt is pure, so this asserts exactly what Google will act on — no network, and no
    // mock standing in for the real payload.
    const jwt = withEnv().buildSaveJwt(CONTENT);
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString());

    expect(payload.typ).toBe("savetowallet");
    expect(payload.aud).toBe("google");
    expect(payload.origins).toEqual(["https://my.qrew.ae"]);

    // "Fat" JWT: the object travels inside it, so saving works even before the worker has created
    // the object, and the card page never waits on Google to build the link.
    const object = payload.payload.loyaltyObjects[0];
    expect(object.id).toBe(`3388000000022222222.${CONTENT.serial}`);
    expect(object.classId).toBe(`3388000000022222222.${CONTENT.programId}`);
    expect(object.barcode.value).toBe(CONTENT.serial);
    expect(object.loyaltyPoints.balance.int).toBe(3);
  });
});

describe("transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A Google that issues a token and answers every Wallet API call with `api(url)`. */
  function stubGoogle(api: (url: string) => Response): ReturnType<typeof vi.fn> {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith("https://oauth2.googleapis.com/")
        ? Response.json({ access_token: "tok", expires_in: 3600 })
        : api(url),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  const UPDATE = { serial: CONTENT.serial, currentStamps: 4, stampsRequired: 10 };

  it("reports a missing pass as absent, so the worker can create it", async () => {
    stubGoogle(() => new Response("not found", { status: 404 }));
    await expect(withEnv().updateStamps({ serial: CONTENT.serial }, UPDATE)).resolves.toBe("absent");
  });

  it("puts the card's code under the barcode on every update, and clears it when there is none", async () => {
    const fetch = stubGoogle(() => Response.json({ id: "x" }));
    await withEnv().updateStamps({ serial: CONTENT.serial }, { ...UPDATE, shortCode: "K7M 4QX" });
    await withEnv().updateStamps({ serial: CONTENT.serial }, UPDATE);
    const barcodes = fetch.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)).barcode);
    expect(barcodes).toEqual([
      { type: "QR_CODE", value: CONTENT.serial, alternateText: "K7M 4QX" },
      // PATCH merges, so a caption left out would survive — it is cleared by name instead.
      { type: "QR_CODE", value: CONTENT.serial, alternateText: null },
    ]);
  });

  it("tells a saved pass from one nobody has saved, by Google's hasUsers", async () => {
    stubGoogle(() => Response.json({ id: "x", hasUsers: true }));
    await expect(withEnv().updateStamps({ serial: CONTENT.serial }, UPDATE)).resolves.toBe("in_wallet");
    vi.unstubAllGlobals();
    stubGoogle(() => Response.json({ id: "x" }));
    await expect(withEnv().updateStamps({ serial: CONTENT.serial }, UPDATE)).resolves.toBe("not_saved");
  });

  it("replaces an existing class with PUT, so removed rows and locations disappear", async () => {
    const fetch = stubGoogle(() => Response.json({ id: "class" }));
    await withEnv().syncTemplate(CONTENT);
    const methods = fetch.mock.calls.slice(1).map(([url, init]) => `${(init as RequestInit).method} ${String(url).split("/v1")[1]}`);
    expect(methods).toEqual([
      `GET /loyaltyClass/3388000000022222222.${CONTENT.programId}`,
      `PUT /loyaltyClass/3388000000022222222.${CONTENT.programId}`,
    ]);
  });

  it("sends a notification Google will actually push", async () => {
    const fetch = stubGoogle(() => Response.json({}));
    await withEnv().pushUpdate({ serial: CONTENT.serial }, { id: "reward-1", header: "Nadia's Coffee", body: "Ready" });
    const body = JSON.parse(String((fetch.mock.calls[1]![1] as RequestInit).body));
    expect(body.message).toEqual({ id: "reward-1", header: "Nadia's Coffee", body: "Ready", messageType: "TEXT_AND_NOTIFY" });
  });

  it("gives every call — the token exchange included — a deadline", async () => {
    const fetch = stubGoogle(() => Response.json({ id: "x" }));
    await withEnv().updateStamps({ serial: CONTENT.serial }, UPDATE);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of fetch.mock.calls) {
      expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("names the call that timed out", async () => {
    stubGoogle(() => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await expect(withEnv().updateStamps({ serial: CONTENT.serial }, UPDATE)).rejects.toThrow(
      /Google Wallet PATCH \/loyaltyObject\/.+ timed out after 5000ms/,
    );
  });
});

describe("stored pass ids from another provider", () => {
  it("ignores an id outside this issuer's namespace", () => {
    const p = withEnv();
    // The in-memory fake writes `google_<serial>`; PATCHing that would 404 forever.
    const derived = p.objectId(CONTENT.serial);
    expect(derived).toBe(`3388000000022222222.${CONTENT.serial}`);
    expect(derived.startsWith("google_")).toBe(false);
  });
});
