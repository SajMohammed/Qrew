import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

setup.describe.configure({ mode: "serial" });

// Fetches a Clerk testing token, which lets the journeys past the sign-up CAPTCHA.
setup("clerk", async () => {
  await clerkSetup();
});
