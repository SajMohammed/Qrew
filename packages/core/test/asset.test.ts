import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants } from "@qrew/db";
import { encodePng } from "@qrew/wallet-core";
import { storeAsset, getAsset, assetUrlFor, MAX_ASSET_BYTES, MAX_ASSET_DIMENSION } from "../src/index";
import { InvalidInputError } from "../src/errors";

let merchantId: string;
let otherMerchantId: string;

/** A real PNG of the given size, so validation is exercised against bytes rather than a stub. */
function png(w: number, h: number): Buffer {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = i % 256;
    rgba[i * 4 + 1] = (i * 3) % 256;
    rgba[i * 4 + 2] = (i * 7) % 256;
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(w, h, rgba);
}

beforeAll(async () => {
  const s = process.pid.toString(36);
  const [m] = await adminDb.insert(merchants).values({ name: "Asset Co", slug: `ast-${s}` }).returning();
  merchantId = m!.id;
  const [o] = await adminDb.insert(merchants).values({ name: "Other Co", slug: `oth-${s}` }).returning();
  otherMerchantId = o!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId));
  await adminDb.delete(merchants).where(eq(merchants.id, otherMerchantId));
  await closeDb();
});

describe("design image uploads", () => {
  it("stores a PNG and hands back a URL a wallet can fetch", async () => {
    const stored = await storeAsset(merchantId, "stamp", png(64, 64));
    expect(stored.width).toBe(64);
    expect(stored.height).toBe(64);
    expect(stored.url).toContain(`/asset/${stored.id}.png`);
    expect(stored.url).toMatch(/^https?:\/\//); // absolute — Google fetches it from its own servers
  });

  it("returns the exact bytes that were uploaded", async () => {
    const original = png(16, 24);
    const { id } = await storeAsset(merchantId, "stamp", original);

    const read = await getAsset(id);

    expect(read?.contentType).toBe("image/png");
    expect(read?.bytes.equals(original)).toBe(true);
  });

  it("answers null for an unknown id rather than throwing", async () => {
    expect(await getAsset("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  /*
   * The upload decodes the file with the SAME decoder that composites the wallet strip. That is the
   * point of validating here: anything this rejects would otherwise reach the strip renderer and
   * silently produce blank stamps long after the shop stopped looking.
   */
  it("rejects a file it could not later composite, naming PNG", async () => {
    await expect(storeAsset(merchantId, "stamp", Buffer.from("\xff\xd8\xff\xe0 JPEG really"))).rejects.toThrow(
      InvalidInputError,
    );
    await expect(storeAsset(merchantId, "stamp", Buffer.from("not an image at all"))).rejects.toThrow(/PNG/i);
  });

  it("rejects an empty upload", async () => {
    await expect(storeAsset(merchantId, "stamp", Buffer.alloc(0))).rejects.toThrow(/empty/i);
  });

  it("rejects a file past the size cap, saying how big it was", async () => {
    const huge = Buffer.alloc(MAX_ASSET_BYTES + 1, 0x41);
    await expect(storeAsset(merchantId, "stamp", huge)).rejects.toThrow(/KB/);
  });

  it("rejects an image past the dimension cap", async () => {
    const wide = png(MAX_ASSET_DIMENSION + 1, 4);
    await expect(storeAsset(merchantId, "stamp", wide)).rejects.toThrow(
      new RegExp(`${MAX_ASSET_DIMENSION + 1}`),
    );
  });

  /*
   * The public read is by id alone, with no tenant context — Google is not authenticated. So the id
   * has to be the whole capability, and it must not become a way to enumerate another shop's files.
   */
  it("reads by id alone, because the id IS the capability", async () => {
    const mine = await storeAsset(merchantId, "stamp", png(8, 8));
    const theirs = await storeAsset(otherMerchantId, "logo", png(8, 8));

    expect(await getAsset(mine.id)).not.toBeNull();
    expect(await getAsset(theirs.id)).not.toBeNull();
    expect(mine.id).not.toBe(theirs.id);
  });

  it("builds the public URL from PUBLIC_API_URL, so passes point at the tunnel not localhost", () => {
    const before = process.env.PUBLIC_API_URL;
    process.env.PUBLIC_API_URL = "https://qrew.example.com/";
    try {
      expect(assetUrlFor("abc")).toBe("https://qrew.example.com/asset/abc.png");
    } finally {
      if (before === undefined) delete process.env.PUBLIC_API_URL;
      else process.env.PUBLIC_API_URL = before;
    }
  });
});
