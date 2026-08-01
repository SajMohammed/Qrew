import { Controller, Get, Patch, Param, Body, NotFoundException, ParseUUIDPipe } from "@nestjs/common";
import { ProgramUpdate } from "@qrew/contracts";
import { getProgram, updateProgram, availableCardTypes } from "@qrew/core";
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
    }));
  }

  @Get()
  async current(@Merchant() merchantId: string) {
    const program = await getProgram(merchantId);
    if (!program) throw new NotFoundException("no program");
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
