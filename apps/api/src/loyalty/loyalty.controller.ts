import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UnauthorizedException,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import { StampRequest, RedeemRequest, ScanRequest } from "@qrew/contracts";
import { LoyaltyService } from "./loyalty.service";

@Controller("loyalty")
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get("programs")
  programs(@Req() req: Request) {
    return this.loyalty.listPrograms(this.tenant(req));
  }

  @Post("stamp")
  stamp(@Req() req: Request, @Body() body: unknown) {
    const input = StampRequest.parse(body);
    return this.loyalty.addStamp(this.tenant(req), {
      enrollmentId: input.enrollmentId,
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
    });
  }

  // Staff scanner: stamp by the scanned card serial.
  @Post("scan")
  async scan(@Req() req: Request, @Body() body: unknown) {
    const input = ScanRequest.parse(body);
    const result = await this.loyalty.scan(this.tenant(req), {
      serial: input.serial,
      idempotencyKey: input.idempotencyKey,
    });
    if (!result.found) throw new NotFoundException("card not found for this merchant");
    return result;
  }

  @Post("redeem")
  redeem(@Req() req: Request, @Body() body: unknown) {
    const input = RedeemRequest.parse(body);
    return this.loyalty.redeem(this.tenant(req), {
      enrollmentId: input.enrollmentId,
      idempotencyKey: input.idempotencyKey,
    });
  }

  private tenant(req: Request): string {
    if (!req.merchantId) throw new UnauthorizedException("no tenant resolved");
    return req.merchantId;
  }
}
