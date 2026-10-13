import { Controller, Post, Body } from "@nestjs/common";
import { LeadRequest } from "@qrew/contracts";
import { createLead } from "@qrew/core";
import { Public } from "../auth/auth.decorators";
import { RateLimit } from "../rate-limit/rate-limit";

// Public endpoint: the marketing site's waitlist form. No tenant — the sender is a
// prospective merchant with no account yet.
@Public()
@Controller("leads")
export class LeadsController {
  @RateLimit("leads")
  @Post()
  create(@Body() body: unknown) {
    const input = LeadRequest.parse(body); // zod validation at the boundary → 400 on bad input
    return createLead(input);
  }
}
