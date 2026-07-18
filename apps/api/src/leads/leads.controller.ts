import { Controller, Post, Body } from "@nestjs/common";
import { LeadRequest } from "@qrew/contracts";
import { createLead } from "@qrew/core";

// Public endpoint: the marketing site's waitlist form. No tenant — the sender is a
// prospective merchant with no account yet.
@Controller("leads")
export class LeadsController {
  @Post()
  create(@Body() body: unknown) {
    const input = LeadRequest.parse(body); // zod validation at the boundary → 400 on bad input
    return createLead(input);
  }
}
