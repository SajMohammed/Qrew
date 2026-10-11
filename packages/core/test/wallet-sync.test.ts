import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms, enrollments } from "@qrew/db";
import { getWalletProvider, type FakeWalletProvider } from "@qrew/wallet-core";
import { getWalletQueue, closeWalletQueue } from "@qrew/queue";
import {
  enroll,
  addStamp,
  redeem,
  updateProgram,
  getProgram,
  syncPass,
  syncProgramTemplate,
  recordFinalFailure,
  requestTemplateSync,
  walletSyncView,
  WALLET_SYNC_STALE_MS,
} from "../src/index";

// The suite runs on the in-memory fake (vitest.setup.ts); this is the instance the code under test uses.
const fake = () => getWalletProvider() as FakeWalletProvider;

let merchantId: string;
let stampProgram: string;
let membershipProgram: string;
let discountProgram: string;

async function program(type: string, extra: Partial<typeof loyaltyPrograms.$inferInsert> = {}): Promise<string> {
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: `${type} card`, type, stampsRequired: 2, bonusStamps: 0, rewardText: "Free flat white", ...extra })
    .returning();
  return p!.id;
}

async function serialOf(enrollmentId: string): Promise<string> {
  const [e] = await adminDb.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
  return e!.cardSerial;
}

beforeAll(async () => {
  process.env.STAMP_COOLDOWN_SECONDS = "0";
  const [m] = await adminDb
    .insert(merchants)
    .values({ name: "Sync Café", slug: `sync-${process.pid.toString(36)}` })
    .returning();
  merchantId = m!.id;
  stampProgram = await program("stamp");
  membershipProgram = await program("membership");
  discountProgram = await program("discount", { stampsRequired: 1 });
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades
  await closeWalletQueue();
  await closeDb();
});

describe("a card's pass", () => {
  it("is created by the enroll job, with everything the card shows", async () => {
    const { enrollmentId } = await enroll({ merchantId, programId: stampProgram, name: "Aya" });
    const serial = await serialOf(enrollmentId);

    expect(await syncPass({ kind: "enroll", merchantId, enrollmentId })).toMatch(/^created pass/);
    const pass = fake().peek(serial)!;
    expect(pass.content.merchantName).toBe("Sync Café");
    expect(pass.content.customerName).toBe("Aya");
    expect(pass.content.pointsLabel).toBe("Stamps");
  });

  it("is created by a later sync if the enroll job was lost", async () => {
    const { enrollmentId } = await enroll({ merchantId, programId: stampProgram });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: `lost-${enrollmentId}` });
    expect(await syncPass({ kind: "stamp", merchantId, enrollmentId })).toMatch(/^created pass .* at 1\/2/);
  });

  it("isn't issued for a product that has no Google pass yet", async () => {
    const { enrollmentId } = await enroll({ merchantId, programId: discountProgram });
    expect(await syncPass({ kind: "enroll", merchantId, enrollmentId })).toMatch(/discount cards have no pass yet/);
    expect(fake().peek(await serialOf(enrollmentId))).toBeUndefined();
  });
});

describe("the reward-ready notification", () => {
  async function cardAtReward(programId = stampProgram) {
    const { enrollmentId } = await enroll({ merchantId, programId });
    await syncPass({ kind: "enroll", merchantId, enrollmentId });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: `a-${enrollmentId}` });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: `b-${enrollmentId}` });
    return { enrollmentId, serial: await serialOf(enrollmentId) };
  }

  it("goes out once, from the shop, when the scan made the reward ready", async () => {
    const { enrollmentId, serial } = await cardAtReward();
    expect(await syncPass({ kind: "stamp", merchantId, enrollmentId, notify: "reward_ready" })).toMatch(/notified/);
    const [message] = fake().messages(serial);
    expect(message?.header).toBe("Sync Café");
    expect(message?.body).toBe("Your reward is ready: Free flat white. Show this card at the counter.");
    expect(message?.id).toBe(`reward-${enrollmentId}-0`); // unique per reward cycle
  });

  it("isn't sent for an ordinary stamp", async () => {
    const { enrollmentId, serial } = await cardAtReward();
    await syncPass({ kind: "stamp", merchantId, enrollmentId });
    expect(fake().messages(serial)).toHaveLength(0);
  });

  it("isn't sent if the reward was already redeemed by the time the job ran", async () => {
    const { enrollmentId, serial } = await cardAtReward();
    await redeem({ merchantId, enrollmentId, idempotencyKey: `r-${enrollmentId}` });
    await syncPass({ kind: "stamp", merchantId, enrollmentId, notify: "reward_ready" });
    expect(fake().messages(serial)).toHaveLength(0);
  });

  it("is never sent for a membership card, which has nothing to redeem", async () => {
    const { enrollmentId, serial } = await cardAtReward(membershipProgram);
    await syncPass({ kind: "stamp", merchantId, enrollmentId, notify: "reward_ready" });
    expect(fake().messages(serial)).toHaveLength(0);
  });

  it("is flagged by the scan that crosses into reward-ready, and only that one", async () => {
    const { enrollmentId } = await enroll({ merchantId, programId: stampProgram });
    const flags = async () =>
      (await getWalletQueue().getJobs(["waiting"]))
        .filter((j) => j.data.kind === "stamp" && j.data.enrollmentId === enrollmentId)
        .map((j) => ("notify" in j.data && j.data.notify) || "none");
    await addStamp({ merchantId, enrollmentId, idempotencyKey: `first-${enrollmentId}` });
    expect(await flags()).toEqual(["none"]);
    await addStamp({ merchantId, enrollmentId, idempotencyKey: `second-${enrollmentId}` });
    expect((await flags()).sort()).toEqual(["none", "reward_ready"]);
  });
});

