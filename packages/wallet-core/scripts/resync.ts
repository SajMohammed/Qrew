/**
 * Push every existing pass back into line with the current code and design.
 *
 * A wallet pass is a stored object: it only changes when we patch it. So whenever the SHAPE of a
 * pass changes — a new field, a corrected barcode, a redrawn strip — passes already in customers'
 * wallets keep whatever they were built with until something touches them. Ordinarily the next scan
 * does that, but a card nobody visits could sit wrong for months.
 *
 * This walks the shop's cards and pushes current state onto each one. Safe to re-run: it writes the
 * same values the next scan would, and changes no data in Qrew's own database.
 *
 *   pnpm wallet:resync
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { eq, isNotNull } from "drizzle-orm";
import { getWalletProvider } from "../src/index";
import { stripUrlFor } from "../src/strip";

config({ path: resolve(import.meta.dirname, "../../../.env") });

async function main() {
  // Imported AFTER config(): @qrew/db opens its pool at import time and would throw on a missing
  // DATABASE_URL, because static imports are hoisted above the dotenv call above.
  const { adminDb, enrollments, loyaltyPrograms, merchants, closeDb } = await import("@qrew/db");

  if (process.env.WALLET_PROVIDER !== "google") {
    console.log("\n  WALLET_PROVIDER is not 'google' — nothing to resync.\n");
    return;
  }
  const provider = getWalletProvider();

  // adminDb rather than withTenant: this is a deliberate cross-tenant maintenance job, exactly the
  // case the admin connection exists for.
  const rows = await adminDb
    .select({
      serial: enrollments.cardSerial,
      currentStamps: enrollments.currentProgress,
      googleObjectId: enrollments.googleObjectId,
      programId: enrollments.programId,
      stampsRequired: loyaltyPrograms.stampsRequired,
      rewardText: loyaltyPrograms.rewardText,
      merchantName: merchants.name,
    })
    .from(enrollments)
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
    .innerJoin(merchants, eq(merchants.id, enrollments.merchantId))
    .where(isNotNull(enrollments.googleObjectId));

  console.log(`\nResyncing ${rows.length} card(s) to the current pass shape\n`);

  let updated = 0;
  let absent = 0;
  for (const r of rows) {
    try {
      await provider.updateStamps(
        { serial: r.serial, googleObjectId: r.googleObjectId ?? undefined },
        {
          serial: r.serial,
          programId: r.programId,
          currentStamps: r.currentStamps,
          stampsRequired: r.stampsRequired,
          rewardText: r.rewardText,
          stripUrl: stripUrlFor(r.serial, r.currentStamps),
        },
      );
      updated++;
      console.log(`  ✓ ${r.serial.slice(0, 8)} ${r.merchantName} → ${r.currentStamps}/${r.stampsRequired}`);
    } catch (err) {
      // A pass the customer never actually saved has no object to patch. That is the common case,
      // not a failure worth stopping for.
      absent++;
      console.log(`  · ${r.serial.slice(0, 8)} not in a wallet — skipped`);
    }
  }

  console.log(`\n  ${updated} updated, ${absent} not saved by a customer\n`);
  await closeDb();
}

main().catch((err) => {
  console.error("\n  resync failed:", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
