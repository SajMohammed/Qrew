import { Controller, Get, Patch, Param, Body, NotFoundException } from "@nestjs/common";
import { ProgramUpdate } from "@qrew/contracts";
import { getProgram, updateProgram } from "@qrew/core";
import { Merchant, Roles } from "../auth/auth.decorators";

@Controller("program")
export class ProgramController {
  @Get()
  async current(@Merchant() merchantId: string) {
    const program = await getProgram(merchantId);
    if (!program) throw new NotFoundException("no program");
    return program;
  }

  // Editing the card design is an owner/manager action; cashiers can't reach it.
  @Roles("owner", "manager")
  @Patch(":id")
  async update(@Merchant() merchantId: string, @Param("id") id: string, @Body() body: unknown) {
    const patch = ProgramUpdate.parse(body);
    const program = await updateProgram(merchantId, id, patch);
    if (!program) throw new NotFoundException("program not found");
    return program;
  }
}
