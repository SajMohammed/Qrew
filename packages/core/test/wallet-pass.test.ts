import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  isWalletIssuable,
  passContentFor,
  passFingerprint,
  passUpdateFor,
  stripVersion,
  templateContentFor,
  type PassSource,
} from "../src/wallet-pass";
import { normalizeDesign } from "../src/design";

const stamp: PassSource = {
  serial: "11111111-2222-3333-4444-555555555555",
  shortCode: "K7M4QX",
  programId: "p-1",
  customerName: "Aya",
  merchantName: "Nomad Coffee",
  programName: "Coffee Card",
  rewardText: "Free flat white",
  currentProgress: 3,
  stampsRequired: 8,
  type: "stamp",
  mechanics: {},
  cardDesign: { brandColor: "#146A2E", stampLayout: "row" },
};
const points: PassSource = { ...stamp, type: "points", mechanics: { unitLabel: "beans" }, stampsRequired: 500 };

let savedUrl: string | undefined;
beforeAll(() => {
  savedUrl = process.env.PUBLIC_API_URL;
  process.env.PUBLIC_API_URL = "https://api.qrewclub.com";
});
afterAll(() => {
  if (savedUrl === undefined) delete process.env.PUBLIC_API_URL;
  else process.env.PUBLIC_API_URL = savedUrl;
});

describe("which products get a pass", () => {
  it("issues loyalty-mapped products and holds back discount (a Google offer, no adapter yet)", () => {
    expect(isWalletIssuable("stamp")).toBe(true);
    expect(isWalletIssuable("points")).toBe(true);
    expect(isWalletIssuable("membership")).toBe(true);
    expect(isWalletIssuable("discount")).toBe(false);
  });
});

describe("pass content", () => {
  it("gives a stamp card a strip whose URL carries the design version", () => {
    const content = passContentFor(stamp, "tok");
    expect(content.pointsLabel).toBe("Stamps");
    expect(content.stripUrl).toMatch(/\/card\/11111111-.*\/strip\.png\?s=3&v=[0-9a-f]{8}$/);
    expect(content.customerName).toBe("Aya");
  });

  it("carries the card's typeable code, formatted, on the pass and every update to it", () => {
    expect(passContentFor(stamp, "tok").shortCode).toBe("K7M 4QX");
    expect(passUpdateFor(stamp).shortCode).toBe("K7M 4QX");
  });

  it("gives a points card its own word for the balance, and no strip", () => {
    const content = passContentFor(points, "tok");
    expect(content.pointsLabel).toBe("Beans");
    expect(content.stripUrl).toBeUndefined();
  });

  it("builds a template that belongs to no card in particular", () => {
    const t = templateContentFor({ id: "p-1", name: "Coffee Card", rewardText: "Free flat white", stampsRequired: 8, type: "stamp", mechanics: {}, cardDesign: {} }, "Nomad Coffee");
    expect(t.serial).toBe("");
    expect(t.merchantName).toBe("Nomad Coffee");
    expect(t.programId).toBe("p-1");
  });
});

describe("strip version", () => {
  const base = normalizeDesign(stamp.cardDesign);

  it("changes when the drawing changes, so Google refetches the image", () => {
    const v = stripVersion(base, 8);
    expect(stripVersion({ ...base, stampLayout: "grid" }, 8)).not.toBe(v);
    expect(stripVersion({ ...base, stampImageUrl: "https://cdn.example.com/cup.png" }, 8)).not.toBe(v);
    expect(stripVersion(base, 10)).not.toBe(v);
  });

  it("stays put when nothing drawn changed", () => {
    expect(stripVersion(normalizeDesign({ ...stamp.cardDesign as object }), 8)).toBe(stripVersion(base, 8));
  });
});

describe("pass fingerprint (does every pass need refreshing?)", () => {
  const program = (over: Partial<PassSource> = {}) => ({ ...stamp, ...over });

  it("changes with the reward text every pass shows", () => {
    expect(passFingerprint(program({ rewardText: "Free cake" }))).not.toBe(passFingerprint(program()));
  });

  it("changes with a stamp card's colour — the strip is redrawn in it", () => {
    expect(passFingerprint(program({ cardDesign: { brandColor: "#6C2A4B" } }))).not.toBe(
      passFingerprint(program({ cardDesign: { brandColor: "#146A2E" } })),
    );
  });

  it("ignores a points card's colour — that lives on the template alone", () => {
    const p = (brandColor: string) => ({ ...points, cardDesign: { brandColor } });
    expect(passFingerprint(p("#6C2A4B"))).toBe(passFingerprint(p("#146A2E")));
  });
});
