import "./load-env"; // must be first: populates env before ./index (client.ts) loads
import { adminDb, merchants, loyaltyPrograms, closeDb } from "./index";

// Seeds a demo merchant + program via the admin connection (bypasses RLS).
async function main(): Promise<void> {
  const inserted = await adminDb
    .insert(merchants)
    .values({ name: "Nadia's Coffee", slug: "nadias-coffee" })
    .onConflictDoNothing()
    .returning();

  const merchant = inserted[0] ?? (await adminDb.select().from(merchants).limit(1))[0];
  if (!merchant) throw new Error("seed failed: no merchant");

  await adminDb.insert(loyaltyPrograms).values({
    merchantId: merchant.id,
    name: "Coffee Card",
    stampsRequired: 10,
    bonusStamps: 2,
    rewardText: "1 free coffee",
  });

  console.log(`✓ seeded merchant ${merchant.slug} (${merchant.id})`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
