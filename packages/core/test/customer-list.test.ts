import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { adminDb, closeDb, merchants, loyaltyPrograms, customers, enrollments } from "@qrew/db";
import { enroll, addStamp, redeem, listCustomers } from "../src/index";

let merchantId: string;
let programId: string;

const STAMPS_REQUIRED = 10;

async function stamp(enrollmentId: string, prefix: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await addStamp({ merchantId, enrollmentId, idempotencyKey: `${prefix}-${i}` });
  }
}

beforeAll(async () => {
  process.env.STAMP_COOLDOWN_SECONDS = "0";
  const s = process.pid.toString(36);
  const [m] = await adminDb
    .insert(merchants)
    .values({ name: "CRM Co", slug: `crm-${s}` })
    .returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: STAMPS_REQUIRED, bonusStamps: 0 })
    .returning();
  programId = p!.id;

  const a = await enroll({ merchantId, programId, phone: "+971500000201", name: "Aisha Khan" });
  await stamp(a.enrollmentId, "a", 5);
  const b = await enroll({ merchantId, programId, phone: "+971500000202", name: "Bilal Ahmed" });
  await stamp(b.enrollmentId, "b", 2);
  const c = await enroll({ merchantId, programId, phone: "+971500000203", name: "Carla Diaz" });
  await stamp(c.enrollmentId, "c", 1);

  // Backdated: quiet since long before the at-risk window.
  const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const [dana] = await adminDb
    .insert(customers)
    .values({ merchantId, name: "Dana Rossi", phone: "+971500000204", createdAt: past })
    .returning();
  await adminDb
    .insert(enrollments)
    .values({ merchantId, programId, customerId: dana!.id, cardSerial: randomUUID(), createdAt: past })
    .returning();

  const e = await enroll({ merchantId, programId, phone: "+971500000205", name: "Elena Cruz" });
  await stamp(e.enrollmentId, "e", STAMPS_REQUIRED);
  await redeem({ merchantId, enrollmentId: e.enrollmentId, idempotencyKey: "crm-elena-redeem" });

  const f = await enroll({ merchantId, programId, phone: "+971500000206", name: "Farid Noor" });
  await stamp(f.enrollmentId, "f", STAMPS_REQUIRED);
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId));
  await closeDb();
});

const nameOf = (rows: { name: string | null }[]) => rows.map((r) => r.name).sort();

describe("listCustomers", () => {
  it("returns one row per customer with rolled-up behaviour", async () => {
    const list = await listCustomers(merchantId);

    expect(list.total).toBe(6);
    expect(list.rows).toHaveLength(6);

    const aisha = list.rows.find((r) => r.name === "Aisha Khan");
    expect(aisha?.visits).toBe(5);
    expect(aisha?.stampsRequired).toBe(STAMPS_REQUIRED);
    expect(aisha?.currentStamps).toBe(5);
    expect(aisha?.lastVisit).toBeTruthy();

    // Elena spent her stamps, so the card is back to zero but the visits remain.
    const elena = list.rows.find((r) => r.name === "Elena Cruz");
    expect(elena?.visits).toBe(10);
    expect(elena?.redemptions).toBe(1);
    expect(elena?.currentStamps).toBe(0);
    expect(elena?.rewardReady).toBe(false);
  });

  it("derives an actionable status for each customer", async () => {
    const list = await listCustomers(merchantId);
    const status = (name: string) => list.rows.find((r) => r.name === name)?.status;

    expect(status("Farid Noor")).toBe("reward_ready"); // owed a reward — outranks everything
    expect(status("Dana Rossi")).toBe("at_risk"); // gone quiet
    expect(status("Aisha Khan")).toBe("regular"); // 5+ visits
    expect(status("Elena Cruz")).toBe("regular");
    expect(status("Bilal Ahmed")).toBe("active"); // came back, but not yet a regular
    expect(status("Carla Diaz")).toBe("new"); // a single visit
  });

  it("filters to each actionable segment", async () => {
    const ready = await listCustomers(merchantId, { filter: "reward_ready" });
    expect(nameOf(ready.rows)).toEqual(["Farid Noor"]);
    expect(ready.total).toBe(1);

    const atRisk = await listCustomers(merchantId, { filter: "at_risk" });
    expect(nameOf(atRisk.rows)).toEqual(["Dana Rossi"]);

    const regulars = await listCustomers(merchantId, { filter: "regulars" });
    expect(nameOf(regulars.rows)).toEqual(["Aisha Khan", "Elena Cruz", "Farid Noor"]);
  });

  it("searches name, email and phone case-insensitively", async () => {
    const byName = await listCustomers(merchantId, { search: "aIsHa" });
    expect(nameOf(byName.rows)).toEqual(["Aisha Khan"]);

    const bySurname = await listCustomers(merchantId, { search: "noor" });
    expect(nameOf(bySurname.rows)).toEqual(["Farid Noor"]);

    const byPhone = await listCustomers(merchantId, { search: "0000020" });
    expect(byPhone.total).toBe(6);
  });

  it("treats wildcard characters in the search as literal text", async () => {
    // Unescaped, "%" would match every customer in the shop.
    const list = await listCustomers(merchantId, { search: "%" });
    expect(list.rows).toEqual([]);
    expect(list.total).toBe(0);
  });

  it("pages without losing the filtered total", async () => {
    const first = await listCustomers(merchantId, { limit: 2, offset: 0 });
    expect(first.rows).toHaveLength(2);
    expect(first.total).toBe(6); // the whole match, not the page
    expect(first.limit).toBe(2);

    const second = await listCustomers(merchantId, { limit: 2, offset: 2 });
    expect(second.rows).toHaveLength(2);
    expect(second.total).toBe(6);

    const overlap = first.rows.filter((r) => second.rows.some((o) => o.id === r.id));
    expect(overlap).toEqual([]);
  });

  it("clamps an absurd page size instead of trusting it", async () => {
    const list = await listCustomers(merchantId, { limit: 10_000 });
    expect(list.limit).toBe(100);
  });

  it("is empty, not broken, for a shop with no customers", async () => {
    const s = process.pid.toString(36);
    const [m] = await adminDb
      .insert(merchants)
      .values({ name: "Empty Co", slug: `empty-crm-${s}` })
      .returning();
    try {
      const list = await listCustomers(m!.id);
      expect(list.rows).toEqual([]);
      expect(list.total).toBe(0);
    } finally {
      await adminDb.delete(merchants).where(eq(merchants.id, m!.id));
    }
  });
});
