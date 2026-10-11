import { eq } from "drizzle-orm";
import { adminDb, withTenant, merchantAssets } from "@qrew/db";
import { decodePng, readPngSize } from "@qrew/wallet-core";
import { InvalidInputError } from "./errors";

/**
 * Images a shop uploads for their card design.
 *
 * The designer used to take image URLs only, which quietly assumed the shop already hosts a PNG
 * somewhere public — a developer's assumption, not a café owner's. This stores the file for them
 * and hands back a URL both wallets can fetch.
 */

/** Big enough for detailed stamp artwork, small enough that the bytes belong in Postgres. */
export const MAX_ASSET_BYTES = 512 * 1024;
export const MAX_ASSET_DIMENSION = 1024;

export type AssetKind = "stamp" | "logo";

export interface StoredAsset {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface AssetBytes {
  bytes: Buffer;
  contentType: string;
}

/**
 * Where a wallet fetches an uploaded image.
 *
 * Mirrors `stripUrlFor`: Google downloads the image from its own servers, so this has to be a
 * public absolute URL. PUBLIC_API_URL is that public origin (the tunnel in development, the API
 * host in production). Without it we fall back to the local origin, which is enough for the
 * designer's own preview but is NOT reachable by Google — the same caveat any localhost URL has.
 */
export function assetUrlFor(id: string): string {
  const base = process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  return `${base.replace(/\/$/, "")}/asset/${id}.png`;
}

/**
 * Validate and store an uploaded image.
 *
 * Validation IS a decode, deliberately: the same decoder that composites the wallet strip has to be
 * able to read this file, so anything it can't read must be rejected at upload — when the shop is
 * watching and can pick another file — rather than silently degrading to blank stamps later.
 */
export async function storeAsset(
  merchantId: string,
  kind: AssetKind,
  bytes: Buffer,
): Promise<StoredAsset> {
  if (bytes.length === 0) throw new InvalidInputError("the file is empty");
  if (bytes.length > MAX_ASSET_BYTES) {
    throw new InvalidInputError(`image is ${Math.round(bytes.length / 1024)} KB — the limit is ${MAX_ASSET_BYTES / 1024} KB`);
  }

  // The message matters: "not a PNG" is the difference between the shop re-exporting and giving up.
  const unreadable = (err: unknown) =>
    new InvalidInputError(
      `that file could not be read as a PNG${err instanceof Error ? ` (${err.message})` : ""}. ` +
        `Wallet stamps are composited on our server, which reads PNG only — re-export as PNG and try again.`,
    );

  // Size from the header FIRST: decoding allocates whatever the header declares, so a small file
  // claiming a huge image must be turned away before it gets that far.
  let size;
  try {
    size = readPngSize(bytes);
  } catch (err) {
    throw unreadable(err);
  }
  if (size.width > MAX_ASSET_DIMENSION || size.height > MAX_ASSET_DIMENSION) {
    throw new InvalidInputError(
      `image is ${size.width}×${size.height} — the limit is ${MAX_ASSET_DIMENSION}×${MAX_ASSET_DIMENSION}`,
    );
  }

  let decoded;
  try {
    decoded = decodePng(bytes);
  } catch (err) {
    throw unreadable(err);
  }

  const [row] = await withTenant(merchantId, (db) =>
    db
      .insert(merchantAssets)
      .values({
        merchantId,
        kind,
        contentType: "image/png",
        bytes,
        width: decoded.width,
        height: decoded.height,
      })
      .returning({ id: merchantAssets.id }),
  );

  return { id: row!.id, url: assetUrlFor(row!.id), width: decoded.width, height: decoded.height };
}

/**
 * Read an uploaded image by id. Public, and via adminDb for the same reason `getCardStrip` is:
 * Google fetches this URL unauthenticated from its own servers, so the random id is the capability.
 */
export async function getAsset(id: string): Promise<AssetBytes | null> {
  const [row] = await adminDb
    .select({ bytes: merchantAssets.bytes, contentType: merchantAssets.contentType })
    .from(merchantAssets)
    .where(eq(merchantAssets.id, id));

  return row ? { bytes: Buffer.from(row.bytes), contentType: row.contentType } : null;
}

/**
 * The asset id in one of our own upload links, or null for anything else.
 *
 * Our uploads are read straight from Postgres when a strip is drawn, never fetched over HTTP: that
 * keeps the guarded network fetch for links a shop pasted, and spares a round trip out through the
 * load balancer and back. Matched on the path alone, so links saved under an older public host (a
 * dev tunnel's URL changes every run) keep working; at worst a lookalike link reads nothing here.
 */
export function ownAssetId(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return /^\/asset\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.png$/i.exec(pathname)?.[1] ?? null;
}

/** A rejected upload — the message is written to be shown to the shop as-is. */
export class BadAsset extends Error {
  readonly code = "bad_asset";
  constructor(message: string) {
    super(message);
    this.name = "BadAsset";
  }
}
