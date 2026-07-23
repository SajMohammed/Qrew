import { Controller, Get, Param, NotFoundException } from "@nestjs/common";
import { getCard } from "@qrew/core";
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
}
