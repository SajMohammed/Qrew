import { Controller, Get, Post, Body, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { StampRequest, RedeemRequest, ScanRequest } from "@qrew/contracts";
import { resolveStaffToken } from "@qrew/core";
import { Merchant } from "../auth/auth.decorators";
import { LoyaltyService } from "./loyalty.service";

@Controller("loyalty")
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get("programs")
  programs(@Merchant() merchantId: string) {
    return this.loyalty.listPrograms(merchantId);
  }

  @Post("stamp")
  async stamp(@Merchant() merchantId: string, @Body() body: unknown) {
    const input = StampRequest.parse(body);
    return this.loyalty.addStamp(merchantId, {
      enrollmentId: input.enrollmentId,
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
      staffId: await this.resolveStaffId(merchantId, input.staffToken),
    });
  }

  // Staff scanner: stamp by the scanned card serial.
  @Post("scan")
  async scan(@Merchant() merchantId: string, @Body() body: unknown) {
    const input = ScanRequest.parse(body);
    const result = await this.loyalty.scan(merchantId, {
      serial: input.serial,
      idempotencyKey: input.idempotencyKey,
      staffId: await this.resolveStaffId(merchantId, input.staffToken),
    });
    if (!result.found) throw new NotFoundException("card not found for this merchant");
    return result;
  }

  @Post("redeem")
  async redeem(@Merchant() merchantId: string, @Body() body: unknown) {
    const input = RedeemRequest.parse(body);
    return this.loyalty.redeem(merchantId, {
      enrollmentId: input.enrollmentId,
      idempotencyKey: input.idempotencyKey,
      staffId: await this.resolveStaffId(merchantId, input.staffToken),
    });
  }

  /*
   * A staff token (from /staff/verify-pin) attributes the action to a cashier. Optional — absent
   * when the counter runs on the owner's login alone. A present token must belong to THIS shop and
   * to someone still on the team with the same PIN; otherwise the request is refused with a code the
   * counter recognises, so it can ask for the PIN again rather than show a bare 401.
   */
  private async resolveStaffId(merchantId: string, token: string | undefined): Promise<string | undefined> {
    if (!token) return undefined;
    const staffId = await resolveStaffToken(merchantId, token);
    if (!staffId) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: "Unauthorized",
        code: "staff_token_invalid",
        message: "invalid or expired staff token",
      });
    }
    return staffId;
  }
}
