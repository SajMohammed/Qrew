import { Controller, Post, Body, UnauthorizedException } from "@nestjs/common";
import { VerifyPinRequest } from "@qrew/contracts";
import { verifyStaffPin, mintStaffToken } from "@qrew/core";
import { Merchant } from "../auth/auth.decorators";

// The shared scanner holds the merchant's Clerk session (→ @Merchant()); a cashier's PIN is
// verified within that merchant and exchanged for a shift token used to attribute their scans.
@Controller("staff")
export class StaffController {
  @Post("verify-pin")
  async verifyPin(@Merchant() merchantId: string, @Body() body: unknown) {
    const { pin } = VerifyPinRequest.parse(body);
    const staff = await verifyStaffPin(merchantId, pin);
    if (!staff) throw new UnauthorizedException("invalid PIN");
    return { staffToken: mintStaffToken(staff.staffId), name: staff.name, role: staff.role };
  }
}
