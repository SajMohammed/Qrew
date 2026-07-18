import { adminDb, leads } from "@qrew/db";

export interface CreateLeadInput {
  businessName: string;
  email: string;
  city?: string;
  message?: string;
}

/**
 * Capture a marketing waitlist lead. Non-tenant (a prospective merchant, no account yet), so
 * it writes via adminDb — the leads table sits outside tenant RLS by design. Idempotent on
 * email: a repeat sign-up is a no-op rather than an error, so the form never 500s on a retry.
 */
export async function createLead(input: CreateLeadInput): Promise<{ ok: true }> {
  await adminDb
    .insert(leads)
    .values({
      businessName: input.businessName.trim(),
      email: input.email.trim().toLowerCase(),
      city: input.city?.trim() || null,
      message: input.message?.trim() || null,
    })
    .onConflictDoNothing({ target: leads.email });
  return { ok: true };
}
