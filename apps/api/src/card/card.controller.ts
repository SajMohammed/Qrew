import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  NotFoundException,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { getCard, getCardStrip, stripFor, normalizeDesign } from "@qrew/core";
import { StripPreviewRequest } from "@qrew/contracts";
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
  async strip(
    @Param("serial") serial: string,
    @Query("p") platform: string | undefined,
    @Res() res: Response,
  ) {
    // ?p=apple asks for Apple's 3:1 geometry. Anything else is Google's 5:4, which is the default
    // because Google is the wallet we issue on today.
    const png = await getCardStrip(serial, platform === "apple" ? "apple" : "google");
    if (!png) throw new NotFoundException("card not found");
    res.type("image/png").set("cache-control", "public, max-age=60").send(png);
  }

  /**
   * Render a design that has not been saved yet.
   *
   * The card designer used to draw its own approximation of the pass in CSS, which could drift from
   * what a wallet actually shows — the reason light artwork looked blank in the preview and correct
   * on the phone. This returns the real image, from the same function the wallet fetches.
   *
   * Public and side-effect-free: it takes a design in the body, touches no card and writes nothing,
   * so there is no tenant to scope it to.
   */
  @Public()
  @Post("strip/preview")
  @HttpCode(200) // renders, creates nothing — 201 would be a lie
  async preview(@Body() body: unknown, @Res() res: Response) {
    const req = StripPreviewRequest.parse(body);
    const png = await stripFor(
      normalizeDesign(req.cardDesign),
      req.stampsRequired,
      req.currentStamps,
      req.platform,
    );
    if (!png) throw new NotFoundException("could not render");
    // Never cached: the whole point is that it changes on every keystroke in the designer.
    res.type("image/png").set("cache-control", "no-store").send(png);
  }
}
