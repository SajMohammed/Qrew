import { Controller, Get, Param, NotFoundException, Res } from "@nestjs/common";
import type { Response } from "express";
import { getCard, getCardStrip } from "@qrew/core";
import { Public } from "../auth/auth.decorators";

// Public: the customer's live card, fetched by its serial (a capability token).
@Public()
@Controller("card")
export class CardController {
  @Get(":serial")
  async card(@Param("serial") serial: string) {
    const card = await getCard(serial);
    if (!card) throw new NotFoundException("card not found");
    return card;
  }

  /**
   * The stamp strip as a PNG — the only way a wallet pass can show actual stamps, since neither
   * Google nor Apple can draw them from data.
   *
   * Public for the same reason as the card itself: the serial IS the capability. It also has to be
   * public in the plainest sense — Google fetches this URL from its own servers, unauthenticated.
   *
   * Cached only briefly: the image changes the moment a stamp lands, so a long TTL would pin a
   * stale strip to a card that has already moved on.
   */
  @Get(":serial/strip.png")
  async strip(@Param("serial") serial: string, @Res() res: Response) {
    const png = await getCardStrip(serial);
    if (!png) throw new NotFoundException("card not found");
    res.type("image/png").set("cache-control", "public, max-age=60").send(png);
  }
}
