import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchArtwork, isPublicAddress, ArtworkRefused, MAX_ARTWORK_BYTES } from "../src/artwork-fetch";

afterEach(() => vi.restoreAllMocks());

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("lets %s through", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1", // loopback
    "10.1.2.3", // private
    "172.20.0.1", // private
    "192.168.1.1", // private
    "100.64.0.1", // carrier-grade NAT
    "169.254.169.254", // cloud metadata
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1", // IPv4-mapped, dotted
    "::ffff:7f00:1", // IPv4-mapped, the hex form URL parsing produces
    "64:ff9b::a00:1", // NAT64 to 10.0.0.1
    "not-an-ip",
  ])("refuses %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe("fetchArtwork", () => {
  /** Fails the test if any of these links reaches the network. */
  function noNetwork() {
    return vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not be fetched"));
  }

  it.each([
    ["http://example.com/a.png", /https:\/\//],
    ["https://example.com:8443/a.png", /standard https port/],
    ["https://user:pw@example.com/a.png", /credentials/],
    ["https://127.0.0.1/a.png", /public address/],
    ["https://169.254.169.254/latest/meta-data", /public address/],
    ["https://[::ffff:127.0.0.1]/a.png", /public address/],
    ["https://localhost/a.png", /public address/], // resolves to loopback
    ["not a url", /valid URL/],
  ])("refuses %s before fetching", async (url, message) => {
    const fetch = noNetwork();
    await expect(fetchArtwork(url)).rejects.toThrow(message);
    await expect(fetchArtwork(url)).rejects.toBeInstanceOf(ArtworkRefused);
    expect(fetch).not.toHaveBeenCalled();
  });

  // A public IP literal needs no DNS, so these reach the (stubbed) fetch.
  const PUBLIC = "https://1.1.1.1/a.png";

  it("fetches a public https link, refusing redirects and with a deadline", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    await expect(fetchArtwork(PUBLIC)).resolves.toEqual(Buffer.from([1, 2, 3]));
    const init = fetch.mock.calls[0]![1]!;
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses a body over 1 MB, even when no length is declared", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array(MAX_ARTWORK_BYTES + 1)));
    await expect(fetchArtwork(PUBLIC)).rejects.toThrow(/larger than 1 MB/);
  });

  it("refuses a declared length over 1 MB without reading it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("tiny", { headers: { "content-length": String(MAX_ARTWORK_BYTES + 1) } }),
    );
    await expect(fetchArtwork(PUBLIC)).rejects.toThrow(/larger than 1 MB/);
  });

  it("surfaces a failed response as an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("gone", { status: 404 }));
    await expect(fetchArtwork(PUBLIC)).rejects.toThrow(/fetch 404/);
  });
});
