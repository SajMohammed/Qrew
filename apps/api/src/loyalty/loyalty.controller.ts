import { Controller, Get, Post, Body, NotFoundException } from "@nestjs/common";
import { StampRequest, RedeemRequest, ScanRequest } from "@qrew/contracts";
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
  stamp(@Merchant() merchantId: string, @Body() body: unknown) {
    const input = StampRequest.parse(body);
    return this.loyalty.addStamp(merchantId, {
      enrollmentId: input.enrollmentId,
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
    });
  }

  // Staff scanner: stamp by the scanned card serial.
  @Post("scan")
  async scan(@Merchant() merchantId: string, @Body() body: unknown) {
    const input = ScanRequest.parse(body);
    const result = await this.loyalty.scan(merchantId, {
      serial: input.serial,
      idempotencyKey: input.idempotencyKey,
    });
    if (!result.found) throw new NotFoundException("card not found for this merchant");
    return result;
  }

  @Post("redeem")
  redeem(@Merchant() merchantId: string, @Body() body: unknown) {
    const input = RedeemRequest.parse(body);
    return this.loyalty.redeem(merchantId, {
      enrollmentId: input.enrollmentId,
      idempotencyKey: input.idempotencyKey,
    });
  }
}
