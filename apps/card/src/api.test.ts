import { describe, it, expect, afterEach, vi } from "vitest";
import {
  ApiError,
  claimCard,
  enroll,
  failureKind,
  friendlyError,
  getCard,
  getShopPreview,
  heldCardFor,
  refreshAuth,
  tileFromCardView,
  tileFromMyCard,
  type CardTile,
  type CardView,
  type MyCard,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Every request answers with `answer()`; the stub records what was sent. */
function stubFetch(answer: () => Response | Promise<Response>) {
  const fetch = vi.fn(async () => answer());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiError);
  return e as ApiError;
}

describe("failures, sorted by what the customer can do about them", () => {
  it("a card that isn't there is not_found", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    const e = await failure(getCard("nope"));
    expect([e.kind, e.status]).toEqual(["not_found", 404]);
  });

  it("malformed counter-code ids are not_found too — retrying can't help", async () => {
    stubFetch(() => new Response("", { status: 400 }));
    expect((await failure(getShopPreview("x", "y"))).kind).toBe("not_found");
  });

  it("our side failing is server", async () => {
    for (const status of [500, 502, 503]) {
      stubFetch(() => new Response("", { status }));
      expect((await failure(getCard("s"))).kind).toBe("server");
    }
  });

  it("no answer at all is offline", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const e = await failure(getCard("s"));
    expect([e.kind, e.status]).toEqual(["offline", null]);
  });

  it("a GET that hangs gives up after 10 s, as offline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
      ),
    );
    const pending = failure(getCard("s"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).kind).toBe("offline");
  });

  // Safari gained AbortSignal.timeout only in 16; an iPhone on iOS 15 must still load its card.
  it("needs no AbortSignal.timeout", async () => {
    const original = AbortSignal.timeout;
    // @ts-expect-error — removed, as on Safari 15
    delete AbortSignal.timeout;
    try {
      stubFetch(() => Response.json({ serial: "s" }));
      await expect(getCard("s")).resolves.toEqual({ serial: "s" });
    } finally {
      AbortSignal.timeout = original;
    }
  });

  it("a POST gets no deadline — it may have landed, and a retry could make a second card", async () => {
    const fetch = stubFetch(() => Response.json({ serial: "s" }));
    await enroll({ merchantId: "m", programId: "p" });
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeUndefined();
    await getCard("s");
    expect((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("enrolling sorts its failures the same way", async () => {
    stubFetch(() => Promise.reject(new TypeError("Load failed")));
    expect((await failure(enroll({ merchantId: "m", programId: "p" }))).kind).toBe("offline");
    stubFetch(() => new Response("", { status: 404 }));
    expect((await failure(enroll({ merchantId: "m", programId: "p" }))).kind).toBe("not_found");
  });

  it("speaks to the customer, never in fetch's words", () => {
    expect(friendlyError(new ApiError("offline", null, "GET /card/x: no answer"))).toBe(
      "No connection — check your signal and try again.",
    );
    expect(friendlyError(new ApiError("server", 429, "limited", "Lots of sign-ups…"))).toBe("Lots of sign-ups…");
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe("Something went wrong — please try again.");
    expect(failureKind(new Error("anything"))).toBe("server");
  });
});

describe("refreshAuth", () => {
  it("signs out only when the server refuses the refresh token", async () => {
    for (const status of [400, 401]) {
      stubFetch(() => new Response("", { status }));
      await expect(refreshAuth("rt")).resolves.toBeNull();
    }
  });

  it("keeps the session through a deploy's 502 or no signal", async () => {
    stubFetch(() => new Response("", { status: 503 }));
    await expect(refreshAuth("rt")).rejects.toBeInstanceOf(ApiError);
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(refreshAuth("rt")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("claimCard", () => {
  it("drops a card that's gone or someone else's, keeps one the account can't take yet", async () => {
    stubFetch(() => Response.json({ code: "has_own_card" }, { status: 409 }));
    await expect(claimCard("t", "s")).resolves.toBe(false); // kept on the device
    stubFetch(() => Response.json({ message: "already linked" }, { status: 409 }));
    await expect(claimCard("t", "s")).resolves.toBe(true);
    stubFetch(() => Response.json([]));
    await expect(claimCard("t", "s")).resolves.toBe(true);
    stubFetch(() => new Response("", { status: 503 }));
    await expect(claimCard("t", "s")).resolves.toBe(false);
  });

  // This route never answers 404, and never with a page: either means the request went somewhere it
  // shouldn't (a bad deploy). Dropping cards then would lose every signing-in customer's cards.
  it("keeps the card when the answer can't be the claim route's", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    await expect(claimCard("t", "s")).resolves.toBe(false);
    stubFetch(() => new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(claimCard("t", "s")).resolves.toBe(false);
  });
});

describe("the card already held for a shop", () => {
  const tile = (serial: string, programId: string) => ({ serial, programId }) as CardTile;

  it("is found by its programme", () => {
    const tiles = [tile("a", "p1"), tile("b", "p2")];
    expect(heldCardFor(tiles, "p2")?.serial).toBe("b");
    expect(heldCardFor(tiles, "p3")).toBeUndefined();
  });

  it("is recognisable from either source of tiles", () => {
    expect(tileFromCardView({ serial: "a", programId: "p1" } as CardView).programId).toBe("p1");
    expect(tileFromMyCard({ serial: "a", programId: "p1", cardDesign: null } as MyCard).programId).toBe("p1");
  });
});

// A shop runs a card per type, each its own card; one it turned off is frozen but still held.
describe("a shop's second card, and a frozen one", () => {
  it("tiles say which of the shop's cards they are, and whether it still collects", () => {
    const view = { serial: "a", programId: "p1", programName: "Saba points", frozen: true } as CardView;
    expect(tileFromCardView(view)).toMatchObject({ programName: "Saba points", frozen: true });
    // An API from before frozen cards sends no flag: the card is collecting.
    const mine = { serial: "b", programId: "p2", programName: "Coffee club", cardDesign: null } as MyCard;
    expect(tileFromMyCard(mine)).toMatchObject({ programName: "Coffee club", frozen: false });
  });

  it("joining a card the shop has just turned off reads like a code that isn't active", async () => {
    stubFetch(() => Response.json({ code: "card_frozen", message: "this card isn't taking new members" }, { status: 409 }));
    expect((await failure(enroll({ merchantId: "m", programId: "p" }))).kind).toBe("not_found");
  });

  it("any other refusal to join stays a server failure", async () => {
    stubFetch(() => Response.json({ message: "conflict" }, { status: 409 }));
    expect((await failure(enroll({ merchantId: "m", programId: "p" }))).kind).toBe("server");
  });
});
