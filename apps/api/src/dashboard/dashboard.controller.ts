import { Controller, Get } from "@nestjs/common";
import { getDashboard } from "@qrew/core";
import { Merchant } from "../auth/auth.decorators";

@Controller("dashboard")
export class DashboardController {
  @Get()
  overview(@Merchant() merchantId: string) {
    return getDashboard(merchantId);
  }
}
