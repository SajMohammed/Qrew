import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UnauthorizedException,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import { ProgramUpdate } from "@qrew/contracts";
import { getProgram, updateProgram } from "@qrew/core";

@Controller("program")
export class ProgramController {
  @Get()
  async current(@Req() req: Request) {
    const program = await getProgram(this.tenant(req));
    if (!program) throw new NotFoundException("no program");
    return program;
  }

  @Patch(":id")
  async update(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const patch = ProgramUpdate.parse(body);
    const program = await updateProgram(this.tenant(req), id, patch);
    if (!program) throw new NotFoundException("program not found");
    return program;
  }

  private tenant(req: Request): string {
    if (!req.merchantId) throw new UnauthorizedException("no tenant resolved");
    return req.merchantId;
  }
}
