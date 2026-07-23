import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ClerkTokenVerifier } from "./clerk-verifier";
import { ClerkAuthGuard } from "./clerk-auth.guard";
import { RolesGuard } from "./roles.guard";

/**
 * Registers both guards globally (order = registration order → auth first, then roles) and makes
 * ClerkTokenVerifier injectable app-wide. @Global so any module can inject the verifier.
 */
@Global()
@Module({
  providers: [
    ClerkTokenVerifier,
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [ClerkTokenVerifier],
})
export class AuthModule {}
