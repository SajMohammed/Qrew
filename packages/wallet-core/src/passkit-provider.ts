import type { WalletProvider, PassContent, PassRef, PassUpdate } from "./types";

/**
 * Adapter for a flat-fee wallet vendor (PassKit). The vendor owns Apple pass signing +
 * APNs, Google Wallet JWT/issuer, and stamp-image compositing — so this adapter stays thin.
 *
 * The endpoints/payloads below are PLACEHOLDERS: wire them to the vendor's real API and your
 * project/template ids before use. Everything lives behind the WalletProvider port, so a
 * later swap to native Apple/Google adapters changes only this file.
 */
export class PassKitProvider implements WalletProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    const apiKey = process.env.PASSKIT_API_KEY;
    if (!apiKey) throw new Error("PASSKIT_API_KEY is required for PassKitProvider");
    this.apiKey = apiKey;
    this.baseUrl = process.env.PASSKIT_BASE_URL ?? "https://api.pub1.passkit.io";
  }

  async getSaveUrl(_content: PassContent): Promise<string | null> {
    return null; // TODO: the vendor exposes its own save link per member
  }

  async syncTemplate(_content: PassContent): Promise<void> {
    // TODO: the vendor owns the template; push design changes here.
  }

  async issuePass(content: PassContent): Promise<PassRef> {
    // TODO: create the member/pass from `content`; map the vendor response to PassRef.
    const res = await this.request("POST", "/members/member", this.toVendorMember(content));
    return {
      serial: content.serial,
      applePassId: res?.applePassId,
      googleObjectId: res?.googleObjectId,
    };
  }

  async updateStamps(ref: PassRef, update: PassUpdate): Promise<void> {
    await this.request("PUT", `/members/member/${encodeURIComponent(ref.serial)}`, {
      points: update.currentStamps,
    });
  }

  async pushUpdate(ref: PassRef, message: string): Promise<void> {
    // Some vendors auto-push on field change with a changeMessage; others expose a notify call.
    await this.request("POST", `/members/member/${encodeURIComponent(ref.serial)}/notify`, {
      message,
    });
  }

  async revoke(ref: PassRef): Promise<void> {
    await this.request("DELETE", `/members/member/${encodeURIComponent(ref.serial)}`);
  }

  private toVendorMember(content: PassContent): Record<string, unknown> {
    // TODO: map to the vendor's member/pass schema (program id, tier, image fields, etc.)
    return { externalId: content.serial, points: content.currentStamps };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, any> | undefined> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: this.apiKey, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`PassKit ${method} ${path} -> ${res.status}`);
    return res.status === 204 ? undefined : ((await res.json()) as Record<string, any>);
  }
}
