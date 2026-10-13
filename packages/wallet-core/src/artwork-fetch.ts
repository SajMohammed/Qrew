import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Fetching a shop's artwork from a link they pasted — safely.
 *
 * The server draws stamp strips from images at shop-supplied URLs, and the strip is served
 * publicly, so whatever URL an owner saves is fetched by the API on demand. Unguarded, that is a
 * server-side request forgery: anyone who signs up can point it at the cloud metadata endpoint or
 * an internal service, or at a multi-gigabyte file. So a fetch is only made when:
 *
 * - the link is https on the standard port, with no credentials in it;
 * - every address the host resolves to is public (not loopback, private, link-local, CGNAT…);
 * - the response is not a redirect, arrives within 5s, and is at most 1 MB.
 *
 * DNS rebinding — the name resolving to a public address for the check and a private one for the
 * fetch — is moot under https: an internal host cannot present a valid certificate for the
 * attacker's hostname, so the TLS handshake fails. The resolution check still matters for internal
 * names that do carry public certificates.
 */

export const MAX_ARTWORK_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;

/** A link we decline to fetch — as opposed to one that failed. */
export class ArtworkRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtworkRefused";
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — includes the cloud metadata endpoint
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["64:ff9b::", 96], // NAT64 — reaches IPv4 addresses
  ["2001::", 32], // Teredo — tunnels to IPv4
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 — embeds an IPv4 address
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** `::ffff:10.0.0.1` (or its hex form `::ffff:a00:1`) is an IPv4 address and is judged as one. */
function unmapIPv4(address: string): string {
  const m = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(address);
  if (!m) return address;
  if (m[1]) return m[1];
  const hi = parseInt(m[2]!, 16);
  const lo = parseInt(m[3]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** Whether an address is somewhere on the public internet. */
export function isPublicAddress(address: string): boolean {
  const ip = unmapIPv4(address);
  const family = isIP(ip);
  if (family === 0) return false;
  return !blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/** Download artwork from a shop-supplied link, refusing anything that isn't plainly public. */
export async function fetchArtwork(url: string): Promise<Buffer> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ArtworkRefused("artwork link is not a valid URL");
  }
  if (u.protocol !== "https:") throw new ArtworkRefused("artwork must be an https:// link");
  if (u.port && u.port !== "443") throw new ArtworkRefused("artwork link must use the standard https port");
  if (u.username || u.password) throw new ArtworkRefused("artwork link must not carry credentials");

  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new ArtworkRefused(`${host} does not resolve to a public address`);
  }

  const res = await fetch(u, {
    redirect: "error", // a public host could otherwise bounce the fetch somewhere private
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "image/png" },
  });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_ARTWORK_BYTES) {
    throw new ArtworkRefused("artwork is larger than 1 MB");
  }

  // Counted as it streams: Content-Length is optional and can lie.
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ARTWORK_BYTES) {
      await reader.cancel();
      throw new ArtworkRefused("artwork is larger than 1 MB");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
