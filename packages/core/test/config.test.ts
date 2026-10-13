import { describe, it, expect } from "vitest";
import { configProblems, assertDeployableConfig } from "../src/config";

/** A complete, valid deployed environment — each test breaks one thing about it. */
const DEPLOYED = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://owner:pw@db.internal:5432/qrew",
  DATABASE_URL_APP: "postgres://qrew_app:pw@db.internal:5432/qrew",
  REDIS_URL: "redis://cache.internal:6379",
  PUBLIC_API_URL: "https://api.qrewclub.com",
  WALLET_PROVIDER: "google",
  GOOGLE_WALLET_ISSUER_ID: "3388000000022000000",
  GOOGLE_WALLET_SA_EMAIL: "wallet@qrew.iam.gserviceaccount.com",
  GOOGLE_WALLET_SA_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
  GOOGLE_WALLET_LOGO_URL: "https://qrewclub.com/logo.png",
  GOOGLE_WALLET_ORIGINS: "https://my.qrewclub.com",
  CARD_TOKEN_SECRET: "a".repeat(64),
  STAFF_TOKEN_SECRET: "b".repeat(64),
  CUSTOMER_TOKEN_SECRET: "c".repeat(64),
  CLERK_SECRET_KEY: "sk_live_abc",
  GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
  CORS_ORIGINS: "https://app.qrewclub.com,https://my.qrewclub.com",
};

const without = (name: keyof typeof DEPLOYED) => ({ ...DEPLOYED, [name]: undefined });

describe("deployable config (fail-closed)", () => {
  it("accepts a complete deployed environment", () => {
    expect(configProblems("api", DEPLOYED)).toEqual([]);
    expect(configProblems("worker", DEPLOYED)).toEqual([]);
    expect(() => assertDeployableConfig("api", DEPLOYED)).not.toThrow();
  });

  it("lets development and test run on their defaults", () => {
    expect(configProblems("api", { NODE_ENV: "development" })).toEqual([]);
    expect(configProblems("worker", { NODE_ENV: "test" })).toEqual([]);
  });

  it("treats an unset NODE_ENV as deployed, not as development", () => {
    expect(configProblems("api", {}).length).toBeGreaterThan(5);
  });

  it.each([
    "DATABASE_URL_APP",
    "REDIS_URL",
    "PUBLIC_API_URL",
    "CLERK_SECRET_KEY",
    "GOOGLE_CLIENT_ID",
    "CORS_ORIGINS",
    "GOOGLE_WALLET_SA_PRIVATE_KEY",
    "GOOGLE_WALLET_ORIGINS",
  ] as const)("refuses an API without %s", (name) => {
    expect(configProblems("api", without(name)).join("\n")).toContain(name);
  });

  it("refuses the fake wallet provider, or none at all", () => {
    expect(configProblems("api", { ...DEPLOYED, WALLET_PROVIDER: "fake" }).join()).toContain("WALLET_PROVIDER");
    expect(configProblems("worker", without("WALLET_PROVIDER")).join()).toContain("WALLET_PROVIDER");
  });

  it("refuses token secrets that are unset or the public development default", () => {
    const problems = configProblems("api", {
      ...DEPLOYED,
      STAFF_TOKEN_SECRET: undefined,
      CARD_TOKEN_SECRET: "dev-card-token-secret-change-me",
    });
    expect(problems.join("\n")).toContain("STAFF_TOKEN_SECRET");
    expect(problems.join("\n")).toContain("CARD_TOKEN_SECRET");
  });

  it("needs public URLs to be https", () => {
    expect(configProblems("api", { ...DEPLOYED, PUBLIC_API_URL: "http://api.qrewclub.com" }).join()).toContain(
      "PUBLIC_API_URL must be an https:// URL",
    );
  });

  it("refuses the auth dev bypass outside development", () => {
    expect(configProblems("api", { ...DEPLOYED, AUTH_DEV_BYPASS: "true" }).join()).toContain("AUTH_DEV_BYPASS");
  });

  it("asks the worker only for what the worker uses", () => {
    const workerEnv = { ...DEPLOYED, CLERK_SECRET_KEY: undefined, GOOGLE_CLIENT_ID: undefined, CORS_ORIGINS: undefined };
    expect(configProblems("worker", workerEnv)).toEqual([]);
  });

  it("names every problem at once, not just the first", () => {
    expect(() => assertDeployableConfig("api", { NODE_ENV: "production" })).toThrow(
      /REDIS_URL[\s\S]*CLERK_SECRET_KEY[\s\S]*CORS_ORIGINS/,
    );
  });
});
