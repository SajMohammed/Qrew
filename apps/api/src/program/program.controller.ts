import { Controller, Get, Patch, Param, Body, NotFoundException, ParseUUIDPipe } from "@nestjs/common";
import { CardType, CardTypeToggle, ProgramUpdate } from "@qrew/contracts";
import { getProgram, listPrograms, setCardTypeEnabled, updateProgram, availableCardTypes } from "@qrew/core";
import { Merchant, Roles } from "../auth/auth.decorators";

@Controller("program")
export class ProgramController {
  /**
   * The card types this deployment can actually issue.
   *
   * Served from the registry rather than hardcoded in the console, so the picker can never offer a
   * product the server has no module for — which would issue a pass against the wrong wallet class,
   * and that is not fixable without every customer re-saving.
   */
  @Get("types")
  types() {
    return availableCardTypes().map((t) => ({
      type: t.type,
      label: t.label,
      blurb: t.blurb,
      accrues: t.accrues,
      defaultTarget: t.defaultTarget,
      /** Whether the pass shows a picture of stamps, so the designer previews what a wallet gets. */
      drawsStampStrip: t.drawsStampStrip,
      /**
       * Whether a pass can be issued for this type at all. Discount cards map to a Google offer and
       * there is no adapter yet, so the console must not preview a wallet pass it cannot produce.
       */
      issuable: t.wallet.google === "loyalty",
    }));
  }

  @Get(":id")
  async one(@Merchant() merchantId: string, @Param("id", ParseUUIDPipe) id: string) {
    const program = await getProgram(merchantId, id);
    if (!program) throw new NotFoundException("program not found");
    return program;
  }

  // Editing the card design is an owner/manager action; cashiers can't reach it.
  @Roles("owner", "manager")
  @Patch(":id")
  async update(@Merchant() merchantId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const patch = ProgramUpdate.parse(body);
    const program = await updateProgram(merchantId, id, patch);
    if (!program) throw new NotFoundException("program not found");
    return program;
  }
}

/**
 * The shop's cards, one per card type it runs. There is no single "current" card: every screen
 * lists them and names the one it means.
 */
@Controller("programs")
export class ProgramsController {
  /** Every card, on or frozen, oldest first. Card designs are not sensitive, so any staff role reads them. */
  @Get()
  list(@Merchant() merchantId: string) {
    return listPrograms(merchantId);
  }

  /**
   * Turn a card type on or off. Owner-only, like the shop's name: which cards a shop runs is what
   * its price will be based on. Answers with every card, so the console redraws from the truth.
   */
  @Roles("owner")
  @Patch(":type")
  setEnabled(@Merchant() merchantId: string, @Param("type") type: string, @Body() body: unknown) {
    const { enabled } = CardTypeToggle.parse(body);
    return setCardTypeEnabled(merchantId, CardType.parse(type), enabled);
  }
}
