import { Module } from "@nestjs/common";
import { AssetController } from "./asset.controller";

@Module({
  controllers: [AssetController],
})
export class AssetModule {}
