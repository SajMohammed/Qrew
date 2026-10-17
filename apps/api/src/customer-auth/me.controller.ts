import { Controller, Get, Post, Body, UseGuards, ConflictException } from "@nestjs/common";
import { ClaimCardRequest } from "@qrew/contracts";
import { getMyCards, claimCardBySerial } from "@qrew/db";
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

  // Fold an anonymous card (held by serial) into this account, then return the refreshed list.
  @Post("claim")
  async claim(@CustomerAccount() accountId: string, @Body() body: unknown) {
    const { serial } = ClaimCardRequest.parse(body);
    const outcome = await claimCardBySerial(accountId, serial);
    if (outcome === "has_own") {
      // Its own code, so the app keeps this card on the device rather than dropping it.
      throw new ConflictException({
        statusCode: 409,
        error: "Conflict",
        code: "has_own_card",
        message: "this account already holds this shop's card",
      });
    }
    if (outcome === "refused") throw new ConflictException("card not found or already linked to another account");
    return getMyCards(accountId);
  }
}
