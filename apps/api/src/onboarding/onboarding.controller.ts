import { Controller, Post, Body } from "@nestjs/common";
import { OnboardingRequest } from "@qrew/contracts";
import { provisionMerchantForOwner } from "@qrew/db";
import { createDefaultProgram } from "@qrew/core";
import { AllowNoMerchant, Auth } from "../auth/auth.decorators";
import type { AuthContext } from "../auth/request-context";

// Authenticated but merchant-less: a signed-in Clerk user with no staff row yet. The dashboard
// calls this after the guard answers 409 needs_onboarding. Idempotent (safe to retry).
@Controller("onboarding")
export class OnboardingController {
  @AllowNoMerchant()
  @Post()
  async onboard(@Auth() auth: AuthContext, @Body() body: unknown) {
    const input = OnboardingRequest.parse(body);
    const merchantId = await provisionMerchantForOwner({
      userId: auth.userId,
      name: input.businessName ?? "My Shop",
    });
    const program = await createDefaultProgram(merchantId);
    return { merchantId, program };
  }
}
