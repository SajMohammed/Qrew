import { Controller, Get, UseGuards } from "@nestjs/common";
import { getMyCards } from "@qrew/db";
import { Public } from "../auth/auth.decorators";
import { CustomerAuthGuard, CustomerAccount } from "./customer-auth.guard";

/**
 * The signed-in customer's own data. @Public() bypasses the Clerk guard; CustomerAuthGuard then
 * enforces the customer access token. GET /me/cards is the cross-merchant "all my cards" view —
 * authorized only by the caller's own session, so no merchant ever sees another's activity here.
 */
@Controller("me")
@Public()
@UseGuards(CustomerAuthGuard)
export class MeController {
  @Get("cards")
  cards(@CustomerAccount() accountId: string) {
    return getMyCards(accountId);
  }
}
