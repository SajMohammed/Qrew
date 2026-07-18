import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, leads } from "@qrew/db";
import { createLead } from "../src/index";

const email = `lead-${process.pid.toString(36)}@example.com`;

afterAll(async () => {
  await adminDb.delete(leads).where(eq(leads.email, email));
  await closeDb();
});

describe("createLead", () => {
  it("captures a lead, normalizes email, and is idempotent on email", async () => {
    await createLead({ businessName: "Test Cafe", email: email.toUpperCase(), city: "Dubai" });
    await createLead({ businessName: "Different Name", email, message: "hi" }); // duplicate email

    const rows = await adminDb.select().from(leads).where(eq(leads.email, email));
    expect(rows).toHaveLength(1); // idempotent — the second sign-up is a no-op
    expect(rows[0]?.email).toBe(email); // normalized to lowercase
    expect(rows[0]?.businessName).toBe("Test Cafe"); // first write wins
    expect(rows[0]?.city).toBe("Dubai");
  });
});
