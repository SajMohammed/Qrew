import { Controller, Get, Query } from "@nestjs/common";
import { listCustomers } from "@qrew/core";
import { CustomersQuery } from "@qrew/contracts";
import { Merchant, Roles } from "../auth/auth.decorators";

@Controller("customers")
export class CustomersController {
  /**
   * The customer book — names, emails, phones and visit history. This is the shop's most sensitive
   * read, so it is owner/manager only: a shared counter device signed in as a cashier can stamp
   * cards but cannot enumerate the customers behind them.
   */
  @Roles("owner", "manager")
  @Get()
  list(@Merchant() merchantId: string, @Query() query: unknown) {
    const { filter, search, limit, offset } = CustomersQuery.parse(query);
    return listCustomers(merchantId, { filter, search, limit, offset });
  }
}
