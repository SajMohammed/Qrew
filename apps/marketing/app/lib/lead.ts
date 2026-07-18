export interface LeadInput {
  businessName: string;
  email: string;
  city?: string;
}

// POSTs to /api/leads, which next.config rewrites to the NestJS API (same-origin, no CORS).
export async function postLead(input: LeadInput): Promise<void> {
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { issues?: { message: string }[] } | null;
    throw new Error(body?.issues?.[0]?.message ?? `Something went wrong (${res.status})`);
  }
}
