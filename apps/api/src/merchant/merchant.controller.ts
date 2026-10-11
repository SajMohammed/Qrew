import { Controller, Patch, Body } from "@nestjs/common";
import { MerchantUpdate } from "@qrew/contracts";
import { renameMerchant } from "@qrew/core";
import { Merchant, Roles } from "../auth/auth.decorators";

@Controller("merchant")
export class MerchantController {
  // The shop's name is its identity on every customer's card and pass — an owner decision, like the team.
  @Roles("owner")
  @Patch()
  async rename(@Merchant() merchantId: string, @Body() body: unknown) {
    const { name } = MerchantUpdate.parse(body);
    return renameMerchant(merchantId, name);
  }
}
