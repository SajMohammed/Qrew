import { Controller, Post, Body } from "@nestjs/common";
import { EnrollRequest } from "@qrew/contracts";
import { enroll } from "@qrew/core";

// Public endpoint: a customer enrolls from the merchant's QR landing. The merchant is
// identified by the (public) QR context in the body — this is routing, not authentication.
@Controller("enroll")
export class EnrollController {
  @Post()
  enroll(@Body() body: unknown) {
    const input = EnrollRequest.parse(body); // zod validation at the boundary
    return enroll(input);
  }
}
