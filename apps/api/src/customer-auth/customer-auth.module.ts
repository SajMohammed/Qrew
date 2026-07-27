import { Module } from "@nestjs/common";
import { CustomerAuthController } from "./customer-auth.controller";
import { MeController } from "./me.controller";
import { GoogleTokenVerifier } from "./google-verifier";
import { CustomerAuthGuard } from "./customer-auth.guard";

// Consumer identity: social sign-in + the signed-in customer's cross-merchant card view. Kept
// deliberately separate from the Clerk staff auth module.
@Module({
  controllers: [CustomerAuthController, MeController],
  providers: [GoogleTokenVerifier, CustomerAuthGuard],
})
export class CustomerAuthModule {}
