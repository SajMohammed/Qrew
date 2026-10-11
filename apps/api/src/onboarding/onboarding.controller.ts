import { Controller, Post, Body } from "@nestjs/common";
import { OnboardingRequest } from "@qrew/contracts";
import { provisionMerchantForOwner } from "@qrew/db";
import { createDefaultProgram } from "@qrew/core";
import { AllowNoMerchant, Auth } from "../auth/auth.decorators";
import type { AuthContext } from "../auth/request-context";

// Authenticated but merchant-less: a signed-in Clerk user with no staff row yet. The shop app asks
// the owner to name their shop after the guard answers 409 needs_onboarding, then calls this — there
// is no default name. Idempotent: a repeat call returns the existing shop without renaming it (that
// is PATCH /merchant's job). A missing or invalid name is a 400 carrying the reason.
@Controller("onboarding")
export class OnboardingController {
  @AllowNoMerchant()
  @Post()
  async onboard(@Auth() auth: AuthContext, @Body() body: unknown) {
    const { businessName } = OnboardingRequest.parse(body);
    const merchantId = await provisionMerchantForOwner({ userId: auth.userId, name: businessName });
    const program = await createDefaultProgram(merchantId);
    return { merchantId, program };
  }
}
