import { eq } from "drizzle-orm";
import { adminDb, withTenant, merchantAssets } from "@qrew/db";
import { decodePng } from "@qrew/wallet-core";
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

  let decoded;
  try {
    decoded = decodePng(bytes);
  } catch (err) {
    // The message matters: "not a PNG" is the difference between the shop re-exporting and giving up.
    throw new InvalidInputError(
      `that file could not be read as a PNG${err instanceof Error ? ` (${err.message})` : ""}. ` +
        `Wallet stamps are composited on our server, which reads PNG only — re-export as PNG and try again.`,
    );
  }

  if (decoded.width > MAX_ASSET_DIMENSION || decoded.height > MAX_ASSET_DIMENSION) {
    throw new InvalidInputError(
      `image is ${decoded.width}×${decoded.height} — the limit is ${MAX_ASSET_DIMENSION}×${MAX_ASSET_DIMENSION}`,
    );
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

/** A rejected upload — the message is written to be shown to the shop as-is. */
export class BadAsset extends Error {
  readonly code = "bad_asset";
  constructor(message: string) {
    super(message);
    this.name = "BadAsset";
  }
}
