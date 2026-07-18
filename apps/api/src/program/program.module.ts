import { Module } from "@nestjs/common";
import { ProgramController } from "./program.controller";

@Module({
  controllers: [ProgramController],
})
export class ProgramModule {}
