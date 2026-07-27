import { Controller, Post, Body, Req } from "@nestjs/common";
import type { Request } from "express";
import { EnrollRequest } from "@qrew/contracts";
import { enroll, verifyCustomerToken } from "@qrew/core";
import { Public } from "../auth/auth.decorators";

// Public endpoint: a customer enrolls from the merchant's QR landing. The merchant is
// identified by the (public) QR context in the body — this is routing, not authentication.
@Public()
@Controller("enroll")
export class EnrollController {
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
