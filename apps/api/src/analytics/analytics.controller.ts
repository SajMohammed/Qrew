import { Controller, Get, Query } from "@nestjs/common";
import { getShopAnalytics } from "@qrew/core";
import { AnalyticsQuery } from "@qrew/contracts";
import { Merchant, Roles } from "../auth/auth.decorators";

@Controller("analytics")
export class AnalyticsController {
  /**
   * The shop's numbers. Owner/manager only — a cashier works the counter and never needs (or should
   * see) takings, retention or the customer base. This is the server-side half of hiding the
   * dashboard from staff; the client's counter mode is only the convenient half.
   */
  @Roles("owner", "manager")
  @Get()
  overview(@Merchant() merchantId: string, @Query() query: unknown) {
    const { range } = AnalyticsQuery.parse(query);
    return getShopAnalytics(merchantId, range);
  }
}
