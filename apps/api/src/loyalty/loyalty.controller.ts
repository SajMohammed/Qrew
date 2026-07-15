import { Controller, Get, Post, Body, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { StampRequest, RedeemRequest } from "@qrew/contracts";
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
    const input = StampRequest.parse(body); // zod validation at the boundary
    return this.loyalty.addStamp(this.tenant(req), {
      enrollmentId: input.enrollmentId,
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
    });
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