describe("pushing a programme's template", () => {
  it("marks a design save pending, then ok once the worker has pushed it", async () => {
    const saved = await updateProgram(merchantId, stampProgram, { rewardText: "Free cake" });
    expect(saved?.walletSync.state).toBe("pending");

    expect(await syncProgramTemplate({ kind: "template", merchantId, programId: stampProgram })).toMatch(/pushed/);
    expect(fake().template(stampProgram)?.merchantName).toBe("Sync Café");
    expect(fake().template(stampProgram)?.rewardText).toBe("Free cake");
    expect((await getProgram(merchantId, stampProgram))?.walletSync.state).toBe("ok");
  });

  it("refreshes every pass when what each pass shows changed, and not otherwise", async () => {
    const { enrollmentId } = await enroll({ merchantId, programId: stampProgram });
    await updateProgram(merchantId, stampProgram, { rewardText: "Free brownie" });
    expect(await syncProgramTemplate({ kind: "template", merchantId, programId: stampProgram })).toMatch(/refreshing \d+ passes/);
    const refreshes = (await getWalletQueue().getJobs(["prioritized", "waiting"])).filter(
      (j) => j.data.kind === "refresh" && j.data.enrollmentId === enrollmentId,
    );
    expect(refreshes).toHaveLength(1);

    // A save that changes nothing a pass shows: the template is pushed, nothing fans out.
    await updateProgram(merchantId, stampProgram, { name: "Renamed card" });
    expect(await syncProgramTemplate({ kind: "template", merchantId, programId: stampProgram })).not.toMatch(/refreshing/);
  });

  it("keeps a save made while a push is running pending — the push read the older generation", async () => {
    await updateProgram(merchantId, stampProgram, { rewardText: "Generation one" });
    const [before] = await adminDb.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.id, stampProgram));
    // Simulate: the worker read generation N, then the owner saved again before it recorded N.
    await updateProgram(merchantId, stampProgram, { rewardText: "Generation two" });
    await adminDb
      .update(loyaltyPrograms)
      .set({ walletSyncedGeneration: before!.walletSyncGeneration })
      .where(eq(loyaltyPrograms.id, stampProgram));
    expect((await getProgram(merchantId, stampProgram))?.walletSync.state).toBe("pending");
  });

  it("shows a push that finally failed, and a refresh that finally failed", async () => {
    await updateProgram(merchantId, membershipProgram, { rewardText: "Gold perks" });
    await recordFinalFailure({ kind: "template", merchantId, programId: membershipProgram }, "Google 500");
    expect((await getProgram(merchantId, membershipProgram))?.walletSync.state).toBe("failed");

    const { enrollmentId } = await enroll({ merchantId, programId: membershipProgram });
    await recordFinalFailure({ kind: "refresh", merchantId, enrollmentId }, "Google 500");
    expect((await getProgram(merchantId, membershipProgram))?.walletSync.failedPasses).toBe(1);
  });

  it("re-pushes every pass-bearing programme on request (a shop rename), leaving discount alone", async () => {
    await requestTemplateSync(merchantId);
    expect((await getProgram(merchantId, stampProgram))?.walletSync.state).toBe("pending");
    expect((await getProgram(merchantId, discountProgram))?.walletSync.state).toBe("none");
  });
});

describe("walletSyncView", () => {
  const base = {
    walletSyncGeneration: 2,
    walletSyncedGeneration: 1,
    walletSyncRequestedAt: new Date(1_000_000),
    walletSyncError: null,
    walletSyncFailedPasses: 0,
  };

  it("reads none, pending, ok and failed", () => {
    expect(walletSyncView({ ...base, walletSyncGeneration: 0 }).state).toBe("none");
    expect(walletSyncView(base, 1_000_000).state).toBe("pending");
    expect(walletSyncView({ ...base, walletSyncedGeneration: 2 }).state).toBe("ok");
    expect(walletSyncView({ ...base, walletSyncError: "boom" }).state).toBe("failed");
  });

  it("calls a push nobody picked up within 15 minutes failed — the worker or Redis is down", () => {
    expect(walletSyncView(base, 1_000_000 + WALLET_SYNC_STALE_MS + 1).state).toBe("failed");
  });
});
