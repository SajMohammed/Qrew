import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { GoogleWalletProvider } from "../src/google/provider";
import { signJwtRs256 } from "../src/google/auth";
import type { PassContent } from "../src/types";

/**
 * Everything here is offline: id derivation, payload mapping and JWT signing are pure. The network
 * calls (class/object CRUD) are exercised against Google itself, not mocked into a false green.
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
    // The barcode must carry the rotating token the staff app scans — not the raw serial.
    expect(obj.barcode.type).toBe("QR_CODE");
    expect(obj.barcode.value).toBe(CONTENT.qrToken);
    expect(obj.hexBackgroundColor).toBe("#6C2A4B");
    expect(obj.textModulesData.find((t: any) => t.id === "reward").body).toBe("1 free item");
    // The member is the CUSTOMER, not the shop — the shop is already the title.
    expect(obj.accountName).toBe("Sara M.");
  });

  it("builds the class from the merchant's own branding", () => {
    const cls = withEnv().toClass(CONTENT) as Record<string, any>;
    expect(cls.issuerName).toBe("Nadia's Coffee");
    expect(cls.programName).toBe("Loyalty Card");
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

    // "Fat" JWT: the object travels inside it, so Google creates the pass on save and we never
    // provision passes for the many customers who never add one.
    const object = payload.payload.loyaltyObjects[0];
    expect(object.id).toBe(`3388000000022222222.${CONTENT.serial}`);
    expect(object.classId).toBe(`3388000000022222222.${CONTENT.programId}`);
    expect(object.barcode.value).toBe(CONTENT.qrToken);
    expect(object.loyaltyPoints.balance.int).toBe(3);
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
