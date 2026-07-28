import { Controller, Post, Get, Body, Req, Query, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { EnrollRequest, PreviewQuery } from "@qrew/contracts";
import { enroll, getShopPreview, verifyCustomerToken } from "@qrew/core";
import { Public } from "../auth/auth.decorators";

// Public endpoint: a customer enrolls from the merchant's QR landing. The merchant is
// identified by the (public) QR context in the body — this is routing, not authentication.
@Public()
@Controller("enroll")
export class EnrollController {
  // Pre-enrollment card preview — public shop branding for the landing page (no customer data).
  @Get("preview")
  async preview(@Query() query: unknown) {
    const { m, p } = PreviewQuery.parse(query);
    const preview = await getShopPreview(m, p);
    if (!preview) throw new NotFoundException("shop or program not found");
    return preview;
  }

  @Post()
  enroll(@Req() req: Request, @Body() body: unknown) {
    const input = EnrollRequest.parse(body); // zod validation at the boundary
    // Optionally authenticated: a signed-in consumer's card links to their account (→ "all my cards").
    // No / invalid token → anonymous walk-in, exactly as before.
    const header = req.header("authorization");
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const customerAccountId = bearer ? (verifyCustomerToken(bearer) ?? undefined) : undefined;
    return enroll({ ...input, customerAccountId });
  }
}
