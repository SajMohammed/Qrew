/**
 * Google Wallet setup doctor.
 *
 * Setting this up spans two consoles and four steps, and the failure modes all surface as the same
 * unhelpful 400. This checks each link in the chain in order and says exactly which one is broken —
 * including finding your Issuer ID for you, since the console shows a Merchant ID (BCR2DN…) far
 * more prominently and the two are easy to confuse.
 *
 *   pnpm wallet:doctor
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { ServiceAccountTokens, serviceAccountFromEnv } from "../src/google/auth";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const info = (m: string) => console.log(`    ${m}`);

async function main() {
  console.log("\nGoogle Wallet setup check\n");

  // 1 ─ credentials present
  const missing = ["GOOGLE_WALLET_SA_EMAIL", "GOOGLE_WALLET_SA_PRIVATE_KEY"].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    bad(`missing in .env: ${missing.join(", ")}`);
    info("Copy `client_email` and `private_key` out of the service-account JSON key.");
    info("Keep the \\n escapes in the private key exactly as they appear in the JSON.");
    process.exit(1);
  }
  ok("service-account credentials found in .env");

  // 2 ─ the key actually signs, and Google accepts the account
  let token: string;
  try {
    token = await new ServiceAccountTokens(serviceAccountFromEnv()).get();
    ok("Google accepted the service account (key is valid)");
  } catch (err) {
    bad("Google rejected the service account");
    info(String(err instanceof Error ? err.message : err));
    info("");
    info("Usually one of:");
    info("  • the private key was pasted with real newlines instead of \\n");
    info("  • the Google Wallet API is not enabled on the Cloud project");
    process.exit(1);
  }

  // 3 ─ the account can see an issuer (this is the step people miss)
  const res = await fetch("https://walletobjects.googleapis.com/walletobjects/v1/issuer", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    bad(`could not list issuers (${res.status})`);
    info((await res.text().catch(() => "")).slice(0, 300));
    process.exit(1);
  }

  const body = (await res.json()) as { resources?: { issuerId?: string; name?: string }[] };
  const issuers = body.resources ?? [];

  if (issuers.length === 0) {
    bad("the service account cannot see any issuer account");
    info("");
    info("This is the step that is easiest to miss:");
    info("  1. pay.google.com/business/console → Google Wallet API → Users");
    info(`  2. Invite ${process.env.GOOGLE_WALLET_SA_EMAIL}`);
    info("  3. Give it the Developer role");
    process.exit(1);
  }

  ok(`service account has access to ${issuers.length} issuer account(s)`);
  console.log();
  for (const i of issuers) {
    console.log(`    ${i.name ?? "(unnamed)"}`);
    console.log(`    \x1b[1mIssuer ID: ${i.issuerId}\x1b[0m`);
  }
  console.log();

  // 4 ─ the configured issuer matches one we can actually use
  const configured = process.env.GOOGLE_WALLET_ISSUER_ID;
  if (!configured) {
    bad("GOOGLE_WALLET_ISSUER_ID is not set");
    info(`Add this to .env:  GOOGLE_WALLET_ISSUER_ID=${issuers[0]?.issuerId}`);
    process.exit(1);
  }
  if (!issuers.some((i) => i.issuerId === configured)) {
    bad(`GOOGLE_WALLET_ISSUER_ID=${configured} is not an issuer this account can use`);
    if (/^BCR2DN/i.test(configured)) {
      info("That looks like the MERCHANT id from the console header — not the Issuer ID.");
    }
    info(`Use ${issuers[0]?.issuerId} instead.`);
    process.exit(1);
  }
  ok(`GOOGLE_WALLET_ISSUER_ID matches an accessible issuer`);

  if (process.env.WALLET_PROVIDER !== "google") {
    bad(`WALLET_PROVIDER is "${process.env.WALLET_PROVIDER ?? "unset"}" — passes stay fake`);
    info("Set WALLET_PROVIDER=google in .env to issue real passes.");
  } else {
    ok("WALLET_PROVIDER=google");
  }

  console.log("\nReady to issue passes.\n");
}

main().catch((err) => {
  bad(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
