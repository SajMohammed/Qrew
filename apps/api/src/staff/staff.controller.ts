import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  UnauthorizedException,
} from "@nestjs/common";
import { StaffCreate, StaffPinUpdate, VerifyPinRequest } from "@qrew/contracts";
import {
  verifyStaffPin,
  mintStaffToken,
  listStaff,
  addStaffPin,
  setStaffPin,
  removeStaff,
} from "@qrew/core";
import { Merchant, Roles } from "../auth/auth.decorators";

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

  /*
   * Managing the team is an owner action. A manager can run a shift and unlock counter mode, but
   * deciding who has a PIN — and therefore who can work the till — stays with the owner.
   */
  @Roles("owner")
  @Get()
  list(@Merchant() merchantId: string) {
    return listStaff(merchantId);
  }

  @Roles("owner")
  @Post()
  async create(@Merchant() merchantId: string, @Body() body: unknown) {
    const { name, pin, role } = StaffCreate.parse(body);
    return addStaffPin(merchantId, { name, pin, role });
  }

  @Roles("owner")
  @Patch(":id/pin")
  async resetPin(
    @Merchant() merchantId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { pin } = StaffPinUpdate.parse(body);
    return setStaffPin(merchantId, id, pin);
  }

  @Roles("owner")
  @Delete(":id")
  @HttpCode(204)
  async remove(@Merchant() merchantId: string, @Param("id", ParseUUIDPipe) id: string) {
    await removeStaff(merchantId, id);
  }
}
