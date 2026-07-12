import { Module } from "@nestjs/common";
import { EnrollController } from "./enroll.controller";

@Module({
  controllers: [EnrollController],
})
export class EnrollModule {}
