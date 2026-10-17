import { Module } from "@nestjs/common";
import { ProgramController, ProgramsController } from "./program.controller";

@Module({
  controllers: [ProgramController, ProgramsController],
})
export class ProgramModule {}
